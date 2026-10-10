import { describe, it, expect } from 'vitest'
import { composeTransforms, subtractTransform } from './worker-matrix'
import type { RelativeTransform, TransformNR } from './types'

function makeT(o: Partial<TransformNR> = {}): TransformNR {
  return { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1, ...o }
}

function makeR(o: {
  pos?: { x: number; y: number; z: number }
  rot?: { x: number; y: number; z: number }
  scale?: { x: number; y: number; z: number }
} = {}): RelativeTransform {
  return {
    positionDelta: o.pos ?? { x: 0, y: 0, z: 0 },
    rotationDelta: o.rot ?? { x: 0, y: 0, z: 0 },
    scaleRatio: o.scale ?? { x: 1, y: 1, z: 1 },
  }
}

function approxEuler(a: number, b: number, eps = 1e-3): boolean {
  for (const shift of [-360, 0, 360]) {
    if (Math.abs(a - (b + shift)) < eps) return true
  }
  return false
}

function expectTransformClose(actual: TransformNR, expected: TransformNR, eps = 1e-3): void {
  expect(actual.x).toBeCloseTo(expected.x, 4)
  expect(actual.y).toBeCloseTo(expected.y, 4)
  expect(actual.z).toBeCloseTo(expected.z, 4)
  expect(approxEuler(actual.rotX, expected.rotX, eps)).toBe(true)
  expect(approxEuler(actual.rotY, expected.rotY, eps)).toBe(true)
  expect(approxEuler(actual.rotZ, expected.rotZ, eps)).toBe(true)
  expect(actual.scaleX).toBeCloseTo(expected.scaleX, 4)
  expect(actual.scaleY).toBeCloseTo(expected.scaleY, 4)
  expect(actual.scaleZ).toBeCloseTo(expected.scaleZ, 4)
}

// ============================================================
// composeTransforms
// ============================================================
describe('composeTransforms', () => {
  it('null + null → identity', () => {
    expectTransformClose(composeTransforms(null, null), makeT())
  })

  it('null parent → relative becomes absolute', () => {
    const rel = makeR({ pos: { x: 5, y: 10, z: 15 }, rot: { x: 30, y: 45, z: 60 }, scale: { x: 2, y: 3, z: 4 } })
    expectTransformClose(composeTransforms(null, rel), makeT({
      x: 5, y: 10, z: 15, rotX: 30, rotY: 45, rotZ: 60, scaleX: 2, scaleY: 3, scaleZ: 4,
    }))
  })

  it('null relative → parent as-is', () => {
    const parent = makeT({ x: 1, y: 2, z: 3, rotX: 10, rotY: 20, rotZ: 30, scaleX: 4, scaleY: 5, scaleZ: 6 })
    expectTransformClose(composeTransforms(parent, null), parent)
  })

  it('parent scale is applied to relative.positionDelta', () => {
    const parent = makeT({ scaleX: 2, scaleY: 2, scaleZ: 2 })
    const rel = makeR({ pos: { x: 1, y: 2, z: 3 } })
    const result = composeTransforms(parent, rel)
    expect(result.x).toBeCloseTo(2)
    expect(result.y).toBeCloseTo(4)
    expect(result.z).toBeCloseTo(6)
  })

  it('parent rotation is applied to scaled positionDelta (rotZ=90)', () => {
    const parent = makeT({ x: 10, y: 20, z: 30, rotZ: 90 })
    const rel = makeR({ pos: { x: 1, y: 0, z: 0 } })
    const result = composeTransforms(parent, rel)
    expect(result.x).toBeCloseTo(10)
    expect(result.y).toBeCloseTo(21)
    expect(result.z).toBeCloseTo(30)
  })

  it('non-identity parent position offset', () => {
    const parent = makeT({ x: 100, y: 200, z: 300 })
    const rel = makeR({ pos: { x: 1, y: 2, z: 3 } })
    const result = composeTransforms(parent, rel)
    expect(result.x).toBeCloseTo(101)
    expect(result.y).toBeCloseTo(202)
    expect(result.z).toBeCloseTo(303)
  })

  it('scale composition: parent.scale * relative.scaleRatio', () => {
    const parent = makeT({ scaleX: 2, scaleY: 3, scaleZ: 4 })
    const rel = makeR({ scale: { x: 5, y: 6, z: 7 } })
    const result = composeTransforms(parent, rel)
    expect(result.scaleX).toBeCloseTo(10)
    expect(result.scaleY).toBeCloseTo(18)
    expect(result.scaleZ).toBeCloseTo(28)
  })

  it('scale ratio 1 preserves parent scale', () => {
    const parent = makeT({ scaleX: 3, scaleY: 4, scaleZ: 5 })
    const result = composeTransforms(parent, makeR())
    expect(result.scaleX).toBeCloseTo(3)
    expect(result.scaleY).toBeCloseTo(4)
    expect(result.scaleZ).toBeCloseTo(5)
  })

  it('zero rotation deltas preserve parent rotation', () => {
    const parent = makeT({ rotX: 30, rotY: 45, rotZ: 60 })
    expectTransformClose(composeTransforms(parent, makeR()), parent)
  })

  it('parent.rotZ=90 + relative.rotZ=90 → world.rotZ=180', () => {
    const parent = makeT({ rotZ: 90 })
    const rel = makeR({ rot: { x: 0, y: 0, z: 90 } })
    expectTransformClose(composeTransforms(parent, rel), makeT({ rotZ: 180 }))
  })

  it('parent.rotX=45 + relative.rotX=45 → world.rotX=90', () => {
    const parent = makeT({ rotX: 45 })
    const rel = makeR({ rot: { x: 45, y: 0, z: 0 } })
    expectTransformClose(composeTransforms(parent, rel), makeT({ rotX: 90 }))
  })

  it('parent.rotY=30 + relative.rotY=60 → world.rotY=90', () => {
    const parent = makeT({ rotY: 30 })
    const rel = makeR({ rot: { x: 0, y: 60, z: 0 } })
    expectTransformClose(composeTransforms(parent, rel), makeT({ rotY: 90 }))
  })

  it('combined: position + rotation + scale', () => {
    const parent = makeT({ x: 5, y: 10, z: 15, rotZ: 90, scaleX: 2, scaleY: 2, scaleZ: 2 })
    const rel = makeR({ pos: { x: 1, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 90 }, scale: { x: 3, y: 3, z: 3 } })
    const result = composeTransforms(parent, rel)
    expect(result.x).toBeCloseTo(5)
    expect(result.y).toBeCloseTo(12)
    expect(result.z).toBeCloseTo(15)
    expectTransformClose(result, makeT({ x: 5, y: 12, z: 15, rotZ: 180, scaleX: 6, scaleY: 6, scaleZ: 6 }))
  })
})

// ============================================================
// subtractTransform
// ============================================================
describe('subtractTransform', () => {
  it('null parent → world is already relative to origin', () => {
    const world = makeT({ x: 5, y: 10, z: 15, rotX: 30, rotY: 45, rotZ: 60, scaleX: 2, scaleY: 3, scaleZ: 4 })
    const result = subtractTransform(world, null)
    expect(result.positionDelta.x).toBeCloseTo(5)
    expect(result.positionDelta.y).toBeCloseTo(10)
    expect(result.positionDelta.z).toBeCloseTo(15)
    expect(result.rotationDelta.x).toBeCloseTo(30)
    expect(result.rotationDelta.y).toBeCloseTo(45)
    expect(result.rotationDelta.z).toBeCloseTo(60)
    expect(result.scaleRatio.x).toBeCloseTo(2)
    expect(result.scaleRatio.y).toBeCloseTo(3)
    expect(result.scaleRatio.z).toBeCloseTo(4)
  })

  it('round-trip with identity parent', () => {
    const world = makeT({ x: 10, y: 20, z: 30, rotX: 15, rotY: 25, rotZ: 35, scaleX: 2, scaleY: 3, scaleZ: 4 })
    const parent = makeT()
    const rel = subtractTransform(world, parent)
    expectTransformClose(composeTransforms(parent, rel), world)
  })

  it('round-trip: parent with position offset', () => {
    const world = makeT({ x: 50, y: 60, z: 70, rotX: 10, rotY: 20, rotZ: 30, scaleX: 2, scaleY: 2, scaleZ: 2 })
    const parent = makeT({ x: 10, y: 20, z: 30 })
    const rel = subtractTransform(world, parent)
    expectTransformClose(composeTransforms(parent, rel), world)
  })

  it('round-trip: parent with rotZ=90', () => {
    const world = makeT({ x: 5, y: 12, z: 15, rotZ: 180, scaleX: 6, scaleY: 6, scaleZ: 6 })
    const parent = makeT({ x: 5, y: 10, z: 15, rotZ: 90, scaleX: 2, scaleY: 2, scaleZ: 2 })
    const rel = subtractTransform(world, parent)
    expectTransformClose(composeTransforms(parent, rel), world)
  })

  it('round-trip: parent with non-uniform scale', () => {
    const world = makeT({ x: 3, y: 8, z: 15, scaleX: 6, scaleY: 12, scaleZ: 20 })
    const parent = makeT({ x: 1, y: 2, z: 3, scaleX: 2, scaleY: 3, scaleZ: 4 })
    const rel = subtractTransform(world, parent)
    expectTransformClose(composeTransforms(parent, rel), world)
  })

  it('round-trip: full 9-component transform', () => {
    const world = makeT({ x: 100, y: 200, z: 300, rotX: 10, rotY: 20, rotZ: 30, scaleX: 1.5, scaleY: 2.5, scaleZ: 3.5 })
    const parent = makeT({ x: 50, y: 100, z: 150, rotX: 45, rotY: 30, rotZ: 60, scaleX: 2, scaleY: 3, scaleZ: 4 })
    const rel = subtractTransform(world, parent)
    expectTransformClose(composeTransforms(parent, rel), world, 1e-2)
  })

  it('round-trip: Euler XYZ composition (non-commutative)', () => {
    const world = makeT({ rotX: 30, rotY: 45, rotZ: 60 })
    const parent = makeT({ rotX: 10, rotY: 20, rotZ: 30 })
    const rel = subtractTransform(world, parent)
    expectTransformClose(composeTransforms(parent, rel), world, 1e-2)
  })

  it('subtract positionDelta matches expected for simple case', () => {
    const parent = makeT({ x: 10, y: 0, z: 0, scaleX: 2, scaleY: 2, scaleZ: 2 })
    const world = makeT({ x: 14, y: 0, z: 0, scaleX: 2, scaleY: 2, scaleZ: 2 })
    const rel = subtractTransform(world, parent)
    expect(rel.positionDelta.x).toBeCloseTo(2)
    expect(rel.positionDelta.y).toBeCloseTo(0)
    expect(rel.positionDelta.z).toBeCloseTo(0)
  })

  it('subtract scaleRatio = world.scale / parent.scale', () => {
    const parent = makeT({ scaleX: 2, scaleY: 4, scaleZ: 8 })
    const world = makeT({ scaleX: 6, scaleY: 12, scaleZ: 24 })
    const rel = subtractTransform(world, parent)
    expect(rel.scaleRatio.x).toBeCloseTo(3)
    expect(rel.scaleRatio.y).toBeCloseTo(3)
    expect(rel.scaleRatio.z).toBeCloseTo(3)
  })
})
