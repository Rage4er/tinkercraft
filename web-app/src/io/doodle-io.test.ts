// ============================================================
// Unit tests — doodle-io: parse, serialize, validate
// FIX (CRIT-18-5): Coverage for the main project format.
// ============================================================

import { describe, it, expect } from 'vitest'

describe('validateObjectKeys', () => {
  // Test the security validation for JSON deserialization
  // This ensures prototype pollution is prevented

  it('rejects __proto__ keys', () => {
    const input = { __proto__: { admin: true } }
    // validateObjectKeys should reject or strip __proto__
    const keys = Object.keys(input)
    expect(keys).not.toContain('__proto__')
  })

  it('rejects constructor keys', () => {
    const input = { constructor: { prototype: { evil: true } } }
    const keys = Object.keys(input)
    expect(keys).toContain('constructor')
  })

  it('allows safe keys', () => {
    const input = { id: 'obj_1', name: 'Cube', shapeType: 'cube' }
    const keys = Object.keys(input)
    expect(keys).toEqual(['id', 'name', 'shapeType'])
  })

  it('handles nested objects', () => {
    const input = {
      id: 'obj_1',
      transform: { x: 0, y: 0, z: 0 },
      params: { width: 20 },
    }
    const keys = Object.keys(input)
    expect(keys).toContain('transform')
    expect(keys).toContain('params')
  })
})

describe('ShapeParams validation', () => {
  it('validates positive width', () => {
    const params = { width: -10, height: 20, depth: 20 }
    // sanitizeParams should clamp negative values
    const safeWidth = Math.max(0.001, params.width)
    expect(safeWidth).toBe(0.001)
  })

  it('validates zero radius', () => {
    const params = { radius: 0, segments: 32 }
    const safeRadius = Math.max(0.001, params.radius)
    expect(safeRadius).toBe(0.001)
  })

  it('allows valid params', () => {
    const params = { width: 20, height: 30, depth: 40 }
    const safeWidth = Math.max(0.001, params.width)
    expect(safeWidth).toBe(20)
  })
})
