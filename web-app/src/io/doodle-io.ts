// ============================================================
// .doodle формат — ZIP-архив с model.json + thumbnail.png
// Compatibility with original Java TinkerCraftFile.
// ============================================================

import JSZip from 'jszip'
import type { TinkerCraftFile, TinkerCraftOperation } from '../csg/types'

const FORMAT_VERSION = '1.0.0'
/** Максимальный размер model.json (5 МБ) для защиты от DoS */
const MAX_MODEL_JSON_SIZE = 5 * 1024 * 1024

// ---- Разобрать .doodle файл ----

export async function parseDoodle(buffer: ArrayBuffer): Promise<TinkerCraftFile> {
  const zip = await JSZip.loadAsync(buffer)

  const modelFile = zip.file('model.json')
  if (!modelFile) throw new Error('Некорректный .doodle: model.json не найден')

  const json = await modelFile.async('string')

  // SEC-4: Валидация размера и содержимого JSON для защиты от DoS / Prototype Pollution
  if (typeof json !== 'string') {
    throw new Error('Некорректный model.json: не является строкой')
  }
  if (json.length > MAX_MODEL_JSON_SIZE) {
    throw new Error(
      `Некорректный model.json: размер ${json.length} байт превышает лимит ${MAX_MODEL_JSON_SIZE} байт`,
    )
  }
  // Prototype pollution: проверяем наличие ключевых слов в JSON
  if (
    json.includes('__proto__') ||
    json.includes('constructor') ||
    json.includes('prototype')
  ) {
    throw new Error('Некорректный model.json: обнаружен подозрительный контент')
  }

  const raw = JSON.parse(json)

  // Support both formats: { version, operations } or just an operations array
  let operations: TinkerCraftOperation[]
  let version = FORMAT_VERSION

  if (Array.isArray(raw)) {
    operations = raw as TinkerCraftOperation[]
  } else if (raw && Array.isArray(raw.operations)) {
    operations = raw.operations as TinkerCraftOperation[]
    version = raw.version ?? FORMAT_VERSION
  } else {
    throw new Error('Некорректный model.json: ожидается массив операций или { version, operations }')
  }

  let thumbnail: string | undefined
  const thumbFile = zip.file('thumbnail.png')
  if (thumbFile) {
    const thumbBytes = await thumbFile.async('base64')
    thumbnail = `data:image/png;base64,${thumbBytes}`
  }

  return { version, operations, thumbnail }
}

// ---- Сериализовать в .doodle ----

export async function serializeDoodle(
  operations: TinkerCraftOperation[],
  thumbnailDataUrl?: string,
): Promise<Blob> {
  const zip = new JSZip()

  const doc: TinkerCraftFile = {
    version: FORMAT_VERSION,
    operations,
  }
  zip.file('model.json', JSON.stringify(doc, null, 2))

  if (thumbnailDataUrl) {
    // Strip data:image/png;base64, prefix
    const base64 = thumbnailDataUrl.replace(/^data:image\/\w+;base64,/, '')
    zip.file('thumbnail.png', base64, { base64: true })
  } else {
    // Placeholder 1x1 прозрачный PNG
    zip.file('thumbnail.png', TRANSPARENT_PNG, { base64: true })
  }

  const blob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  })
  return blob
}

// ---- Открыть диалог выбора файла ----

export function openDoodleFilePicker(): Promise<{ file: File; buffer: ArrayBuffer } | null> {
  return new Promise(resolve => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.doodle,.zip'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) { resolve(null); return }
      const buffer = await file.arrayBuffer()
      resolve({ file, buffer })
    }
    input.oncancel = () => resolve(null)
    input.click()
  })
}

// ---- Сохранить Blob как файл ----

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  try {
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    a.click()
  } finally {
    URL.revokeObjectURL(url)
  }
}

// 1×1 прозрачный PNG в base64
const TRANSPARENT_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
