// ============================================================
// Unit tests — stl-export: exportToStl
// ============================================================

import { describe, it, expect } from 'vitest'
import { exportToStl } from './stl-export'
import type { SceneObject, ShapeParams, TransformNR } from '../csg/types'

const T: TransformNR = { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 }
const P: ShapeParams = { width: 1, height: 1, depth: 1 }

function makeObj(overrides: Partial<SceneObject> = {}): SceneObject {
  return {
    id: 'test',
    shapeType: 'cube',
    params: P,
    color: '#fff',
    transform: T,
    visible: true,
    locked: false,
    vertices: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
    indices: new Uint32Array([0, 1, 2]),
    ...overrides,
  }
}

describe('exportToStl', () => {
  it('produces a valid binary STL blob', () => {
    const blob = exportToStl([makeObj()])
    expect(blob).toBeInstanceOf(Blob)
    expect(blob.size).toBe(84 + 50 * 1) // header(80) + count(4) + 50 bytes per triangle
  })

  it('writes correct triangle count in header', async () => {
    const obj = makeObj({
      vertices: new Float32Array([
        0, 0, 0, 1, 0, 0, 0, 1, 0,
        0, 0, 1, 1, 0, 1, 0, 1, 1,
      ]),
      indices: new Uint32Array([0, 1, 2, 3, 4, 5]),
    })
    const blob = exportToStl([obj])
    const buf = new ArrayBuffer(blob.size)
    new Uint8Array(buf).set(new Uint8Array(await blob.arrayBuffer()))
    const dv = new DataView(buf)
    // Triangle count is at offset 80, uint32 LE
    expect(dv.getUint32(80, true)).toBe(2)
  })

  it('skips hidden objects', () => {
    const visible = makeObj({ id: 'v' })
    const hidden = makeObj({ id: 'h', visible: false })
    const blob = exportToStl([visible, hidden])
    // Only 1 triangle from the visible object
    expect(blob.size).toBe(84 + 50 * 1)
  })

  it('handles empty input', async () => {
    const blob = exportToStl([])
    expect(blob.size).toBe(84) // just header + zero count
    const buf = new ArrayBuffer(blob.size)
    new Uint8Array(buf).set(new Uint8Array(await blob.arrayBuffer()))
    const dv = new DataView(buf)
    expect(dv.getUint32(80, true)).toBe(0)
  })

  // FIX (WARN-R3-8): Tests for transform application
  it('applies translation transform to vertices', async () => {
    const obj = makeObj({
      vertices: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      indices: new Uint32Array([0, 1, 2]),
      transform: { ...T, x: 10, y: 20, z: 30 },
    })
    const blob = exportToStl([obj])
    expect(blob.size).toBe(84 + 50 * 1)

    // Verify first vertex was translated: (0,0,0) → (10,20,30)
    const buf = new ArrayBuffer(blob.size)
    new Uint8Array(buf).set(new Uint8Array(await blob.arrayBuffer()))
    const dv = new DataView(buf)
    // Normal (12 bytes) + first vertex (12 bytes)
    const ax = dv.getFloat32(84 + 12, true)
    const ay = dv.getFloat32(84 + 12 + 4, true)
    const az = dv.getFloat32(84 + 12 + 8, true)
    expect(ax).toBeCloseTo(10, 5)
    expect(ay).toBeCloseTo(20, 5)
    expect(az).toBeCloseTo(30, 5)
  })

  it('applies scale transform to vertices', async () => {
    const obj = makeObj({
      vertices: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      indices: new Uint32Array([0, 1, 2]),
      transform: { ...T, scaleX: 2, scaleY: 2, scaleZ: 2 },
    })
    const blob = exportToStl([obj])
    expect(blob.size).toBe(84 + 50 * 1)

    // Verify second vertex was scaled: (1,0,0) → (2,0,0)
    // STL layout per triangle: normal(12) + A(12) + B(12) + C(12) + attr(2) = 50 bytes
    // Vertex B is at: header(84) + normal(12) + vertexA(12) = 108
    const buf = new ArrayBuffer(blob.size)
    new Uint8Array(buf).set(new Uint8Array(await blob.arrayBuffer()))
    const dv = new DataView(buf)
    const bx = dv.getFloat32(84 + 12 + 12, true) // normal(12) + vertexA(12)
    expect(bx).toBeCloseTo(2, 5)
  })

  it('identity transform produces same output as no transform', async () => {
    const obj1 = makeObj({
      vertices: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      indices: new Uint32Array([0, 1, 2]),
    })
    const obj2 = makeObj({
      vertices: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      indices: new Uint32Array([0, 1, 2]),
      transform: { ...T }, // identity
    })
    const blob1 = await exportToStl([obj1]).arrayBuffer()
    const blob2 = await exportToStl([obj2]).arrayBuffer()
    expect(new Uint8Array(blob1)).toEqual(new Uint8Array(blob2))
  })
})
