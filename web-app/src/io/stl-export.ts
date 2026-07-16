// ============================================================
// STL Экспорт — бинарный формат
// Совместим с TinkerCraft Java ExportManager.java
// ============================================================

import type { SceneObject } from '../csg/types'

/**
 * Объединить несколько mesh-объектов и записать в binary STL.
 */
export function exportToStl(objects: SceneObject[]): Blob {
  const visible = objects.filter(o => o.visible)

  // Подсчитываем общее число треугольников
  let totalTris = 0
  for (const obj of visible) totalTris += obj.indices.length / 3

  // Выделяем буфер: 80 (header) + 4 (count) + 50 * tris
  const buf    = new ArrayBuffer(84 + 50 * totalTris)
  const dv     = new DataView(buf)
  const header = new Uint8Array(buf, 0, 80)

  // Header — ASCII текст
  const title = 'TinkerCraft Web STL Export'
  for (let i = 0; i < title.length && i < 80; i++) {
    header[i] = title.charCodeAt(i)
  }

  // Triangle count (uint32 LE)
  dv.setUint32(80, totalTris, true)

  let offset = 84

  for (const obj of visible) {
    const { vertices, indices, normals } = obj

    for (let t = 0; t < indices.length / 3; t++) {
      const i0 = indices[t * 3]
      const i1 = indices[t * 3 + 1]
      const i2 = indices[t * 3 + 2]

      const ax = vertices[i0 * 3], ay = vertices[i0 * 3 + 1], az = vertices[i0 * 3 + 2]
      const bx = vertices[i1 * 3], by = vertices[i1 * 3 + 1], bz = vertices[i1 * 3 + 2]
      const cx = vertices[i2 * 3], cy = vertices[i2 * 3 + 1], cz = vertices[i2 * 3 + 2]

      // Use per-vertex normals from manifold-3d when available (CSG results),
      // otherwise compute face normal via cross product.
      let nx: number, ny: number, nz: number
      if (normals && normals.length === vertices.length) {
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

      // Нормаль (12 байт)
      dv.setFloat32(offset,      nx, true); offset += 4
      dv.setFloat32(offset,      ny, true); offset += 4
      dv.setFloat32(offset,      nz, true); offset += 4
      // Вершина A
      dv.setFloat32(offset,      ax, true); offset += 4
      dv.setFloat32(offset,      ay, true); offset += 4
      dv.setFloat32(offset,      az, true); offset += 4
      // Вершина B
      dv.setFloat32(offset,      bx, true); offset += 4
      dv.setFloat32(offset,      by, true); offset += 4
      dv.setFloat32(offset,      bz, true); offset += 4
      // Вершина C
      dv.setFloat32(offset,      cx, true); offset += 4
      dv.setFloat32(offset,      cy, true); offset += 4
      dv.setFloat32(offset,      cz, true); offset += 4
      // Attribute byte count
      dv.setUint16(offset, 0, true);        offset += 2
    }
  }

  return new Blob([buf], { type: 'application/octet-stream' })
}

export function downloadStl(objects: SceneObject[], fileName = 'tinkercraft-export.stl'): void {
  const blob = exportToStl(objects)
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  URL.revokeObjectURL(url)
}
