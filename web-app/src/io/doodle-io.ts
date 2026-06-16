// ============================================================
// .doodle формат — ZIP-архив с model.json + thumbnail.png
// Совместимость с оригинальным Java CaDoodleFile.
// ============================================================

import JSZip from 'jszip'
import type { CaDoodleFile, CaDoodleOperation } from '../csg/types'

const FORMAT_VERSION = '1.0.0'

// ---- Разобрать .doodle файл ----

export async function parseDoodle(buffer: ArrayBuffer): Promise<CaDoodleFile> {
  const zip = await JSZip.loadAsync(buffer)

  const modelFile = zip.file('model.json')
  if (!modelFile) throw new Error('Некорректный .doodle: model.json не найден')

  const json = await modelFile.async('string')
  const raw = JSON.parse(json)

  // Поддержка обоих форматов: { version, operations } или просто массив операций
  let operations: CaDoodleOperation[]
  let version = FORMAT_VERSION

  if (Array.isArray(raw)) {
    operations = raw as CaDoodleOperation[]
  } else if (raw && Array.isArray(raw.operations)) {
    operations = raw.operations as CaDoodleOperation[]
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
  operations: CaDoodleOperation[],
  thumbnailDataUrl?: string,
): Promise<Blob> {
  const zip = new JSZip()

  const doc: CaDoodleFile = {
    version: FORMAT_VERSION,
    operations,
  }
  zip.file('model.json', JSON.stringify(doc, null, 2))

  if (thumbnailDataUrl) {
    // Убираем data:image/png;base64, префикс
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
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  URL.revokeObjectURL(url)
}

// 1×1 прозрачный PNG в base64
const TRANSPARENT_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
