// ============================================================
// Geometry utilities — единые для worker и frontend слоёв
// (Фаза 8, Этап 6.5: унификация центрирования, §5.4)
// Worker НЕ может импортировать store/helpers — поэтому общие
// геометрические функции живут в csg-слое.
// ============================================================

/**
 * Хранит ли объект вершины, УЖЕ центрированными относительно pivot'а.
 *
 * FIX (VIEWPORT-DOUBLE-CENTERING): конвенция §5.4 — вершины CSG-результатов
 * центрированы по ЦЕНТРУ МАСС (centerMassAtOrigin), а pivot (transform.position)
 * равен этому центру масс. world = pivot + vertex.
 *
 * Рендер (viewport) и экспорт (STL) вычитали из вершин BBOX-центр у ВСЕХ
 * объектов. Для примитивов это правильно: воркер (handleBuildShape) запекает
 * spawn-трансляцию В вершины, и вычитание bbox-центра её снимает. Но для CSG
 * вершины уже центрированы, и повторное вычитание смещает меш на
 * bboxCenter(centered) — для асимметричной геометрии COM ≠ bboxCenter.
 * Измерено: union куба (origin) и призмы (10,0,0) рендерился со сдвигом
 * 4.2491 ед. по X.
 *
 * Поэтому bbox-центрирование применяется ТОЛЬКО к объектам, чьи вершины
 * содержат запечённую трансляцию (примитивы) или произвольный offset
 * (import_mesh). CSG-результаты центрировать НЕЛЬЗЯ — они уже в pivot.
 *
 * См. ARCHITECTURE_TRANSFORMS.md §5.4, CHANGELOG (VIEWPORT-DOUBLE-CENTERING).
 */
export function isPivotCenteredGeometry(shapeType: string): boolean {
  return shapeType === 'csg'
}

/**
 * Проверяет, замкнута ли mesh (manifold): для каждого направленного ребра (a,b)
 * существует парное (b,a). Незамкнутая mesh (дырявый импортный STL) не имеет
 * корректного объёма — для неё нельзя применять объёмный центроид.
 */
export function isClosedMesh(indices: Uint32Array): boolean {
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
 * См. ARCHITECTURE_TRANSFORMS.md §5.3, §5.4.
 *
 * ЕДИНАЯ формула центрирования для ВСЕХ слоёв (Этап 6.5):
 * - Worker (handleRebuildTreeNode, handleCsgBoolean, handleCsgBooleanSync)
 * - Frontend (document-store csgBoolean/extrude, store/rebuild)
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
 *
 * numProp vertices-буфера должен быть 3 (x,y,z) — все mesh в проекте
 * (manifold boolean results, примитивы, syncMesh) используют numProp=3.
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
