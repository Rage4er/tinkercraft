// ============================================================
// Unit tests — worker-matrix: SRT matrix calculations
// FIX (WARN-R3-3): applySRAroundCenter теперь покрыт тестами
// ============================================================

import { describe, it, expect } from 'vitest'
import { buildSRTMatrixAroundCenter, buildTransformMatrix, applyMatrix4ToVec3 } from './worker-matrix'

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
})
