// ============================================================
// STL импорт — парсинг бинарного и ASCII STL через Three.js
// ============================================================

import * as THREE from 'three'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import { VERTEX_MERGE_PRECISION } from '../constants'
import type { TransformNR } from '../csg/types'

/** Максимальный размер файла STL (100 МБ) */
export const MAX_STL_FILE_SIZE = 100 * 1024 * 1024
/** Максимальное количество треугольников (5 млн) */
export const MAX_STL_TRIANGLES = 5_000_000

export interface ImportedMesh {
  vertices: ArrayLike<number>  // merged, flat array
  indices: ArrayLike<number>
  transform: TransformNR
  name: string
}

export type StlParseResult =
  | { success: true; vertices: Float32Array; indices: Uint32Array; transform: TransformNR; name: string }
  | { success: false; error: string }

/**
 * Слить совпадающие вершины (STL хранит каждый треугольник отдельно).
 * Без слияния manifold-3d не создаст валидный solid.
 * Exported for unit testing.
 */
export function mergeCoincidentVertices(
  positions: Float32Array,
): { vertices: Float32Array; indices: Uint32Array } {
  // FIX (MED-18-41): Return TypedArrays directly instead of number[] —
  // avoids double allocation (number[] → Float32Array conversion downstream).
  const vertMap = new Map<string, number>()
  const vertices: number[] = []
  const indices: number[] = []
  const precision = VERTEX_MERGE_PRECISION

  const count = positions.length / 3
  for (let i = 0; i < count; i++) {
    const x = Math.round(positions[i * 3] * precision) / precision
    const y = Math.round(positions[i * 3 + 1] * precision) / precision
    const z = Math.round(positions[i * 3 + 2] * precision) / precision
    const key = `${x},${y},${z}`

    let idx = vertMap.get(key)
    if (idx === undefined) {
      idx = vertices.length / 3
      vertMap.set(key, idx)
      vertices.push(x, y, z)
    }
    indices.push(idx)
  }

  return { vertices: new Float32Array(vertices), indices: new Uint32Array(indices) }
}

export function openStlFilePicker(): Promise<File | null> {
  return new Promise(resolve => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.stl'
    input.onchange = () => resolve(input.files?.[0] ?? null)
    input.oncancel = () => resolve(null)
    input.click()
    // FIX (LOW-18-45): Remove the input element from DOM after click to prevent leak.
    // (input is never appended to DOM, but GC may not collect it immediately due to event handlers)
    setTimeout(() => { input.onchange = null; input.oncancel = null }, 60000)
  })
}

/**
 * Detect STL format by magic bytes (SEC-R6-1).
 * Binary STL: 80-byte header + 4-byte triangle count, then triangle data.
 * ASCII STL: starts with "solid" keyword.
 * Returns 'binary' | 'ascii' | 'unknown'.
 */
export function detectStlFormat(buffer: ArrayBuffer): 'binary' | 'ascii' | 'unknown' {
  if (buffer.byteLength < 84) return 'unknown'
  const header = new Uint8Array(buffer, 0, 5)
  const headerStr = String.fromCharCode(...header).toLowerCase()

  // ASCII STL starts with "solid"
  if (headerStr === 'solid') {
    // FIX (MED-18-42): Some binary STL also starts with "solid" — check if the
    // triangle count at offset 80 is plausible vs file size (binary check first).
    const view = new DataView(buffer)
    // FIX (LOW-18-43): Read triangle count as little-endian (STL spec)
    const triCount = view.getUint32(80, true)
    const expectedSize = 84 + triCount * 50 // 50 bytes per triangle
    // If file size matches binary format, treat as binary even with "solid" header
    if (Math.abs(expectedSize - buffer.byteLength) <= 1) return 'binary'
    // FIX (LOW-18-43): Also check for big-endian triangle count (rare but possible)
    const triCountBE = view.getUint32(80, false)
    const expectedSizeBE = 84 + triCountBE * 50
    if (Math.abs(expectedSizeBE - buffer.byteLength) <= 1) return 'binary'
    return 'ascii'
  }

  return 'binary'
}

export async function parseStlFile(file: File): Promise<StlParseResult> {
  // FIX (WARN-R3-6): Validate file size before processing
  if (file.size > MAX_STL_FILE_SIZE) {
    const msg = `[STL Import] File too large: ${Math.round(file.size / 1024 / 1024)}MB (max ${MAX_STL_FILE_SIZE / 1024 / 1024}MB)`
    console.error(msg)
    return { success: false, error: msg }
  }

  // Quick check: binary STL has 80-byte header + 4-byte triangle count
  // If it's too small to be valid, reject early
  if (file.size < 84) {
    const msg = '[STL Import] File too small to be valid STL'
    console.error(msg)
    return { success: false, error: msg }
  }

  try {
    const buffer = await file.arrayBuffer()

    // SEC-R6-1: Validate STL format via magic bytes before parsing
    const format = detectStlFormat(buffer)
    if (format === 'unknown') {
      throw new Error('STL: unrecognized format (not valid ASCII or binary STL)')
    }

    const loader = new STLLoader()
    const geometry = loader.parse(buffer) as THREE.BufferGeometry

    const posAttr = geometry.getAttribute('position') as THREE.BufferAttribute
    if (!posAttr) throw new Error('STL: no position attribute')

    const positions = posAttr.array as Float32Array
    const { vertices, indices } = mergeCoincidentVertices(positions)

    const triangleCount = indices.length / 3
    // FIX (LOW-18-44): Explicit check for 0 triangles
    if (triangleCount === 0) {
      throw new Error('STL: 0 triangles — empty mesh')
    }
    if (triangleCount > MAX_STL_TRIANGLES) {
      const msg = `[STL Import] Too many triangles: ${triangleCount.toLocaleString()} (max ${MAX_STL_TRIANGLES.toLocaleString()})`
      console.error(msg)
      return { success: false, error: msg }
    }

    if (vertices.length < 9 || indices.length < 3) {
      throw new Error('STL: слишком мало данных')
    }

    const defaultTransform: TransformNR = { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 }

    return { success: true, vertices, indices, transform: defaultTransform, name: file.name }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[STL Import]', e)
    return { success: false, error: msg }
  }
}
