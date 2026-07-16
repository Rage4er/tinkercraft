// ============================================================
// Unit tests — stl-import: mergeCoincidentVertices
// ============================================================

import { describe, it, expect } from 'vitest'
import { mergeCoincidentVertices, MAX_STL_FILE_SIZE, MAX_STL_TRIANGLES } from './stl-import'

describe('mergeCoincidentVertices', () => {
  it('merges identical vertices', () => {
    // Two triangles sharing an edge: v1 is duplicated
    const positions = new Float32Array([
      0, 0, 0,  // v0
      1, 0, 0,  // v1
      1, 0, 0,  // v1 (duplicate!)
      0, 1, 0,  // v2
    ])
    const result = mergeCoincidentVertices(positions)
    // 3 unique vertices × 3 components
    expect(result.vertices).toHaveLength(9)
    expect(result.indices).toHaveLength(4) // 2 triangles (but shared vertex merged)
  })

  it('rounds near-identical vertices to same key', () => {
    const positions = new Float32Array([
      0.000001, 0, 0,
      0.000002, 0, 0, // rounds to same as above (precision 1e5)
      1, 0, 0,
    ])
    const result = mergeCoincidentVertices(positions)
    // 2 unique vertices after rounding
    expect(result.vertices).toHaveLength(6)
  })

  it('preserves all triangles when no duplicates', () => {
    // A single triangle with 3 distinct vertices
    const positions = new Float32Array([
      0, 0, 0,
      1, 0, 0,
      0, 1, 0,
    ])
    const result = mergeCoincidentVertices(positions)
    expect(result.vertices).toHaveLength(9)
    expect(result.indices).toEqual([0, 1, 2])
  })

  it('handles a cube (12 triangles, 8 unique vertices)', () => {
    // 36 vertices for 12 triangles, but only 8 unique cube corners
    const corners = [
      [0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], // bottom
      [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1], // top
    ]
    const tris = [
      [0, 1, 2], [0, 2, 3], // bottom
      [4, 6, 5], [4, 7, 6], // top
      [0, 5, 1], [0, 4, 5], // front
      [1, 6, 2], [1, 5, 6], // right
      [2, 7, 3], [2, 6, 7], // back
      [3, 4, 0], [3, 7, 4], // left
    ]
    const positions = new Float32Array(
      tris.flatMap(t => t.flatMap(i => corners[i])),
    )
    const result = mergeCoincidentVertices(positions)
    expect(result.vertices).toHaveLength(24) // 8 vertices × 3
    expect(result.indices).toHaveLength(36)  // 12 triangles × 3
  })
})

describe('STL import limits', () => {
  it('exports MAX_STL_FILE_SIZE constant (100 MB)', () => {
    expect(MAX_STL_FILE_SIZE).toBe(100 * 1024 * 1024)
  })

  it('exports MAX_STL_TRIANGLES constant (5 million)', () => {
    expect(MAX_STL_TRIANGLES).toBe(5_000_000)
  })
})
