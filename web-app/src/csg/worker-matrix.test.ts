// ============================================================
// Unit tests — worker-matrix: SRT matrix calculations
// FIX (WARN-R3-3): applySRAroundCenter теперь покрыт тестами
// ============================================================

import { describe, it, expect } from 'vitest'
import { buildSRTMatrixAroundCenter, applyMatrix4ToVec3 } from './worker-matrix'

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
