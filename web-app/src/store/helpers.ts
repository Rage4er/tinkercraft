// ============================================================
// Store helpers — shared utilities for document-store
// ============================================================

import type {
  SceneObject, ShapeType, ShapeParams, TransformNR, Vec3,
} from '../csg/types'
import { OBJECT_COLORS } from '../constants'

// ---- AABB ----
export function computeAABB(vertices: Float32Array): { min: Vec3; max: Vec3 } {
  let minX = Infinity, maxX = -Infinity
  let minY = Infinity, maxY = -Infinity
  let minZ = Infinity, maxZ = -Infinity
  for (let i = 0; i < vertices.length; i += 3) {
    if (vertices[i] < minX) minX = vertices[i]; if (vertices[i] > maxX) maxX = vertices[i]
    if (vertices[i + 1] < minY) minY = vertices[i + 1]; if (vertices[i + 1] > maxY) maxY = vertices[i + 1]
    if (vertices[i + 2] < minZ) minZ = vertices[i + 2]; if (vertices[i + 2] > maxZ) maxZ = vertices[i + 2]
  }
  return { min: { x: minX, y: minY, z: minZ }, max: { x: maxX, y: maxY, z: maxZ } }
}

/**
 * Вычисляет мировую ограничивающую рамку (AABB) объекта.
 *
 * Для примитивов — из params + transform.position (надёжно, не зависит от вершин).
 * Для CSG/import — из кэшированного aabb (вершины уже содержат translate).
 *
 * Важно: obj.aabb кэшируется при создании, но НЕ обновляется при moveObject.
 * Поэтому для примитивов считаем bbox заново из params.
 */
export function computeWorldAABB(obj: SceneObject): { min: Vec3; max: Vec3 } {
  // 1. Примитивы — считаем из params + transform (надёжно)
  if (obj.params && obj.params.width !== undefined && obj.params.height !== undefined && obj.params.depth !== undefined) {
    const w = obj.params.width / 2
    const h = obj.params.height / 2
    const d = obj.params.depth / 2
    const p = obj.transform
    return {
      min: { x: p.x - w, y: p.y - h, z: p.z - d },
      max: { x: p.x + w, y: p.y + h, z: p.z + d },
    }
  }
  // 2. Сфера
  if (obj.params && obj.params.radius !== undefined) {
    const r = obj.params.radius
    const p = obj.transform
    return {
      min: { x: p.x - r, y: p.y - r, z: p.z - r },
      max: { x: p.x + r, y: p.y + r, z: p.z + r },
    }
  }
  // 3. CSG / import — используем кэшированный aabb (вершины уже содержат translate)
  return obj.aabb ?? computeAABB(obj.vertices)
}

/** Returns bbox center for a vertex buffer (no mutation). */
export function computeCenter(vertices: Float32Array): Vec3 {
  const { min, max } = computeAABB(vertices)
  return { x: (min.x + max.x) / 2, y: (min.y + max.y) / 2, z: (min.z + max.z) / 2 }
}

/** Shifts vertices so bbox center is at origin; MUTATES the input array in-place.
/**
 * Extract center from vertices, center them in place, and return center.
 * MUTATES the input array — caller should pass a copy if they need the original.
 * FIX (MED-18-6): Explicit mutation documented in JSDoc and name (extractAndCenterInPlace).
 * @returns the offset {cx, cy, cz} that was subtracted from all vertices.
 */
export function extractAndCenterInPlace(vertices: Float32Array): { cx: number; cy: number; cz: number } {
  if (vertices.length === 0) return { cx: 0, cy: 0, cz: 0 }
  const c = computeCenter(vertices)
  for (let i = 0; i < vertices.length; i += 3) {
    vertices[i] -= c.x; vertices[i + 1] -= c.y; vertices[i + 2] -= c.z
  }
  return { cx: c.x, cy: c.y, cz: c.z }
}

// Computes the bbox center of a vertex buffer, shifts all vertices so the
// center is at the origin, returns the offset, and returns the AABB of
// the CENTERED geometry (after shifting). Single-pass: O(n).
//
// Prefer this over extractAndCenterInPlace() + makeObject() (two passes) for
// CSG results where both centering and AABB-caching are needed.
export function extractAndCenterGetAABB(vertices: Float32Array): {
  cx: number; cy: number; cz: number
  aabb: { min: Vec3; max: Vec3 }
} {
  if (vertices.length === 0) return { cx: 0, cy: 0, cz: 0, aabb: { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } } }

  // Single pass: find bbox center, then shift + compute centered AABB
  let minX = Infinity, maxX = -Infinity
  let minY = Infinity, maxY = -Infinity
  let minZ = Infinity, maxZ = -Infinity
  for (let i = 0; i < vertices.length; i += 3) {
    if (vertices[i] < minX) minX = vertices[i]; if (vertices[i] > maxX) maxX = vertices[i]
    if (vertices[i + 1] < minY) minY = vertices[i + 1]; if (vertices[i + 1] > maxY) maxY = vertices[i + 1]
    if (vertices[i + 2] < minZ) minZ = vertices[i + 2]; if (vertices[i + 2] > maxZ) maxZ = vertices[i + 2]
  }
  const cx = (minX + maxX) / 2
  const cy = (minY + maxY) / 2
  const cz = (minZ + maxZ) / 2

  // Shift + compute centered AABB in one pass
  let cMinX = Infinity, cMaxX = -Infinity
  let cMinY = Infinity, cMaxY = -Infinity
  let cMinZ = Infinity, cMaxZ = -Infinity
  for (let i = 0; i < vertices.length; i += 3) {
    vertices[i] -= cx; if (vertices[i] < cMinX) cMinX = vertices[i]; if (vertices[i] > cMaxX) cMaxX = vertices[i]
    vertices[i + 1] -= cy; if (vertices[i + 1] < cMinY) cMinY = vertices[i + 1]; if (vertices[i + 1] > cMaxY) cMaxY = vertices[i + 1]
    vertices[i + 2] -= cz; if (vertices[i + 2] < cMinZ) cMinZ = vertices[i + 2]; if (vertices[i + 2] > cMaxZ) cMaxZ = vertices[i + 2]
  }

  return { cx, cy, cz, aabb: { min: { x: cMinX, y: cMinY, z: cMinZ }, max: { x: cMaxX, y: cMaxY, z: cMaxZ } } }
}

/** Extract AABB and center vertices relative to a GIVEN point (not bbox center).
 *
 * FIX (CSG-TRANSFORM-IS-CENTROID): For CSG results, vertices must be centered
 * relative to transformA (first operand position), NOT the CSG bbox center.
 * The bbox center differs from transformA for asymmetric geometry (e.g., cube+prism),
 * causing the CSG result to render at a shifted position.
 *
 * This function centers vertices at `center` and returns the AABB of the
 * CENTERED geometry. Single-pass: O(n).
 */
export function extractCenteredAt(vertices: Float32Array, center: { x: number; y: number; z: number }): {
  aabb: { min: Vec3; max: Vec3 }
} {
  if (vertices.length === 0) return { aabb: { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } } }

  // Shift vertices relative to `center` + compute centered AABB in one pass
  let cMinX = Infinity, cMaxX = -Infinity
  let cMinY = Infinity, cMaxY = -Infinity
  let cMinZ = Infinity, cMaxZ = -Infinity
  for (let i = 0; i < vertices.length; i += 3) {
    vertices[i] -= center.x; if (vertices[i] < cMinX) cMinX = vertices[i]; if (vertices[i] > cMaxX) cMaxX = vertices[i]
    vertices[i + 1] -= center.y; if (vertices[i + 1] < cMinY) cMinY = vertices[i + 1]; if (vertices[i + 1] > cMaxY) cMaxY = vertices[i + 1]
    vertices[i + 2] -= center.z; if (vertices[i + 2] < cMinZ) cMinZ = vertices[i + 2]; if (vertices[i + 2] > cMaxZ) cMaxZ = vertices[i + 2]
  }

  return { aabb: { min: { x: cMinX, y: cMinY, z: cMinZ }, max: { x: cMaxX, y: cMaxY, z: cMaxZ } } }
}

/**
 * Проверяет, замкнута ли mesh (manifold): для каждого направленного ребра (a,b)
 * существует парное (b,a). Незамкнутая mesh (дырявый импортный STL) не имеет
 * корректного объёма — для неё нельзя применять объёмный центроид.
 */
function isClosedMesh(indices: Uint32Array): boolean {
  // Ключ ребра a * stride + b: stride гарантированно больше любого индекса,
  // поэтому ключи уникальны и точны (<= 2^53 для mesh разумного размера).
  const stride = Math.floor(indices.length / 3) * 3 + 3
  const directed = new Set<number>()
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i], b = indices[i + 1], c = indices[i + 2]
    directed.add(a * stride + b)
    directed.add(b * stride + c)
    directed.add(c * stride + a)
  }
  for (const key of directed) {
    const a = Math.floor(key / stride)
    const b = key % stride
    if (!directed.has(b * stride + a)) return false
  }
  return true
}

/**
 * Центрирует mesh по ЦЕНТРУ МАСС (объёмный центроид замкнутой поверхности).
 * НЕ по BBox! BBox-центр ≠ центр масс для prism/pyramid.
 * Мутирует vertices in-place. Возвращает смещение.
 * См. ARCHITECTURE_TRANSFORMS.md §5.3.
 *
 * Замкнутая mesh (manifold-результаты CSG, примитивы) — объёмный центроид
 * (теорема дивергенции): C = Σ(v0+v1+v2)·sv / (4·Σ sv), где
 * sv = dot(v0, cross(v1, v2)) = 6 × signed объём тетраэдра (origin, v0, v1, v2).
 * Даёт h/2 для призмы и h/4 для пирамиды.
 *
 * Незамкнутая mesh (импортированный STL с дырами) — откат на площадной
 * центроид (взвешенный по площади треугольников), иначе объёмная формула
 * дала бы бессмысленный pivot.
 *
 * Пустой массив → { cx: 0, cy: 0, cz: 0 }, не падает.
 */
export function centerMassAtOrigin(
  vertices: Float32Array,
  indices: Uint32Array,
): { cx: number; cy: number; cz: number } {
  if (vertices.length === 0 || indices.length === 0) {
    return { cx: 0, cy: 0, cz: 0 }
  }

  let massCx = 0, massCy = 0, massCz = 0

  if (isClosedMesh(indices)) {
    // Объёмный центроид замкнутой mesh (divergence theorem)
    let totalSignedVol = 0
    let wx = 0, wy = 0, wz = 0

    for (let i = 0; i < indices.length; i += 3) {
      const i0 = indices[i]
      const i1 = indices[i + 1]
      const i2 = indices[i + 2]

      const v0x = vertices[i0 * 3], v0y = vertices[i0 * 3 + 1], v0z = vertices[i0 * 3 + 2]
      const v1x = vertices[i1 * 3], v1y = vertices[i1 * 3 + 1], v1z = vertices[i1 * 3 + 2]
      const v2x = vertices[i2 * 3], v2y = vertices[i2 * 3 + 1], v2z = vertices[i2 * 3 + 2]

      // sv = dot(v0, cross(v1, v2)) = 6 × signed объём тетраэдра (origin, v0, v1, v2)
      const sv = v0x * (v1y * v2z - v1z * v2y)
        + v0y * (v1z * v2x - v1x * v2z)
        + v0z * (v1x * v2y - v1y * v2x)

      totalSignedVol += sv
      wx += (v0x + v1x + v2x) * sv
      wy += (v0y + v1y + v2y) * sv
      wz += (v0z + v1z + v2z) * sv
    }

    if (Math.abs(totalSignedVol) > 1e-12) {
      const inv = 1 / (4 * totalSignedVol)
      massCx = wx * inv
      massCy = wy * inv
      massCz = wz * inv
    } else {
      return { cx: 0, cy: 0, cz: 0 }
    }
  } else {
    // Незамкнутая mesh: площадной центроид (взвешенный по площади треугольников)
    let totalArea = 0
    let ax = 0, ay = 0, az = 0
    for (let i = 0; i < indices.length; i += 3) {
      const i0 = indices[i]
      const i1 = indices[i + 1]
      const i2 = indices[i + 2]
      const v0x = vertices[i0 * 3], v0y = vertices[i0 * 3 + 1], v0z = vertices[i0 * 3 + 2]
      const v1x = vertices[i1 * 3], v1y = vertices[i1 * 3 + 1], v1z = vertices[i1 * 3 + 2]
      const v2x = vertices[i2 * 3], v2y = vertices[i2 * 3 + 1], v2z = vertices[i2 * 3 + 2]
      const e1x = v1x - v0x, e1y = v1y - v0y, e1z = v1z - v0z
      const e2x = v2x - v0x, e2y = v2y - v0y, e2z = v2z - v0z
      const crossX = e1y * e2z - e1z * e2y
      const crossY = e1z * e2x - e1x * e2z
      const crossZ = e1x * e2y - e1y * e2x
      const area = 0.5 * Math.sqrt(crossX * crossX + crossY * crossY + crossZ * crossZ)
      if (area === 0) continue
      totalArea += area
      ax += (v0x + v1x + v2x) / 3 * area
      ay += (v0y + v1y + v2y) / 3 * area
      az += (v0z + v1z + v2z) / 3 * area
    }
    if (totalArea === 0) return { cx: 0, cy: 0, cz: 0 }
    massCx = ax / totalArea
    massCy = ay / totalArea
    massCz = az / totalArea
  }

  // Shift vertices in-place
  for (let i = 0; i < vertices.length; i += 3) {
    vertices[i] -= massCx
    vertices[i + 1] -= massCy
    vertices[i + 2] -= massCz
  }

  return { cx: massCx, cy: massCy, cz: massCz }
}

/** Creates a SceneObject with cached AABB. Use everywhere a new object is created. */
// FIX (LOW-18-6): Accept optional pre-computed AABB to avoid redundant computeAABB calls.
export function makeObject(partial: Omit<SceneObject, 'aabb'> & { aabb?: SceneObject['aabb'] }): SceneObject {
  return { ...partial, aabb: partial.aabb ?? computeAABB(partial.vertices) }
}

// ---- ID generator ----
let _idCounter = 0
export function nextId(prefix = 'obj'): string { return `${prefix}_${++_idCounter}` }

/** Resets the ID counter (for testing only). */
export function resetIdCounter(): void { _idCounter = 0 }

// ---- Colors ----
export function colorForIndex(n: number): string { return OBJECT_COLORS[n % OBJECT_COLORS.length] }

// ---- Clipboard entry ----
export interface ClipEntry {
  shapeType: ShapeType
  params: ShapeParams
  color: string
  transform: TransformNR
  // For import_mesh:
  importVertices?: Float32Array
  importIndices?: Uint32Array
  // For CSG results (pasted as baked mesh):
  csgVertices?: Float32Array
  csgIndices?: Uint32Array
  csgNormals?: Float32Array
  csgAABB?: { min: Vec3; max: Vec3 }
  csgOriginalBboxSize?: { x: number; y: number; z: number }
}
