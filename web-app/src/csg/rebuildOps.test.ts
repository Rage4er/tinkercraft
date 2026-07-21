// ============================================================
// Unit tests — rebuildOps: applyMoveDelta, applyMirrorToTransform,
// applyAlignToTransform, makeDefaultTransform
// FIX (CRIT-R5-2): Real unit tests for rebuild logic
// ============================================================

import { describe, it, expect } from 'vitest'
import {
  applyMoveDelta,
  applyMirrorToTransform,
  applyAlignToTransform,
  makeDefaultTransform,
} from './rebuildOps'
import type { RebuildTransform } from './rebuildOps'

const ID: RebuildTransform = { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 }

describe('makeDefaultTransform', () => {
  it('returns identity-like transform', () => {
    const t = makeDefaultTransform()
    expect(t.x).toBe(0)
    expect(t.y).toBe(0)
    expect(t.z).toBe(0)
    expect(t.rotX).toBe(0)
    expect(t.rotY).toBe(0)
    expect(t.rotZ).toBe(0)
    expect(t.scaleX).toBe(1)
    expect(t.scaleY).toBe(1)
    expect(t.scaleZ).toBe(1)
  })

  it('returns a new object on each call', () => {
    const a = makeDefaultTransform()
    const b = makeDefaultTransform()
    expect(a).not.toBe(b)
  })
})

describe('applyMoveDelta', () => {
  it('applies position delta', () => {
    const result = applyMoveDelta(ID, { x: 5, y: 10, z: 15 })
    expect(result.x).toBe(5)
    expect(result.y).toBe(10)
    expect(result.z).toBe(15)
  })

  it('applies rotation delta', () => {
    const result = applyMoveDelta(ID, undefined, { x: 0, y: 45, z: 0 })
    expect(result.rotX).toBe(0)
    expect(result.rotY).toBe(45)
    expect(result.rotZ).toBe(0)
  })

  it('applies scale delta (additive — correct as delta = newScale - oldScale)', () => {
    const t: RebuildTransform = { ...ID, scaleX: 1, scaleY: 1, scaleZ: 1 }
    const result = applyMoveDelta(t, undefined, undefined, { x: 0.5, y: 0, z: 0 })
    expect(result.scaleX).toBe(1.5)
    expect(result.scaleY).toBe(1)
    expect(result.scaleZ).toBe(1)
  })

  it('applies all deltas simultaneously', () => {
    const t: RebuildTransform = { x: 10, y: 20, z: 30, rotX: 90, rotY: 0, rotZ: 0, scaleX: 2, scaleY: 2, scaleZ: 2 }
    const result = applyMoveDelta(t, { x: 5, y: -10, z: 0 }, { x: 0, y: 0, z: -45 }, { x: -1, y: 0, z: 0 })
    expect(result.x).toBe(15)
    expect(result.y).toBe(10)
    expect(result.z).toBe(30)
    expect(result.rotX).toBe(90)
    expect(result.rotY).toBe(0)
    expect(result.rotZ).toBe(-45)
    expect(result.scaleX).toBe(1)
    expect(result.scaleY).toBe(2)
    expect(result.scaleZ).toBe(2)
  })

  it('handles undefined deltas (identity)', () => {
    const result = applyMoveDelta(ID)
    expect(result).toEqual(ID)
  })

  it('does not mutate input', () => {
    const original = { ...ID }
    applyMoveDelta(ID, { x: 100, y: 200, z: 300 })
    expect(ID.x).toBe(0)
    expect(ID.y).toBe(0)
    expect(ID.z).toBe(0)
    expect(ID).toEqual(original)
  })

  it('handles zero delta (no-op)', () => {
    const result = applyMoveDelta({ ...ID, x: 50 }, { x: 0, y: 0, z: 0 })
    expect(result.x).toBe(50)
  })

  it('handles negative position delta', () => {
    const result = applyMoveDelta(ID, { x: -10, y: -20, z: -30 })
    expect(result.x).toBe(-10)
    expect(result.y).toBe(-20)
    expect(result.z).toBe(-30)
  })
})

describe('applyMirrorToTransform', () => {
  it('mirrors X across YZ plane (negate x)', () => {
    const t: RebuildTransform = { ...ID, x: 10, y: 20, z: 30 }
    const result = applyMirrorToTransform(t, 'YZ')
    expect(result.x).toBe(-10)
    expect(result.y).toBe(20)
    expect(result.z).toBe(30)
  })

  it('mirrors Y across XZ plane (negate y)', () => {
    const t: RebuildTransform = { ...ID, x: 10, y: 20, z: 30 }
    const result = applyMirrorToTransform(t, 'XZ')
    expect(result.x).toBe(10)
    expect(result.y).toBe(-20)
    expect(result.z).toBe(30)
  })

  it('mirrors Z across XY plane (negate z)', () => {
    const t: RebuildTransform = { ...ID, x: 10, y: 20, z: 30 }
    const result = applyMirrorToTransform(t, 'XY')
    expect(result.x).toBe(10)
    expect(result.y).toBe(20)
    expect(result.z).toBe(-30)
  })

  it('mirrors rotation on the axis perpendicular to the plane', () => {
    const t: RebuildTransform = { ...ID, rotX: 45, rotY: 30, rotZ: 15, scaleX: 2, x: 5 }
    const result = applyMirrorToTransform(t, 'YZ')
    expect(result.rotX).toBe(-45) // YZ plane → negate rotX
    expect(result.rotY).toBe(30)  // unchanged
    expect(result.rotZ).toBe(15)  // unchanged
    expect(result.scaleX).toBe(2) // scale unaffected
  })

  it('mirrors rotation for XZ and XY planes', () => {
    const t: RebuildTransform = { ...ID, rotX: 45, rotY: 30, rotZ: 15 }
    let result = applyMirrorToTransform(t, 'XZ')
    expect(result.rotX).toBe(45)
    expect(result.rotY).toBe(-30) // XZ plane → negate rotY
    expect(result.rotZ).toBe(15)

    result = applyMirrorToTransform(t, 'XY')
    expect(result.rotX).toBe(45)
    expect(result.rotY).toBe(30)
    expect(result.rotZ).toBe(-15) // XY plane → negate rotZ
  })

  it('does not mutate input', () => {
    const t: RebuildTransform = { ...ID, x: 100 }
    applyMirrorToTransform(t, 'YZ')
    expect(t.x).toBe(100)
  })
})

describe('applyAlignToTransform', () => {
  it('aligns on X axis', () => {
    const t: RebuildTransform = { ...ID, x: 0 }
    const result = applyAlignToTransform(t, 'x', 15)
    expect(result.x).toBe(15)
    expect(result.y).toBe(0)
    expect(result.z).toBe(0)
  })

  it('aligns on Y axis', () => {
    const t: RebuildTransform = { ...ID, y: 10 }
    const result = applyAlignToTransform(t, 'y', 25)
    expect(result.x).toBe(0)
    expect(result.y).toBe(35)
    expect(result.z).toBe(0)
  })

  it('aligns on Z axis', () => {
    const t: RebuildTransform = { ...ID, z: -5 }
    const result = applyAlignToTransform(t, 'z', -10)
    expect(result.x).toBe(0)
    expect(result.y).toBe(0)
    expect(result.z).toBe(-15)
  })

  it('handles zero delta (no-op)', () => {
    const t: RebuildTransform = { ...ID, x: 42 }
    const result = applyAlignToTransform(t, 'x', 0)
    expect(result.x).toBe(42)
  })

  it('does not mutate input', () => {
    const t: RebuildTransform = { ...ID, x: 5 }
    applyAlignToTransform(t, 'x', 100)
    expect(t.x).toBe(5)
  })
})
