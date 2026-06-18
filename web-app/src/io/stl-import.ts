// ============================================================
// STL импорт — парсинг бинарного и ASCII STL через Three.js
// ============================================================

import * as THREE from 'three'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import type { TransformNR } from '../csg/types'

export interface ImportedMesh {
  vertices: number[]  // merged, flat array
  indices:  number[]
  transform: TransformNR
  name: string
}

/**
 * Слить совпадающие вершины (STL хранит каждый треугольник отдельно).
 * Без слияния manifold-3d не создаст валидный solid.
 */
function mergeCoincidentVertices(
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
  try {
    const buffer   = await file.arrayBuffer()
    const loader   = new STLLoader()
    const geometry = loader.parse(buffer) as THREE.BufferGeometry

    const posAttr = geometry.getAttribute('position') as THREE.BufferAttribute
    if (!posAttr) throw new Error('STL: no position attribute')

    const positions = posAttr.array as Float32Array
    const { vertices, indices } = mergeCoincidentVertices(positions)

    if (vertices.length < 9 || indices.length < 3) {
      throw new Error('STL: слишком мало данных')
    }

    const defaultTransform: TransformNR = { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0 }

    return { vertices, indices, transform: defaultTransform, name: file.name }
  } catch (e) {
    console.error('[STL Import]', e)
    return null
  }
}
