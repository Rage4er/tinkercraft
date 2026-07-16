// ============================================================
// STL импорт — парсинг бинарного и ASCII STL через Three.js
// ============================================================

import * as THREE from 'three'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import type { TransformNR } from '../csg/types'

/** Максимальный размер файла STL (100 МБ) */
export const MAX_STL_FILE_SIZE = 100 * 1024 * 1024
/** Максимальное количество треугольников (5 млн) */
export const MAX_STL_TRIANGLES = 5_000_000

export interface ImportedMesh {
  vertices: number[]  // merged, flat array
  indices:  number[]
  transform: TransformNR
  name: string
}

/**
 * Слить совпадающие вершины (STL хранит каждый треугольник отдельно).
 * Без слияния manifold-3d не создаст валидный solid.
 * Exported for unit testing.
 */
export function mergeCoincidentVertices(
  positions: Float32Array,
): { vertices: number[]; indices: number[] } {
  const vertMap = new Map<string, number>()
  const vertices: number[] = []
  const indices:  number[] = []
  const precision = 1e5

  const count = positions.length / 3
  for (let i = 0; i < count; i++) {
    const x = Math.round(positions[i * 3]     * precision) / precision
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

  return { vertices, indices }
}

export function openStlFilePicker(): Promise<File | null> {
  return new Promise(resolve => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.stl'
    input.onchange  = () => resolve(input.files?.[0] ?? null)
    input.oncancel  = () => resolve(null)
    input.click()
  })
}

export async function parseStlFile(file: File): Promise<ImportedMesh | null> {
  // FIX (WARN-R3-6): Validate file size before processing
  if (file.size > MAX_STL_FILE_SIZE) {
    console.error(`[STL Import] File too large: ${Math.round(file.size / 1024 / 1024)}MB (max ${MAX_STL_FILE_SIZE / 1024 / 1024}MB)`)
    return null
  }

  // Quick check: binary STL has 80-byte header + 4-byte triangle count
  // If it's too small to be valid, reject early
  if (file.size < 84) {
    console.error('[STL Import] File too small to be valid STL')
    return null
  }

  try {
    const buffer   = await file.arrayBuffer()
    const loader   = new STLLoader()
    const geometry = loader.parse(buffer) as THREE.BufferGeometry

    const posAttr = geometry.getAttribute('position') as THREE.BufferAttribute
    if (!posAttr) throw new Error('STL: no position attribute')

    const positions = posAttr.array as Float32Array
    const { vertices, indices } = mergeCoincidentVertices(positions)

    const triangleCount = indices.length / 3
    if (triangleCount > MAX_STL_TRIANGLES) {
      console.error(`[STL Import] Too many triangles: ${triangleCount.toLocaleString()} (max ${MAX_STL_TRIANGLES.toLocaleString()})`)
      return null
    }

    if (vertices.length < 9 || indices.length < 3) {
      throw new Error('STL: слишком мало данных')
    }

    const defaultTransform: TransformNR = { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 }

    return { vertices, indices, transform: defaultTransform, name: file.name }
  } catch (e) {
    console.error('[STL Import]', e)
    return null
  }
}
