// ============================================================
// Worker Matrix — чистая математика трансформаций для тестов
// ============================================================

/**
 * Вычислить матрицу RS×T вокруг центра объекта.
 *
 * Формула: T(pos) × RS × T(-pos), где:
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
  const Sx = scale.scaleX, Sy = scale.scaleY, Sz = scale.scaleZ
  const rx = rot.rotX * (Math.PI / 180)
  const ry = rot.rotY * (Math.PI / 180)
  const rz = rot.rotZ * (Math.PI / 180)

  const cx = Math.cos(rx), sx_ = Math.sin(rx)
  const cy = Math.cos(ry), sy_ = Math.sin(ry)
  const cz = Math.cos(rz), sz_ = Math.sin(rz)

  // RS matrix elements (row-indexed: r<row><col>)
  const r00 = cz * cy * Sx
  const r01 = (cz * sy_ * sx_ - sz_ * cx) * Sy
  const r02 = (cz * sy_ * cx + sz_ * sx_) * Sz
  const r10 = sz_ * cy * Sx
  const r11 = (sz_ * sy_ * sx_ + cz * cx) * Sy
  const r12 = (sz_ * sy_ * cx - cz * sx_) * Sz
  const r20 = -sy_ * Sx
  const r21 = cy * sx_ * Sy
  const r22 = cy * cx * Sz

  // Translation = pos − RS·pos
  const tx = px - (r00 * px + r01 * py + r02 * pz)
  const ty = py - (r10 * px + r11 * py + r12 * pz)
  const tz = pz - (r20 * px + r21 * py + r22 * pz)

  // Column-major 4×4
  return [
    r00, r10, r20, 0,
    r01, r11, r21, 0,
    r02, r12, r22, 0,
    tx,  ty,  tz,  1,
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
  const Sx = scale.scaleX, Sy = scale.scaleY, Sz = scale.scaleZ
  const rx = rot.rotX * (Math.PI / 180)
  const ry = rot.rotY * (Math.PI / 180)
  const rz = rot.rotZ * (Math.PI / 180)

  const cx = Math.cos(rx), sx_ = Math.sin(rx)
  const cy = Math.cos(ry), sy_ = Math.sin(ry)
  const cz = Math.cos(rz), sz_ = Math.sin(rz)

  // RS matrix elements (column-major)
  const r00 = cz * cy * Sx
  const r01 = (cz * sy_ * sx_ - sz_ * cx) * Sy
  const r02 = (cz * sy_ * cx + sz_ * sx_) * Sz
  const r10 = sz_ * cy * Sx
  const r11 = (sz_ * sy_ * sx_ + cz * cx) * Sy
  const r12 = (sz_ * sy_ * sx_ - cz * sx_) * Sz
  const r20 = -sy_ * Sx
  const r21 = cy * sx_ * Sy
  const r22 = cy * cx * Sz

  // Column-major 4×4: [RS, 0; pos, 1]
  return [
    r00, r10, r20, 0,
    r01, r11, r21, 0,
    r02, r12, r22, 0,
    px,  py,  pz,  1,
  ]
}

/**
 * Применить матрицу 4×4 к вектору 3D (с учётом homogeneous coordinate).
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
