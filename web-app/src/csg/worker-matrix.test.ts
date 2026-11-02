import { describe, it, expect } from 'vitest'
import { composeTransforms, subtractTransform, buildSRTMatrixAroundCenter, buildTransformMatrix, applyMatrix4ToVec3 } from './worker-matrix'
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

describe('buildSRTMatrixAroundCenter', () => {
  it('identity transform produces identity matrix', () => {
    const m = buildSRTMatrixAroundCenter(
      { x: 0, y: 0, z: 0 },
      { rotX: 0, rotY: 0, rotZ: 0 },
      { scaleX: 1, scaleY: 1, scaleZ: 1 },
    )
    // Identity matrix: diagonal = 1, rest = 0
    expect(m[0]).toBeCloseTo(1) // r00
    expect(m[5]).toBeCloseTo(1) // r11
    expect(m[10]).toBeCloseTo(1) // r22
    expect(m[12]).toBeCloseTo(0) // tx
    expect(m[13]).toBeCloseTo(0) // ty
    expect(m[14]).toBeCloseTo(0) // tz
  })

  it('90° rotation around Z axis', () => {
    // Rotation around Z: X→Y, Y→-X
    const m = buildSRTMatrixAroundCenter(
      { x: 0, y: 0, z: 0 },
      { rotX: 0, rotY: 0, rotZ: 90 },
      { scaleX: 1, scaleY: 1, scaleZ: 1 },
    )
    const v = { x: 1, y: 0, z: 0 }
    const result = applyMatrix4ToVec3(m, v)
    // (1, 0, 0) rotated 90° around Z → (0, 1, 0)
    expect(result.x).toBeCloseTo(0, 5)
    expect(result.y).toBeCloseTo(1, 5)
    expect(result.z).toBeCloseTo(0, 5)
  })

  it('180° rotation around X axis', () => {
    const m = buildSRTMatrixAroundCenter(
      { x: 0, y: 0, z: 0 },
      { rotX: 180, rotY: 0, rotZ: 0 },
      { scaleX: 1, scaleY: 1, scaleZ: 1 },
    )
    const v = { x: 0, y: 1, z: 0 }
    const result = applyMatrix4ToVec3(m, v)
    // (0, 1, 0) rotated 180° around X → (0, -1, 0)
    expect(result.x).toBeCloseTo(0, 5)
    expect(result.y).toBeCloseTo(-1, 5)
    expect(result.z).toBeCloseTo(0, 5)
  })

  it('scale 2x applies uniformly', () => {
    const m = buildSRTMatrixAroundCenter(
      { x: 0, y: 0, z: 0 },
      { rotX: 0, rotY: 0, rotZ: 0 },
      { scaleX: 2, scaleY: 2, scaleZ: 2 },
    )
    const v = { x: 1, y: 2, z: 3 }
    const result = applyMatrix4ToVec3(m, v)
    expect(result.x).toBeCloseTo(2, 5)
    expect(result.y).toBeCloseTo(4, 5)
    expect(result.z).toBeCloseTo(6, 5)
  })

  it('scale with position offset', () => {
    // Object at (10, 0, 0), scale 2x
    // tx = pos.x - RS·pos.x = 10 - 2*10 = -10
    const m = buildSRTMatrixAroundCenter(
      { x: 10, y: 0, z: 0 },
      { rotX: 0, rotY: 0, rotZ: 0 },
      { scaleX: 2, scaleY: 1, scaleZ: 1 },
    )
    // Point at local (0, 0, 0) → scaled (0, 0, 0) + translated (-10, 0, 0) = (-10, 0, 0)
    const v1 = { x: 0, y: 0, z: 0 }
    const r1 = applyMatrix4ToVec3(m, v1)
    expect(r1.x).toBeCloseTo(-10, 5)
    expect(r1.y).toBeCloseTo(0, 5)
    expect(r1.z).toBeCloseTo(0, 5)

    // Point at local (5, 0, 0) → scaled (10, 0, 0) + translated (-10, 0, 0) = (0, 0, 0)
    const v2 = { x: 5, y: 0, z: 0 }
    const r2 = applyMatrix4ToVec3(m, v2)
    expect(r2.x).toBeCloseTo(0, 5)
    expect(r2.y).toBeCloseTo(0, 5)
    expect(r2.z).toBeCloseTo(0, 5)
  })

  it('applies rotation around center correctly', () => {
    // Position (5, 5, 0), 90° rotation around Z, no scale
    // RS matrix for 90° Z: r00=0, r01=-1, r10=1, r11=0, r22=1
    // tx = 5 - (0*5 + (-1)*5) = 5 - (-5) = 10
    // ty = 5 - (1*5 + 0*5) = 5 - 5 = 0
    const m = buildSRTMatrixAroundCenter(
      { x: 5, y: 5, z: 0 },
      { rotX: 0, rotY: 0, rotZ: 90 },
      { scaleX: 1, scaleY: 1, scaleZ: 1 },
    )
    // Local point (0, 0, 0) → rotated around origin → (0, 0) + translation (10, 0, 0) = (10, 0, 0)
    const v1 = { x: 0, y: 0, z: 0 }
    const r1 = applyMatrix4ToVec3(m, v1)
    expect(r1.x).toBeCloseTo(10, 5)
    expect(r1.y).toBeCloseTo(0, 5)
    expect(r1.z).toBeCloseTo(0, 5)

    // Local point (5, 0, 0) → rotated 90° around Z → (0, 5) + translation (10, 0, 0) = (10, 5, 0)
    const v2 = { x: 5, y: 0, z: 0 }
    const r2 = applyMatrix4ToVec3(m, v2)
    expect(r2.x).toBeCloseTo(10, 5)
    expect(r2.y).toBeCloseTo(5, 5)
    expect(r2.z).toBeCloseTo(0, 5)
  })

  it('non-uniform scale X=2, Y=3, Z=4', () => {
    const m = buildSRTMatrixAroundCenter(
      { x: 0, y: 0, z: 0 },
      { rotX: 0, rotY: 0, rotZ: 0 },
      { scaleX: 2, scaleY: 3, scaleZ: 4 },
    )
    const v = { x: 1, y: 1, z: 1 }
    const result = applyMatrix4ToVec3(m, v)
    expect(result.x).toBeCloseTo(2, 5)
    expect(result.y).toBeCloseTo(3, 5)
    expect(result.z).toBeCloseTo(4, 5)
  })
})

// ============================================================
// buildTransformMatrix — tests for the TRS matrix that applies
// rotation/scale around origin then translates by `pos`.
// This is the correct matrix for primitives built at (0,0,0).
// ============================================================

describe('buildTransformMatrix', () => {
  it('pure translation (no rotation/scale) moves vertices by pos', () => {
    const m = buildTransformMatrix(
      { x: 30, y: 40, z: 50 },
      { rotX: 0, rotY: 0, rotZ: 0 },
      { scaleX: 1, scaleY: 1, scaleZ: 1 },
    )
    // Vertex at origin should be translated to (30, 40, 50)
    const v = { x: 0, y: 0, z: 0 }
    const result = applyMatrix4ToVec3(m, v)
    expect(result.x).toBeCloseTo(30)
    expect(result.y).toBeCloseTo(40)
    expect(result.z).toBeCloseTo(50)

    // Vertex at (5, 0, 0) should be translated to (35, 40, 50)
    const v2 = { x: 5, y: 0, z: 0 }
    const result2 = applyMatrix4ToVec3(m, v2)
    expect(result2.x).toBeCloseTo(35)
    expect(result2.y).toBeCloseTo(40)
    expect(result2.z).toBeCloseTo(50)
  })

  it('rotation around origin then translate', () => {
    // 90° Z rotation + translate to (10, 0, 0)
    const m = buildTransformMatrix(
      { x: 10, y: 0, z: 0 },
      { rotX: 0, rotY: 0, rotZ: 90 },
      { scaleX: 1, scaleY: 1, scaleZ: 1 },
    )
    // (1, 0, 0) rotated 90° Z → (0, 1, 0) + (10, 0, 0) = (10, 1, 0)
    const v = { x: 1, y: 0, z: 0 }
    const result = applyMatrix4ToVec3(m, v)
    expect(result.x).toBeCloseTo(10, 5)
    expect(result.y).toBeCloseTo(1, 5)
    expect(result.z).toBeCloseTo(0, 5)
  })

  it('scale around origin then translate', () => {
    // 2x scale + translate to (5, 0, 0)
    const m = buildTransformMatrix(
      { x: 5, y: 0, z: 0 },
      { rotX: 0, rotY: 0, rotZ: 0 },
      { scaleX: 2, scaleY: 1, scaleZ: 1 },
    )
    // (3, 0, 0) scaled 2x → (6, 0, 0) + (5, 0, 0) = (11, 0, 0)
    const v = { x: 3, y: 0, z: 0 }
    const result = applyMatrix4ToVec3(m, v)
    expect(result.x).toBeCloseTo(11, 5)
    expect(result.y).toBeCloseTo(0, 5)
    expect(result.z).toBeCloseTo(0, 5)
  })

  it('consistency: buildTransformMatrix(pos, 0, 1) = applyTransform(pos)', () => {
    // buildTransformMatrix with identity RS should produce the same result
    // as a pure translate matrix.
    const m1 = buildTransformMatrix(
      { x: 7, y: -3, z: 11 },
      { rotX: 0, rotY: 0, rotZ: 0 },
      { scaleX: 1, scaleY: 1, scaleZ: 1 },
    )
    // Compare with a manual translate matrix
    const m2 = [
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      7, -3, 11, 1,
    ]
    const v = { x: 2, y: 3, z: 4 }
    expect(applyMatrix4ToVec3(m1, v).x).toBeCloseTo(applyMatrix4ToVec3(m2, v).x)
    expect(applyMatrix4ToVec3(m1, v).y).toBeCloseTo(applyMatrix4ToVec3(m2, v).y)
    expect(applyMatrix4ToVec3(m1, v).z).toBeCloseTo(applyMatrix4ToVec3(m2, v).z)
  })

  it('differ from buildSRTMatrixAroundCenter for translation-only', () => {
    // buildSRTMatrixAroundCenter with identity RS produces identity matrix
    // (translation = pos - RS·pos = 0).
    // buildTransformMatrix produces correct translation.
    const m1 = buildSRTMatrixAroundCenter(
      { x: 30, y: 0, z: 0 },
      { rotX: 0, rotY: 0, rotZ: 0 },
      { scaleX: 1, scaleY: 1, scaleZ: 1 },
    )
    const m2 = buildTransformMatrix(
      { x: 30, y: 0, z: 0 },
      { rotX: 0, rotY: 0, rotZ: 0 },
      { scaleX: 1, scaleY: 1, scaleZ: 1 },
    )
    // Origin vertex: SRT → (0,0,0), Transform → (30,0,0)
    const v = { x: 0, y: 0, z: 0 }
    expect(applyMatrix4ToVec3(m1, v).x).toBeCloseTo(0)
    expect(applyMatrix4ToVec3(m2, v).x).toBeCloseTo(30)
  })

  it('multi-axis rotation matches Three.js XYZ Euler order', () => {
    // FIX (ROT-XYZ): verify that computeRSMatrix matches Three.js Euler 'XYZ'.
    // Three.js 'XYZ' = intrinsic X→Y→Z = R = Rx · Ry · Rz.
    // Previous code computed Rz · Ry · Rx which diverges for multi-axis rotation.
    //
    // Test: rotate (1,0,0) by rotX=30, rotY=45, rotZ=0.
    // Expected result computed via Three.js Matrix4.makeRotationFromEuler('XYZ').
    const m = buildTransformMatrix(
      { x: 0, y: 0, z: 0 },
      { rotX: 30, rotY: 45, rotZ: 0 },
      { scaleX: 1, scaleY: 1, scaleZ: 1 },
    )
    const v = { x: 1, y: 0, z: 0 }
    const result = applyMatrix4ToVec3(m, v)

    // Three.js XYZ Euler with rotX=30, rotY=45, rotZ=0:
    // R[0][0] = cos(45)*cos(0) = cos(45) ≈ 0.7071
    // R[1][0] = cos(30)*sin(0) + sin(30)*sin(45)*cos(0) = 0 + 0.5*0.7071 ≈ 0.3536
    // R[2][0] = -cos(30)*sin(45)*cos(0) + sin(30)*sin(0) = -0.866*0.7071 ≈ -0.6124
    expect(result.x).toBeCloseTo(0.7071, 3)
    expect(result.y).toBeCloseTo(0.3536, 3)
    expect(result.z).toBeCloseTo(-0.6124, 3)
  })

  it('multi-axis rotation with all three axes', () => {
    // rotX=30, rotY=40, rotZ=50 — verify against Three.js XYZ Euler.
    const m = buildTransformMatrix(
      { x: 0, y: 0, z: 0 },
      { rotX: 30, rotY: 40, rotZ: 50 },
      { scaleX: 1, scaleY: 1, scaleZ: 1 },
    )
    const v = { x: 1, y: 0, z: 0 }
    const result = applyMatrix4ToVec3(m, v)

    // Verified via Three.js Matrix4.makeRotationFromEuler('XYZ'):
    // (1,0,0) → (0.4924, 0.8700, 0.0252)
    expect(result.x).toBeCloseTo(0.4924, 3)
    expect(result.y).toBeCloseTo(0.8700, 3)
    expect(result.z).toBeCloseTo(0.0252, 3)
  })
})

// ============================================================
// buildTransformMatrix with negative scale — FIX (MIRROR-PRIMITIVE-NEGATIVE-SCALE)
// ============================================================
describe('buildTransformMatrix with negative scale', () => {
  it('negative scaleX reflects geometry correctly with rotation', () => {
    const m = buildTransformMatrix(
      { x: 0, y: 0, z: 0 },
      { rotX: 0, rotY: 30, rotZ: 0 },
      { scaleX: -1, scaleY: 1, scaleZ: 1 },
    )
    // RS matrix for scaleX=-1, rotY=30°:
    // r00=cy*cz*Sx = 0.866*1*(-1) = -0.866
    // r02=sy_*Sz = 0.5*1 = 0.5
    // r20=(-cx*sy_*cz+sx_*sz_)*Sx = (-1*0.5*1+0)*(-1) = 0.5
    // v = (12, 0, 0): x = -0.866*12 = -10.39, z = 0.5*12 = 6
    const result = applyMatrix4ToVec3(m, { x: 12, y: 0, z: 0 })
    expect(result.x).toBeCloseTo(-10.39, 1)
    expect(result.y).toBeCloseTo(0, 3)
    expect(result.z).toBeCloseTo(6, 1)
  })

  it('negative scaleY reflects geometry correctly', () => {
    const m = buildTransformMatrix(
      { x: 0, y: 0, z: 0 },
      { rotX: 0, rotY: 0, rotZ: 0 },
      { scaleX: 1, scaleY: -1, scaleZ: 1 },
    )
    // v = (0, 5, 0) → (0, -5, 0)
    const result = applyMatrix4ToVec3(m, { x: 0, y: 5, z: 0 })
    expect(result.x).toBeCloseTo(0, 3)
    expect(result.y).toBeCloseTo(-5, 3)
    expect(result.z).toBeCloseTo(0, 3)
  })

  it('negative scaleZ reflects geometry correctly with rotation', () => {
    const m = buildTransformMatrix(
      { x: 0, y: 0, z: 0 },
      { rotX: 45, rotY: 0, rotZ: 0 },
      { scaleX: 1, scaleY: 1, scaleZ: -1 },
    )
    // RS matrix for scaleZ=-1, rotX=45°:
    // r12=-sx_*cy*Sz = -0.707*1*(-1) = 0.707
    // r21=(cx*sy_*sz_+sx_*cz)*Sy = (0.707*1)*1 = 0.707
    // r22=cx*cy*Sz = 0.707*1*(-1) = -0.707
    // v = (0, 0, 10): y = 0.707*10 = 7.07, z = -0.707*10 = -7.07
    const result = applyMatrix4ToVec3(m, { x: 0, y: 0, z: 10 })
    expect(result.x).toBeCloseTo(0, 3)
    expect(result.y).toBeCloseTo(7.07, 1)
    expect(result.z).toBeCloseTo(-7.07, 1)
  })

  it('all negative scales (inversion) with rotation', () => {
    const m = buildTransformMatrix(
      { x: 0, y: 0, z: 0 },
      { rotX: 0, rotY: 90, rotZ: 0 },
      { scaleX: -1, scaleY: -1, scaleZ: -1 },
    )
    // RS matrix for all neg, rotY=90°:
    // r02=sy_*Sz = 1*(-1) = -1
    // r20=(-cx*sy_*cz+sx_*sz_)*Sx = (-1*1*1)*(-1) = 1
    // v = (1, 2, 3): x = -1*3 = -3, y = -1*2 = -2, z = 1*1 = 1
    const result = applyMatrix4ToVec3(m, { x: 1, y: 2, z: 3 })
    expect(result.x).toBeCloseTo(-3, 3)
    expect(result.y).toBeCloseTo(-2, 3)
    expect(result.z).toBeCloseTo(1, 3)
  })
})
