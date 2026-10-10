// ============================================================
// Worker Matrix — pure transform math for tests and shared use
// ============================================================

/**
 * Compute RS (Rotation × Scale) matrix elements from transform parameters.
 *
 * FIX (CODE-R16-1): Extracted shared logic to eliminate duplication between
 * rebuild.ts and worker-matrix.ts. Returns row-indexed elements r<row><col>.
 *
 * FIX (ROT-XYZ): Matrix now matches Three.js Euler 'XYZ' order exactly.
 * Three.js 'XYZ' means intrinsic rotations applied X→Y→Z, which in matrix
 * form is R = Rx · Ry · Rz. The previous code computed Rz · Ry · Rx, which
 * only matches for single-axis rotations but diverges for multi-axis
 * (e.g. rotX=30 + rotY=45 → distorted geometry in CSG operations).
 *
 * @param rot   Rotation in degrees (rotX, rotY, rotZ), Three.js Euler 'XYZ'
 * @param scale Scale factors (scaleX, scaleY, scaleZ)
 * @returns 9 elements: [r00, r01, r02, r10, r11, r12, r20, r21, r22]
 */
export function computeRSMatrix(
  rot: { rotX: number; rotY: number; rotZ: number },
  scale: { scaleX: number; scaleY: number; scaleZ: number },
): [number, number, number, number, number, number, number, number, number] {
  const Sx = scale.scaleX, Sy = scale.scaleY, Sz = scale.scaleZ
  const rx = rot.rotX * (Math.PI / 180)
  const ry = rot.rotY * (Math.PI / 180)
  const rz = rot.rotZ * (Math.PI / 180)

  const cx = Math.cos(rx), sx_ = Math.sin(rx)
  const cy = Math.cos(ry), sy_ = Math.sin(ry)
  const cz = Math.cos(rz), sz_ = Math.sin(rz)

  // R = Rx · Ry · Rz  (Three.js Euler 'XYZ' intrinsic order)
  // Scale applied per-column (S = diag(Sx, Sy, Sz), RS = R·S)
  return [
    cy * cz * Sx,                           // r00
    -cy * sz_ * Sy,                          // r01
    sy_ * Sz,                               // r02
    (cx * sz_ + sx_ * sy_ * cz) * Sx,       // r10
    (cx * cz - sx_ * sy_ * sz_) * Sy,       // r11
    -sx_ * cy * Sz,                         // r12
    (-cx * sy_ * cz + sx_ * sz_) * Sx,      // r20
    (cx * sy_ * sz_ + sx_ * cz) * Sy,       // r21
    cx * cy * Sz,                           // r22
  ]
}

/**
 * Build SRT matrix around object center.
 *
 * Formula: T(pos) × RS × T(-pos), where:
 * - RS = Scale × Rotation (Euler XYZ, column-major)
 * - T(-pos) = translate to origin
 * - T(pos) = translate back
 *
 * Translation column = pos − RS·pos
 */
export function buildSRTMatrixAroundCenter(
  pos: { x: number; y: number; z: number },
  rot: { rotX: number; rotY: number; rotZ: number },
  scale: { scaleX: number; scaleY: number; scaleZ: number },
): number[] {
  const { x: px, y: py, z: pz } = pos
  const [r00, r01, r02, r10, r11, r12, r20, r21, r22] = computeRSMatrix(rot, scale)

  // Translation = pos − RS·pos
  const tx = px - (r00 * px + r01 * py + r02 * pz)
  const ty = py - (r10 * px + r11 * py + r12 * pz)
  const tz = pz - (r20 * px + r21 * py + r22 * pz)

  // Column-major 4×4
  return [
    r00, r10, r20, 0,
    r01, r11, r21, 0,
    r02, r12, r22, 0,
    tx, ty, tz, 1,
  ]
}

/**
 * Build RS × T matrix for primitives centered at origin.
 *
 * Unlike buildSRTMatrixAroundCenter (which applies RS around `pos`), this
 * function applies RS around the origin (0,0,0) and then translates by `pos`.
 *
 * Matrix layout: [RS, 0; pos, 1]
 * For a vertex v at origin:  v' = RS × v + pos
 * When RS = I:                v' = v + pos   (pure translation)
 *
 * Use this for primitives built by buildPrimitive() whose geometry is
 * already centered at (0,0,0).  buildSRTMatrixAroundCenter must be used
 * only when the geometry has already been translated and we need to apply
 * rotation/scale around its current center.
 */
export function buildTransformMatrix(
  pos: { x: number; y: number; z: number },
  rot: { rotX: number; rotY: number; rotZ: number },
  scale: { scaleX: number; scaleY: number; scaleZ: number },
): number[] {
  const { x: px, y: py, z: pz } = pos
  const [r00, r01, r02, r10, r11, r12, r20, r21, r22] = computeRSMatrix(rot, scale)

  // Column-major 4×4: [RS, 0; pos, 1]
  return [
    r00, r10, r20, 0,
    r01, r11, r21, 0,
    r02, r12, r22, 0,
    px, py, pz, 1,
  ]
}

/**
 * Apply a 4×4 matrix to a 3D vector (with homogeneous coordinate).
 */
export function applyMatrix4ToVec3(
  m: number[],
  v: { x: number; y: number; z: number },
): { x: number; y: number; z: number } {
  // Column-major multiplication: v' = M × v
  const x = m[0] * v.x + m[4] * v.y + m[8] * v.z + m[12]
  const y = m[1] * v.x + m[5] * v.y + m[9] * v.z + m[13]
  const z = m[2] * v.x + m[6] * v.y + m[10] * v.z + m[14]
  return { x, y, z }
}

// ============================================================
// Phase 8, Stage 2 — Transform composition utilities
// ============================================================

import type { RelativeTransform, TransformNR, Vec3 } from './types'

/**
 * 3×3 rotation matrix from Euler XYZ angles (degrees).
 * R = Rx · Ry · Rz — same order as computeRSMatrix.
 * Returns row-major: [m00,m01,m02, m10,m11,m12, m20,m21,m22].
 */
function rotMatrixFromEulerXYZ(
  rotX: number, rotY: number, rotZ: number,
): number[] {
  const rx = rotX * (Math.PI / 180)
  const ry = rotY * (Math.PI / 180)
  const rz = rotZ * (Math.PI / 180)
  const cx = Math.cos(rx), sx = Math.sin(rx)
  const cy = Math.cos(ry), sy = Math.sin(ry)
  const cz = Math.cos(rz), sz = Math.sin(rz)
  return [
    cy * cz, -cy * sz, sy,
    cx * sz + sx * sy * cz, cx * cz - sx * sy * sz, -sx * cy,
    -cx * sy * cz + sx * sz, cx * sy * sz + sx * cz, cx * cy,
  ]
}

/** Multiply two 3×3 matrices (row-major). */
function mul3x3(a: number[], b: number[]): number[] {
  const r = new Array<number>(9)
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      r[row * 3 + col] =
        a[row * 3] * b[col] +
        a[row * 3 + 1] * b[3 + col] +
        a[row * 3 + 2] * b[6 + col]
    }
  }
  return r
}

/** Transpose a 3×3 matrix (row-major). For rotation matrices, transpose = inverse. */
function transpose3x3(m: number[]): number[] {
  return [
    m[0], m[3], m[6],
    m[1], m[4], m[7],
    m[2], m[5], m[8],
  ]
}

/** Multiply 3×3 matrix (row-major) by a 3-vector. */
function mul3x3Vec(m: number[], v: Vec3): Vec3 {
  return {
    x: m[0] * v.x + m[1] * v.y + m[2] * v.z,
    y: m[3] * v.x + m[4] * v.y + m[5] * v.z,
    z: m[6] * v.x + m[7] * v.y + m[8] * v.z,
  }
}

/**
 * Extract Euler XYZ angles (degrees) from a 3×3 rotation matrix (row-major).
 * Inverse of rotMatrixFromEulerXYZ.
 */
function eulerXYZFromRotMatrix(m: number[]): { rotX: number; rotY: number; rotZ: number } {
  // R[0][2] = sin(ry)
  const sinRy = Math.max(-1, Math.min(1, m[2]))
  const ry = Math.asin(sinRy)
  const cosRy = Math.cos(ry)

  let rx: number, rz: number
  if (Math.abs(cosRy) > 1e-9) {
    // R[1][2] = -sin(rx)*cos(ry), R[2][2] = cos(rx)*cos(ry)
    rx = Math.atan2(-m[5], m[8])
    // R[0][1] = -cos(ry)*sin(rz), R[0][0] = cos(ry)*cos(rz)
    rz = Math.atan2(-m[1], m[0])
  } else {
    // Gimbal lock: cos(ry) ≈ 0, set rz=0
    // R[1][0] = sin(rx)*sin(ry)*cos(rz)+cos(rx)*sin(rz) → with rz=0: sin(rx)*sin(ry)
    // R[1][1] = -sin(rx)*sin(ry)*sin(rz)+cos(rx)*cos(rz) → with rz=0: cos(rx)
    // Actually with rz=0: R[2][1] = cos(rx)*sin(ry), R[1][1] = cos(rx)
    // Use R[2][1]/R[1][1] won't work. Use R[1][0] and R[1][1]:
    // R[1][0] = sin(rx)*sin(ry), R[1][1] = cos(rx) → but sin(ry)=±1
    // Simpler: R[2][1] = cos(rx)*sin(ry)*sin(rz)+sin(rx)*cos(rz) → with rz=0: sin(rx)
    // R[1][1] = cos(rx) (with rz=0, sin(ry)=±1: -sin(rx)*±1*0+cos(rx)*1=cos(rx))
    rx = Math.atan2(m[7], m[4])
    rz = 0
  }

  return {
    rotX: rx * (180 / Math.PI),
    rotY: ry * (180 / Math.PI),
    rotZ: rz * (180 / Math.PI),
  }
}

/** Identity TransformNR. */
function identityTransform(): TransformNR {
  return { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 }
}

/**
 * Композиция трансформов: world = parent ∘ relative.
 * Порядок: сначала relative (локальный), затем parent (мировой).
 * Rotation — Euler XYZ (как в computeRSMatrix).
 * См. ARCHITECTURE_TRANSFORMS.md §3.2.
 *
 * Формулы:
 *   world.position = parent.position + R(parent.rot) · (S(parent.scale) · relative.positionDelta)
 *   world.rotation = Euler XYZ extraction of R(parent.rot) · R(relative.rotationDelta)
 *   world.scale    = parent.scale * relative.scaleRatio
 *
 * Edge cases:
 *   - parent === null && relative === null → identity
 *   - parent === null → relative as TransformNR
 *   - relative === null → parent as-is
 */
export function composeTransforms(
  parent: TransformNR | null,
  relative: RelativeTransform | null,
): TransformNR {
  if (parent === null && relative === null) return identityTransform()
  if (parent === null) {
    // Convert relative to absolute TransformNR
    return {
      x: relative!.positionDelta.x,
      y: relative!.positionDelta.y,
      z: relative!.positionDelta.z,
      rotX: relative!.rotationDelta.x,
      rotY: relative!.rotationDelta.y,
      rotZ: relative!.rotationDelta.z,
      scaleX: relative!.scaleRatio.x,
      scaleY: relative!.scaleRatio.y,
      scaleZ: relative!.scaleRatio.z,
    }
  }
  if (relative === null) return { ...parent }

  // Position: parent_pos + R(parent_rot) * (S(parent_scale) * rel_pos)
  const R = rotMatrixFromEulerXYZ(parent.rotX, parent.rotY, parent.rotZ)
  const scaledDelta: Vec3 = {
    x: parent.scaleX * relative.positionDelta.x,
    y: parent.scaleY * relative.positionDelta.y,
    z: parent.scaleZ * relative.positionDelta.z,
  }
  const rotatedDelta = mul3x3Vec(R, scaledDelta)

  // Rotation: R_world = R_parent * R_relative, extract Euler XYZ
  const R_rel = rotMatrixFromEulerXYZ(
    relative.rotationDelta.x, relative.rotationDelta.y, relative.rotationDelta.z,
  )
  const R_world = mul3x3(R, R_rel)
  const worldRot = eulerXYZFromRotMatrix(R_world)

  // Scale: element-wise multiply
  return {
    x: parent.x + rotatedDelta.x,
    y: parent.y + rotatedDelta.y,
    z: parent.z + rotatedDelta.z,
    rotX: worldRot.rotX,
    rotY: worldRot.rotY,
    rotZ: worldRot.rotZ,
    scaleX: parent.scaleX * relative.scaleRatio.x,
    scaleY: parent.scaleY * relative.scaleRatio.y,
    scaleZ: parent.scaleZ * relative.scaleRatio.z,
  }
}

/**
 * Обратная к composeTransforms операция: вычисляет relativeToParent из world и parent.
 * world = composeTransforms(parent, result) с точностью ±1e-6 по всем 9 компонентам.
 * Rotation — Euler XYZ (как в computeRSMatrix).
 * См. ARCHITECTURE_TRANSFORMS.md §3.2.
 *
 * Формулы:
 *   relative.scaleRatio    = world.scale / parent.scale
 *   relative.rotationDelta = Euler XYZ extraction of R(parent.rot)^T · R(world.rot)
 *   relative.positionDelta = (R(parent.rot)^T · (world.position - parent.position)) / parent.scale
 *
 * Round-trip: composeTransforms(parent, subtractTransform(world, parent)) ≈ world.
 */
export function subtractTransform(
  world: TransformNR,
  parent: TransformNR | null,
): RelativeTransform {
  if (parent === null) {
    // World is already relative to origin
    return {
      positionDelta: { x: world.x, y: world.y, z: world.z },
      rotationDelta: { x: world.rotX, y: world.rotY, z: world.rotZ },
      scaleRatio: { x: world.scaleX, y: world.scaleY, z: world.scaleZ },
    }
  }

  // Inverse rotation matrix (transpose for orthogonal)
  const R_parent = rotMatrixFromEulerXYZ(parent.rotX, parent.rotY, parent.rotZ)
  const R_parent_inv = transpose3x3(R_parent)

  // positionDelta = R_parent_inv * (world_pos - parent_pos) / parent_scale
  const d: Vec3 = { x: world.x - parent.x, y: world.y - parent.y, z: world.z - parent.z }
  const rotated = mul3x3Vec(R_parent_inv, d)
  const positionDelta: Vec3 = {
    x: rotated.x / parent.scaleX,
    y: rotated.y / parent.scaleY,
    z: rotated.z / parent.scaleZ,
  }

  // rotationDelta: R_rel = R_parent^T * R_world
  const R_world = rotMatrixFromEulerXYZ(world.rotX, world.rotY, world.rotZ)
  const R_rel = mul3x3(R_parent_inv, R_world)
  const relRot = eulerXYZFromRotMatrix(R_rel)

  // scaleRatio
  return {
    positionDelta,
    rotationDelta: { x: relRot.rotX, y: relRot.rotY, z: relRot.rotZ },
    scaleRatio: {
      x: world.scaleX / parent.scaleX,
      y: world.scaleY / parent.scaleY,
      z: world.scaleZ / parent.scaleZ,
    },
  }
}
