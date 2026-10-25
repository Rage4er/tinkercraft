// ============================================================
// .3dtc формат — ZIP-архив с model.json + thumbnail.png
// (Фаза 8.5, Этап 8.5.4 — заменяет .doodle)
//
// model.json:
//   { version: "3dtc-v1", fileName, operationsTrimmed, objects, operations }
//
// Конвенция данных (ARCHITECTURE_RENDER.md §1):
//   SceneObject.vertices — ВСЕГДА в origin (COM)
//   SceneObject.transform — мировой pivot
//   world = T(pos) · R(XYZ) · S · v   (render = data)
//
// TypedArray (Float32Array/Uint32Array) сериализуются в base64 —
// компактно, без потерь точности, без JSON-объектов {"0":1.5,...}.
// ============================================================

import JSZip from 'jszip'
import type { SceneObject, TinkerCraftOperation } from '../csg/types'

export interface ThreeDtcDocument {
  objects: Record<string, SceneObject>
  operations: TinkerCraftOperation[]
  operationsTrimmed: boolean
  fileName?: string
  thumbnail?: string   // base64 PNG data-URL
}

const FORMAT_VERSION = '3dtc-v1'
/** Максимальный размер model.json (64 МБ) для защиты от DoS */
const MAX_MODEL_JSON_SIZE = 64 * 1024 * 1024
/** Максимальный размер .3dtc файла (50 МБ) для защиты от ZIP bomb */
const MAX_3DTC_SIZE = 50 * 1024 * 1024
/** MAX_RECURSION_DEPTH: защита от stack overflow при рекурсивной валидации */
const MAX_RECURSION_DEPTH = 1000

// ────────────────────────────────────────────────────────────
// Безопасность (перенесено из doodle-io.ts)
// ────────────────────────────────────────────────────────────

const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

function validateObjectKeys(obj: unknown, path: string, depth = 0): void {
  if (depth > MAX_RECURSION_DEPTH) {
    throw new Error(`Некорректный model.json: слишком глубокая вложенность (>${MAX_RECURSION_DEPTH}) по пути "${path}"`)
  }
  if (typeof obj !== 'object' || obj === null) return
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) validateObjectKeys(obj[i], `${path}[${i}]`, depth + 1)
    return
  }
  for (const key of Object.keys(obj as Record<string, unknown>)) {
    if (UNSAFE_KEYS.has(key)) {
      throw new Error(`Некорректный model.json: обнаружен небезопасный ключ "${key}" по пути "${path}"`)
    }
    validateObjectKeys((obj as Record<string, unknown>)[key], path ? `${path}.${key}` : key, depth + 1)
  }
}

function sanitizeObjectKeys(obj: unknown): unknown {
  if (typeof obj !== 'object' || obj === null) return obj
  if (Array.isArray(obj)) return obj.map(sanitizeObjectKeys)
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (UNSAFE_KEYS.has(key)) continue
    result[key] = sanitizeObjectKeys(value)
  }
  return result
}

const VALID_OP_TYPES = new Set([
  'add_shape', 'import_mesh', 'move', 'resize_dims', 'fillet',
  'mirror', 'align', 'group', 'delete', 'visibility', 'color', 'rename',
])

// ────────────────────────────────────────────────────────────
// Base64 ↔ TypedArray helpers
// ────────────────────────────────────────────────────────────

/** Uint8Array → base64 (chunked, для больших массивов) */
function u8ToBase64(u8: Uint8Array): string {
  const CHUNK = 8192
  let binary = ''
  for (let i = 0; i < u8.length; i += CHUNK) {
    binary += String.fromCharCode(...u8.subarray(i, Math.min(i + CHUNK, u8.length)))
  }
  return btoa(binary)
}

/** base64 → Uint8Array */
function base64ToU8(b64: string): Uint8Array {
  const binary = atob(b64)
  const u8 = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) u8[i] = binary.charCodeAt(i)
  return u8
}

/**
 * Маркер сериализованного TypedArray в JSON.
 * { __t: 'f32'|'u32', d: '<base64>' }
 */
interface SerializedTA {
  __t: 'f32' | 'u32'
  d: string
}

function isSerializedTA(v: unknown): v is SerializedTA {
  return (
    typeof v === 'object' && v !== null &&
    '__t' in v && 'd' in v &&
    ((v as SerializedTA).__t === 'f32' || (v as SerializedTA).__t === 'u32') &&
    typeof (v as SerializedTA).d === 'string'
  )
}

function encodeTA(ta: Float32Array | Uint32Array): SerializedTA {
  const u8 = new Uint8Array(ta.buffer, ta.byteOffset, ta.byteLength)
  return { __t: ta instanceof Float32Array ? 'f32' : 'u32', d: u8ToBase64(u8) }
}

function decodeTA(s: SerializedTA): Float32Array | Uint32Array {
  const u8 = base64ToU8(s.d)
  if (s.__t === 'f32') {
    // Копируем в новый буфер, чтобы не зависеть от выравнивания u8
    const f32 = new Float32Array(u8.length / 4)
    new Uint8Array(f32.buffer).set(u8)
    return f32
  }
  const u32 = new Uint32Array(u8.length / 4)
  new Uint8Array(u32.buffer).set(u8)
  return u32
}

// ────────────────────────────────────────────────────────────
// Рекурсивная замена TypedArray ↔ SerializedTA
// ────────────────────────────────────────────────────────────

/** Перед JSON.stringify: заменить все TypedArray на SerializedTA */
function encodeTypedArrays(obj: unknown): unknown {
  if (obj instanceof Float32Array || obj instanceof Uint32Array) return encodeTA(obj)
  if (obj === null || typeof obj !== 'object') return obj
  if (Array.isArray(obj)) return obj.map(encodeTypedArrays)
  const result: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    result[k] = encodeTypedArrays(v)
  }
  return result
}

/** После JSON.parse: восстановить SerializedTA → TypedArray */
function decodeTypedArrays(obj: unknown): unknown {
  if (isSerializedTA(obj)) return decodeTA(obj)
  if (obj === null || typeof obj !== 'object') return obj
  if (Array.isArray(obj)) return obj.map(decodeTypedArrays)
  const result: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    result[k] = decodeTypedArrays(v)
  }
  return result
}

// ────────────────────────────────────────────────────────────
// Операции: TypedArray ↔ number[] (совместимость с rebuildFromHistory)
// ────────────────────────────────────────────────────────────

/**
 * rebuildFromHistory / worker-handlers ожидают number[] для
 * vertices/indices/resultVertices/resultIndices/resultNormals в операциях.
 * После decodeTypedArrays() они могут быть TypedArray — конвертируем.
 */
function taToNumArray(v: unknown): number[] | undefined {
  if (v == null) return undefined
  if (Array.isArray(v)) return v as number[]
  if (v instanceof Float32Array || v instanceof Uint32Array) return Array.from(v)
  return undefined
}

function restoreOperationMeshArrays(operations: TinkerCraftOperation[]): void {
  for (const op of operations) {
    if (op.type === 'group') {
      const g = op as import('../csg/types').GroupOperation
      const rv = taToNumArray(g.resultVertices)
      const ri = taToNumArray(g.resultIndices)
      const rn = taToNumArray(g.resultNormals)
      if (rv) g.resultVertices = rv
      if (ri) g.resultIndices = ri
      if (rn !== undefined) g.resultNormals = rn
    } else if (op.type === 'import_mesh') {
      const im = op as import('../csg/types').ImportMeshOperation
      const v = taToNumArray(im.vertices)
      const i = taToNumArray(im.indices)
      if (v) im.vertices = v
      if (i) im.indices = i
    }
  }
}

// ────────────────────────────────────────────────────────────
// SceneObject: TypedArray restoration после JSON round-trip
// ────────────────────────────────────────────────────────────

/**
 * После decodeTypedArrays() vertices/indices/normals в SceneObject уже
 * Float32Array/Uint32Array. Но если файл создан doodle-io (plain array),
 * конвертируем plain number[] → TypedArray.
 */
function restoreSceneObjects(objects: Record<string, unknown>): Record<string, SceneObject> {
  for (const id of Object.keys(objects)) {
    const o = objects[id] as Record<string, unknown>
    if (o.vertices !== undefined) {
      const v = o.vertices
      if (!(v instanceof Float32Array)) {
        o.vertices = new Float32Array(Array.isArray(v) ? v : [])
      }
    }
    if (o.indices !== undefined) {
      const idx = o.indices
      if (!(idx instanceof Uint32Array)) {
        o.indices = new Uint32Array(Array.isArray(idx) ? idx : [])
      }
    }
    if (o.normals !== undefined && o.normals !== null) {
      const n = o.normals
      if (!(n instanceof Float32Array)) {
        o.normals = new Float32Array(Array.isArray(n) ? n : [])
      }
    }
  }
  return objects as unknown as Record<string, SceneObject>
}

// ────────────────────────────────────────────────────────────
// Публичный API
// ────────────────────────────────────────────────────────────

/**
 * Сериализовать документ в Blob (.3dtc ZIP-архив).
 *
 * model.json: { version: "3dtc-v1", fileName, operationsTrimmed, objects, operations }
 * thumbnail.png: PNG или 1×1 прозрачный placeholder.
 */
export async function serialize3dtc(doc: ThreeDtcDocument): Promise<Blob> {
  const zip = new JSZip()

  const model = {
    version: FORMAT_VERSION,
    fileName: doc.fileName,
    operationsTrimmed: doc.operationsTrimmed,
    objects: encodeTypedArrays(doc.objects),
    operations: encodeTypedArrays(doc.operations),
  }

  zip.file('model.json', JSON.stringify(model, null, 2))

  if (doc.thumbnail) {
    const base64 = doc.thumbnail.replace(/^data:image\/\w+;base64,/, '')
    zip.file('thumbnail.png', base64, { base64: true })
  } else {
    zip.file('thumbnail.png', TRANSPARENT_PNG, { base64: true })
  }

  return zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  })
}

/**
 * Разобрать Blob/ArrayBuffer (.3dtc) в ThreeDtcDocument.
 *
 * Валидирует: размер, ZIP, prototype-pollution, схема операций, version.
 * TypedArray восстанавливаются из base64; операции приводятся к number[].
 */
export async function parse3dtc(source: Blob | ArrayBuffer): Promise<ThreeDtcDocument> {
  const buffer = source instanceof Blob ? await source.arrayBuffer() : source

  if (buffer.byteLength > MAX_3DTC_SIZE) {
    throw new Error(
      `Некорректный .3dtc: размер ${buffer.byteLength} байт превышает лимит ${MAX_3DTC_SIZE} байт`,
    )
  }

  const zip = await JSZip.loadAsync(buffer)

  const modelFile = zip.file('model.json')
  if (!modelFile) throw new Error('Некорректный .3dtc: model.json не найден')

  const json = await modelFile.async('string')
  if (typeof json !== 'string') {
    throw new Error('Некорректный model.json: не является строкой')
  }
  if (json.length > MAX_MODEL_JSON_SIZE) {
    throw new Error(
      `Некорректный model.json: размер ${json.length} байт превышает лимит ${MAX_MODEL_JSON_SIZE} байт`,
    )
  }

  const raw = JSON.parse(json)
  validateObjectKeys(raw, '')
  const sanitized = sanitizeObjectKeys(raw) as typeof raw

  if (sanitized.version !== FORMAT_VERSION) {
    throw new Error(
      `Неподдерживаемая версия формата "${sanitized.version}". Ожидается "${FORMAT_VERSION}".`,
    )
  }

  if (!Array.isArray(sanitized.operations)) {
    throw new Error('Некорректный model.json: отсутствует массив operations')
  }

  const operations = sanitized.operations as TinkerCraftOperation[]
  if (!operations.every(op => op && typeof op === 'object' && VALID_OP_TYPES.has((op as { type?: string }).type ?? ''))) {
    throw new Error('Некорректный model.json: обнаружена операция с неизвестным типом')
  }

  // decodeTypedArrays: SerializedTA → Float32Array/Uint32Array
  const decodedOps = decodeTypedArrays(operations) as TinkerCraftOperation[]
  // Восстанавливаем number[] для совместимости с rebuildFromHistory
  restoreOperationMeshArrays(decodedOps)

  const decodedObjs = decodeTypedArrays(sanitized.objects ?? {}) as Record<string, unknown>
  const objects = restoreSceneObjects(decodedObjs)

  let thumbnail: string | undefined
  const thumbFile = zip.file('thumbnail.png')
  if (thumbFile) {
    const thumbBytes = await thumbFile.async('base64')
    thumbnail = `data:image/png;base64,${thumbBytes}`
  }

  return {
    objects,
    operations: decodedOps,
    operationsTrimmed: Boolean(sanitized.operationsTrimmed),
    fileName: typeof sanitized.fileName === 'string' ? sanitized.fileName : undefined,
    thumbnail,
  }
}

// ────────────────────────────────────────────────────────────
// File picker / download helpers
// ────────────────────────────────────────────────────────────

export function open3dtcFilePicker(): Promise<{ file: File; buffer: ArrayBuffer } | null> {
  return new Promise(resolve => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.3dtc,.zip'
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

export { downloadBlob } from './doodle-io'

// 1×1 прозрачный PNG в base64
const TRANSPARENT_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
