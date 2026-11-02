// ============================================================
// Unit tests — centerManifoldAtOrigin and buildPrimitive centering
// ============================================================

import { describe, it, expect, vi, type MockInstance } from 'vitest'
import {
  clamp,
  sanitizeParams,
} from './worker-handlers'

// --- Mock ManifoldObject for testing centerManifoldAtOrigin ---

interface MockMesh {
  numProp: number
  vertProperties: Float32Array
}

interface MockManifoldObject {
  getMesh: MockInstance
  delete: MockInstance
  translate: MockInstance
  _verts: Float32Array
}

/**
 * Create a mock ManifoldObject with given vertices.
 * translate/delete are mocked to return a new mock object.
 */
function makeMockObject(verts: number[]): MockManifoldObject {
  const floatVerts = new Float32Array(verts)
  const mesh: MockMesh = {
    numProp: 3,
    vertProperties: floatVerts,
  }

  const obj: MockManifoldObject = {
    _verts: floatVerts,
    getMesh: vi.fn(() => mesh),
    delete: vi.fn(),
    translate: vi.fn(function (this: MockManifoldObject, offset: number[]) {
      // Simulate translation: create new vertices shifted by offset
      const newVerts = new Float32Array(this._verts.length)
      for (let i = 0; i < this._verts.length; i += 3) {
        newVerts[i] = this._verts[i] + offset[0]
        newVerts[i + 1] = this._verts[i + 1] + offset[1]
        newVerts[i + 2] = this._verts[i + 2] + offset[2]
      }
      const newMesh: MockMesh = {
        numProp: 3,
        vertProperties: newVerts,
      }
      const newObj: MockManifoldObject = {
        _verts: newVerts,
        getMesh: vi.fn(() => newMesh),
        delete: vi.fn(),
        translate: obj.translate,
      }
      return newObj
    }),
  }
  return obj
}

// --- Tests for clamp and sanitizeParams (re-exported from worker-handlers) ---

describe('clamp', () => {
  it('returns value within range', () => {
    expect(clamp(5, 0, 10)).toBe(5)
    expect(clamp(-3, -10, 10)).toBe(-3)
  })

  it('clamps to min for negative overflow', () => {
    expect(clamp(-100, 0, 10)).toBe(0)
  })

  it('clamps to max for positive overflow', () => {
    expect(clamp(100, 0, 10)).toBe(10)
  })

  it('returns min for NaN', () => {
    expect(clamp(NaN, 0, 10)).toBe(0)
  })

  it('returns min for Infinity', () => {
    expect(clamp(Infinity, 0, 10)).toBe(0)
  })
})

describe('sanitizeParams', () => {
  it('preserves valid numeric values', () => {
    const result = sanitizeParams({ width: 50, height: 100 })
    expect(result.width).toBe(50)
    expect(result.height).toBe(100)
  })

  it('replaces non-numbers with 0', () => {
    const result = sanitizeParams({
      width: 50,
      height: 'invalid' as unknown as number,
    })
    expect(result.width).toBe(50)
    expect(result.height).toBe(0)
  })

  it('skips fields starting with underscore', () => {
    const result = sanitizeParams({
      width: 50,
      _internal: 'secret' as unknown as number,
    })
    expect(result.width).toBe(50)
    expect(result._internal).toBeUndefined()
  })
})
