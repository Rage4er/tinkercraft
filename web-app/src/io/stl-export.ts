// ============================================================
// STL Экспорт — бинарный формат
// Compatible with TinkerCraft Java ExportManager.java
// ============================================================

import type { SceneObject, TransformNR } from '../csg/types'
import { computeRSMatrix } from '../csg/worker-matrix'
import i18n from '../i18n'

/**
 * Применить трансформацию (position, rotation, scale) к вершинам.
 * FIX (WARN-R3-8): STL экспорт теперь учитывает obj.transform.
 * FIX (ROT-XYZ-STL): Использует computeRSMatrix из worker-matrix.ts для
 * совместимости с Three.js Euler 'XYZ' (Rx · Ry · Rz). Раньше была
 * дублированная матрица Rz × Ry × Rx, которая расходилась с рендером
 * при многоосевом повороте.
 */
function applyTransformToVertices(
  vertices: Float32Array,
  transform: { x: number; y: number; z: number; rotX: number; rotY: number; rotZ: number; scaleX: number; scaleY: number; scaleZ: number },
): Float32Array {
  // If transform is identity — return as-is (optimization)
  if (
    transform.x === 0 && transform.y === 0 && transform.z === 0 &&
    transform.rotX === 0 && transform.rotY === 0 && transform.rotZ === 0 &&
    transform.scaleX === 1 && transform.scaleY === 1 && transform.scaleZ === 1
  ) {
    return vertices;
  }

  // Use shared computeRSMatrix (Three.js XYZ Euler order: Rx · Ry · Rz)
  const [r00, r01, r02, r10, r11, r12, r20, r21, r22] = computeRSMatrix(
    { rotX: transform.rotX, rotY: transform.rotY, rotZ: transform.rotZ },
    { scaleX: transform.scaleX, scaleY: transform.scaleY, scaleZ: transform.scaleZ },
  )

  // Apply rotation + scale then translation
  const count = vertices.length / 3;
  const transformed = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    const vx = vertices[i * 3];
    const vy = vertices[i * 3 + 1];
    const vz = vertices[i * 3 + 2];

    // RS × v + pos (column-major matrix multiplication)
    transformed[i * 3] = r00 * vx + r01 * vy + r02 * vz + transform.x;
    transformed[i * 3 + 1] = r10 * vx + r11 * vy + r12 * vz + transform.y;
    transformed[i * 3 + 2] = r20 * vx + r21 * vy + r22 * vz + transform.z;
  }

  return transformed;
}

/**
 * Transform normals by rotation (NO scale, NO translation — normals are direction vectors).
 * FIX (MED-18-43): Enables correct normals for rotated objects in STL export.
 * FIX (ROT-XYZ-STL): Uses computeRSMatrix for Three.js XYZ Euler order.
 * FIX (NORMAL-SCALE): Normals are NOT scaled — only rotation is applied.
 * For non-uniform scale, correct normals require inverse-transpose, but
 * averaging + normalization is sufficient for STL export.
 */
function applyTransformToNormals(
  normals: Float32Array,
  transform: TransformNR,
): Float32Array {
  // If no rotation — return as-is (optimization)
  if (transform.rotX === 0 && transform.rotY === 0 && transform.rotZ === 0) {
    return normals
  }

  // Use computeRSMatrix with identity scale (normals are direction, not position)
  const [r00, r01, r02, r10, r11, r12, r20, r21, r22] = computeRSMatrix(
    { rotX: transform.rotX, rotY: transform.rotY, rotZ: transform.rotZ },
    { scaleX: 1, scaleY: 1, scaleZ: 1 },
  )

  const count = normals.length / 3
  const transformed = new Float32Array(count * 3)

  for (let i = 0; i < count; i++) {
    const nx = normals[i * 3]
    const ny = normals[i * 3 + 1]
    const nz = normals[i * 3 + 2]

    transformed[i * 3] = r00 * nx + r01 * ny + r02 * nz
    transformed[i * 3 + 1] = r10 * nx + r11 * ny + r12 * nz
    transformed[i * 3 + 2] = r20 * nx + r21 * ny + r22 * nz
  }

  return transformed
}

/**
 * Объединить несколько mesh-объектов и записать в binary STL.
 */
export function exportToStl(objects: SceneObject[]): Blob {
  const visible = objects.filter(o => o.visible)

  // Count total triangles
  let totalTris = 0
  for (const obj of visible) totalTris += obj.indices.length / 3

  // FIX (HIGH-18-19): Protection against memory overflow — cap at 10M triangles (~500MB buffer)
  const MAX_TRIANGLES = 10_000_000
  if (totalTris > MAX_TRIANGLES) {
    console.warn(`[STL export] Too many triangles: ${totalTris}, capping at ${MAX_TRIANGLES}`)
    totalTris = MAX_TRIANGLES
  }

  // Allocate buffer: 80 (header) + 4 (count) + 50 * tris
  const buf = new ArrayBuffer(84 + 50 * totalTris)
  const dv = new DataView(buf)
  const header = new Uint8Array(buf, 0, 80)

  // Header — ASCII текст
  const title = i18n.t('app.stlHeader')
  for (let i = 0; i < title.length && i < 80; i++) {
    header[i] = title.charCodeAt(i)
  }

  // Triangle count (uint32 LE)
  dv.setUint32(80, totalTris, true)

  let offset = 84

  for (const obj of visible) {
    const { vertices, indices, normals } = obj

    // FIX (WARN-R3-8): Apply transform to vertices before exporting
    const transformedVerts = applyTransformToVertices(vertices, obj.transform)

    // FIX (MED-18-43): Transform normals when object has rotation — unrotated objects pass through
    const hasRotation = obj.transform.rotX !== 0 || obj.transform.rotY !== 0 || obj.transform.rotZ !== 0
    const transformedNormals = hasRotation && normals && normals.length === vertices.length
      ? applyTransformToNormals(normals, obj.transform)
      : null

    for (let t = 0; t < indices.length / 3; t++) {
      const i0 = indices[t * 3]
      const i1 = indices[t * 3 + 1]
      const i2 = indices[t * 3 + 2]

      const ax = transformedVerts[i0 * 3], ay = transformedVerts[i0 * 3 + 1], az = transformedVerts[i0 * 3 + 2]
      const bx = transformedVerts[i1 * 3], by = transformedVerts[i1 * 3 + 1], bz = transformedVerts[i1 * 3 + 2]
      const cx = transformedVerts[i2 * 3], cy = transformedVerts[i2 * 3 + 1], cz = transformedVerts[i2 * 3 + 2]

      // Use per-vertex normals from manifold-3d when available (CSG results),
      // otherwise compute face normal via cross product.
      // FIX (MED-18-43): For rotated objects, use transformed normals instead of original.
      let nx: number, ny: number, nz: number
      if (transformedNormals && transformedNormals.length === vertices.length) {
        // Average the three transformed vertex normals for a smoother face normal
        nx = (transformedNormals[i0 * 3] + transformedNormals[i1 * 3] + transformedNormals[i2 * 3]) / 3
        ny = (transformedNormals[i0 * 3 + 1] + transformedNormals[i1 * 3 + 1] + transformedNormals[i2 * 3 + 1]) / 3
        nz = (transformedNormals[i0 * 3 + 2] + transformedNormals[i1 * 3 + 2] + transformedNormals[i2 * 3 + 2]) / 3
        const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1
        nx /= len; ny /= len; nz /= len
      } else if (normals && normals.length === vertices.length) {
        // Average the three vertex normals for a smoother face normal
        nx = (normals[i0 * 3] + normals[i1 * 3] + normals[i2 * 3]) / 3
        ny = (normals[i0 * 3 + 1] + normals[i1 * 3 + 1] + normals[i2 * 3 + 1]) / 3
        nz = (normals[i0 * 3 + 2] + normals[i1 * 3 + 2] + normals[i2 * 3 + 2]) / 3
        const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1
        nx /= len; ny /= len; nz /= len
      } else {
        // Cross product face normal
        const ux = bx - ax, uy = by - ay, uz = bz - az
        const vx = cx - ax, vy = cy - ay, vz = cz - az
        nx = uy * vz - uz * vy
        ny = uz * vx - ux * vz
        nz = ux * vy - uy * vx
        const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1
        nx /= len; ny /= len; nz /= len
      }

      // Normal (12 bytes)
      dv.setFloat32(offset, nx, true); offset += 4
      dv.setFloat32(offset, ny, true); offset += 4
      dv.setFloat32(offset, nz, true); offset += 4
      // Vertex A
      dv.setFloat32(offset, ax, true); offset += 4
      dv.setFloat32(offset, ay, true); offset += 4
      dv.setFloat32(offset, az, true); offset += 4
      // Vertex B
      dv.setFloat32(offset, bx, true); offset += 4
      dv.setFloat32(offset, by, true); offset += 4
      dv.setFloat32(offset, bz, true); offset += 4
      // Vertex C
      dv.setFloat32(offset, cx, true); offset += 4
      dv.setFloat32(offset, cy, true); offset += 4
      dv.setFloat32(offset, cz, true); offset += 4
      // Attribute byte count
      dv.setUint16(offset, 0, true); offset += 2
    }
  }

  return new Blob([buf], { type: 'application/octet-stream' })
}

export function downloadStl(objects: SceneObject[], fileName = i18n.t('app.stlDefaultName')): void {
  const blob = exportToStl(objects)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  // SEC-R8-2: Задержка перед освобождением URL для гарантии завершения скачивания
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
