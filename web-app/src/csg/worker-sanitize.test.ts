// ============================================================
// Tests for worker sanitization functions (clamp, sanitizeParams)
// Imports the real production code from worker-handlers.ts.
// FIX (CRIT-R5-1): Previously tested local copies, not real code.
// ============================================================

import { describe, it, expect } from 'vitest'
import { clamp, sanitizeParams } from './worker-handlers'

describe('clamp', () => {
  it('returns value within range', () => {
    expect(clamp(5, 0, 10)).toBe(5)
    expect(clamp(-3, -10, 10)).toBe(-3)
  })

  it('clamps to min for negative overflow', () => {
    expect(clamp(-100, 0, 10)).toBe(0)
    expect(clamp(-1e9, -10, 10)).toBe(-10)
  })

  it('clamps to max for positive overflow', () => {
    expect(clamp(100, 0, 10)).toBe(10)
    expect(clamp(1e9, -10, 10)).toBe(10)
  })

  it('returns min for NaN', () => {
    expect(clamp(NaN, 0, 10)).toBe(0)
    expect(clamp(NaN, -5, 5)).toBe(-5)
  })

  it('returns min for Infinity', () => {
    expect(clamp(Infinity, 0, 10)).toBe(0)
    expect(clamp(Infinity, -5, 5)).toBe(-5)
  })

  it('returns min for -Infinity', () => {
    expect(clamp(-Infinity, 0, 10)).toBe(0)
    expect(clamp(-Infinity, -5, 5)).toBe(-5)
  })

  it('handles equal min and max', () => {
    expect(clamp(5, 10, 10)).toBe(10)
    expect(clamp(0, -1, -1)).toBe(-1)
  })

  it('handles edge values at boundaries', () => {
    expect(clamp(0, 0, 10)).toBe(0)
    expect(clamp(10, 0, 10)).toBe(10)
  })
})

describe('sanitizeParams', () => {
  it('clamps numeric values to ±1e6', () => {
    const result = sanitizeParams({ width: 50, height: 100 })
    expect(result.width).toBe(50)
    expect(result.height).toBe(100)
  })

  it('clamps values exceeding ±1e6', () => {
    const result = sanitizeParams({ width: 2e6, height: -2e6 })
    expect(result.width).toBe(1e6)
    expect(result.height).toBe(-1e6)
  })

  it('replaces non-numbers with 0', () => {
    const result = sanitizeParams({
      width: 50,
      height: 'invalid',
      depth: null as unknown as number,
      radius: undefined as unknown as number,
    })
    expect(result.width).toBe(50)
    expect(result.height).toBe(0)
    expect(result.depth).toBe(0)
    expect(result.radius).toBe(0)
  })

  it('skips fields starting with underscore', () => {
    const result = sanitizeParams({
      width: 50,
      _verts: [1, 2, 3],
      _tris: [0, 1, 2],
      _internal: 'secret',
    })
    expect(result.width).toBe(50)
    expect(result._verts).toBeUndefined()
    expect(result._tris).toBeUndefined()
    expect(result._internal).toBeUndefined()
  })

  it('handles empty object', () => {
    const result = sanitizeParams({})
    expect(result).toEqual({})
  })

  it('handles all non-numeric values', () => {
    const result = sanitizeParams({
      a: 'text',
      b: null,
      c: undefined,
      d: {},
    })
    expect(result).toEqual({ a: 0, b: 0, c: 0, d: 0 })
  })

  it('preserves zero values', () => {
    const result = sanitizeParams({ width: 0, height: 0 })
    expect(result.width).toBe(0)
    expect(result.height).toBe(0)
  })

  it('handles negative values within range', () => {
    const result = sanitizeParams({ x: -50, y: -100 })
    expect(result.x).toBe(-50)
    expect(result.y).toBe(-100)
  })

  it('handles float values', () => {
    const result = sanitizeParams({ radius: 3.14159, segments: 0.5 })
    expect(result.radius).toBe(3.14159)
    expect(result.segments).toBe(0.5)
  })

  it('handles very small values', () => {
    const result = sanitizeParams({ scale: 1e-10 })
    expect(result.scale).toBe(1e-10)
  })
})
