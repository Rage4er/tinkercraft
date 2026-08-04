// ============================================================
// .doodle формат — ZIP-архив с model.json + thumbnail.png
// Compatibility with original Java TinkerCraftFile.
// ============================================================

import JSZip from 'jszip'
import type { TinkerCraftFile, TinkerCraftOperation } from '../csg/types'

const FORMAT_VERSION = '1.0.0'
/** Максимальный размер model.json (5 МБ) для защиты от DoS */
const MAX_MODEL_JSON_SIZE = 5 * 1024 * 1024
/** SEC-R8-1: Максимальный размер .doodle файла (50 МБ) для защиты от ZIP bomb */
const MAX_DOODLE_SIZE = 50 * 1024 * 1024
/** MAX_RECURSION_DEPTH: защита от stack overflow при рекурсивной валидации */
const MAX_RECURSION_DEPTH = 1000

/** Ключи, которые могут привести к prototype pollution через JSON.parse. */
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

/**
 * CRIT-R8-3: Рекурсивная валидация ключей объекта после JSON.parse.
 * Проверяет именно ключи объектов, а не подстроки в тексте,
 * чтобы избежать ложных срабатываний на легитимных данных.
 */
function validateObjectKeys(obj: unknown, path: string, depth: number = 0): void {
  if (depth > MAX_RECURSION_DEPTH) {
    throw new Error(`Некорректный model.json: слишком глубокая вложенность (>${MAX_RECURSION_DEPTH}) по пути "${path}"`)
  }
  if (typeof obj !== 'object' || obj === null) return
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      validateObjectKeys(obj[i], `${path}[${i}]`, depth + 1)
    }
    return
  }
  for (const key of Object.keys(obj as Record<string, unknown>)) {
    if (UNSAFE_KEYS.has(key)) {
      throw new Error(`Некорректный model.json: обнаружен небезопасный ключ "${key}" по пути "${path}"`)
    }
    validateObjectKeys((obj as Record<string, unknown>)[key], path ? `${path}.${key}` : key, depth + 1)
  }
}

/** WARN-R8-7: Валидные типы операций для проверки схемы .doodle */
const VALID_OP_TYPES = new Set([
  'add_shape', 'import_mesh', 'move', 'resize_dims', 'fillet',
  'mirror', 'align', 'group', 'delete', 'visibility', 'color', 'rename',
])

// ---- Разобрать .doodle файл ----

export async function parseDoodle(buffer: ArrayBuffer): Promise<TinkerCraftFile> {
  // SEC-R8-1: Проверка размера .doodle файла для защиты от ZIP bomb
  if (buffer.byteLength > MAX_DOODLE_SIZE) {
    throw new Error(
      `Некорректный .doodle: размер ${buffer.byteLength} байт превышает лимит ${MAX_DOODLE_SIZE} байт`,
    )
  }

  const zip = await JSZip.loadAsync(buffer)

  const modelFile = zip.file('model.json')
  if (!modelFile) throw new Error('Некорректный .doodle: model.json не найден')

  const json = await modelFile.async('string')

  // SEC-4: Валидация размера JSON для защиты от DoS
  if (typeof json !== 'string') {
    throw new Error('Некорректный model.json: не является строкой')
  }
  if (json.length > MAX_MODEL_JSON_SIZE) {
    throw new Error(
      `Некорректный model.json: размер ${json.length} байт превышает лимит ${MAX_MODEL_JSON_SIZE} байт`,
    )
  }

  const raw = JSON.parse(json)

  // CRIT-R8-3: Prototype Pollution — проверяем ключи после парсинга, а не подстроки в тексте.
  // Подстроковая проверка давала ложные срабатывания на легитимных именах вроде "constructor_block".
  validateObjectKeys(raw, '')

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

  // WARN-R8-7: Валидация схемы операций — проверка типа каждой операции
  if (!operations.every(op => op && typeof op === 'object' && VALID_OP_TYPES.has((op as { type?: string }).type ?? ''))) {
    throw new Error('Некорректный model.json: обнаружена операция с неизвестным типом')
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
