// ============================================================
// geometry-utils.test.ts — Фаза 8, Этап 6.5
// Унификация центрирования: centerMassAtOrigin — единая формула
// для worker и frontend (ARCHITECTURE_TRANSFORMS.md §5.4).
// ============================================================
import { describe, it, expect } from 'vitest'
import { centerMassAtOrigin, isClosedMesh } from './geometry-utils'
import { centerMassAtOrigin as centerMassFromHelpers } from '../store/helpers'

// Куб: 8 вершин, 12 треугольников, замкнутый, outward-ориентация.
// (Тот же конструктор, что в численном тесте Этапа 6 — объём = size³.)
function makeCube(size: number, offset: [number, number, number]) {
  const h = size / 2
  const verts = [
    -h, -h, -h, h, -h, -h, h, h, -h, -h, h, -h,
    -h, -h, h, h, -h, h, h, h, h, -h, h, h,
  ].map((v, i) => i % 3 === 0 ? v + offset[0] : i % 3 === 1 ? v + offset[1] : v + offset[2])
  const idx = [
    0, 2, 1, 0, 3, 2, // -z
    1, 2, 6, 1, 6, 5, // +x
    4, 5, 6, 4, 6, 7, // +z
    0, 1, 5, 0, 5, 4, // -y
    2, 3, 7, 2, 7, 6, // +y
    0, 4, 7, 0, 7, 3, // -x
  ]
  return { verts: new Float32Array(verts), idx: new Uint32Array(idx) }
}

// union-подобный замкнутый меш: два непересекающихся куба-оболочки
// (куб 10 в origin + куб 5 на x=10). Manifold union даёт эквивалент
// по объёмному центроиду: C = (1000·0 + 125·10) / 1125 = 10/9.
function makeUnion(): { verts: Float32Array; idx: Uint32Array } {
  const c1 = makeCube(10, [0, 0, 0])
  const c2 = makeCube(5, [10, 0, 0])
  const verts = new Float32Array(c1.verts.length + c2.verts.length)
  verts.set(c1.verts, 0)
  verts.set(c2.verts, c1.verts.length)
  const idx = new Uint32Array(c1.idx.length + c2.idx.length)
  idx.set(c1.idx, 0)
  for (let i = 0; i < c2.idx.length; i++) idx[c1.idx.length + i] = c2.idx[i] + 8
  return { verts, idx }
}

describe('centerMassAtOrigin (Этап 6.5)', () => {
  it('замкнутый union куб 10 + куб 5@x=10 → COM = 10/9 (объёмный центроид)', () => {
    const { verts, idx } = makeUnion()
    expect(isClosedMesh(idx)).toBe(true)
    const { cx, cy, cz } = centerMassAtOrigin(verts, idx)
    // Точное значение: (V1·0 + V2·10)/(V1+V2) = 1250/1125 = 10/9
    expect(cx).toBeCloseTo(10 / 9, 6)
    expect(cy).toBeCloseTo(0, 6)
    expect(cz).toBeCloseTo(0, 6)
  })

  it('vertex centroid расходится с COM на 3.89 для union (мотивация Этапа 6.5)', () => {
    // Численный тест из отчёта Этапа 6: для несимметричных CSG
    // vertex centroid (среднее по вершинам) ≠ center of mass.
    const { verts } = makeUnion()
    let vcx = 0
    const numVerts = verts.length / 3
    for (let i = 0; i < numVerts; i++) vcx += verts[i * 3]
    vcx /= numVerts // = 5.0
    const com = centerMassAtOrigin(new Float32Array(verts), makeUnion().idx)
    expect(vcx).toBeCloseTo(5.0, 6)
    expect(Math.abs(vcx - com.cx)).toBeCloseTo(3.888888888888889, 6)
  })

  it('инвариант «нет offset»: pivot + центрированная вершина = мировая вершина', () => {
    // Интеграционный сценарий «CSG union cube+prism: no offset»:
    // worker кэширует COM-центрированный меш, frontend ставит pivot в COM.
    // Для каждой вершины: pivot + v_centered === v_world (точность float32).
    const { verts, idx } = makeUnion()
    const world = new Float32Array(verts)
    const { cx, cy, cz } = centerMassAtOrigin(verts, idx)
    let maxErr = 0
    for (let i = 0; i < verts.length; i += 3) {
      maxErr = Math.max(
        maxErr,
        Math.abs(cx + verts[i] - world[i]),
        Math.abs(cy + verts[i + 1] - world[i + 1]),
        Math.abs(cz + verts[i + 2] - world[i + 2]),
      )
    }
    expect(maxErr).toBeLessThan(1e-6)
  })

  it('незамкнутая mesh → площадной центроид, не падает', () => {
    // Один треугольник в плоскости XY — не замкнут.
    const verts = new Float32Array([0, 0, 0, 3, 0, 0, 0, 3, 0])
    const idx = new Uint32Array([0, 1, 2])
    expect(isClosedMesh(idx)).toBe(false)
    const { cx, cy, cz } = centerMassAtOrigin(verts, idx)
    expect(cx).toBeCloseTo(1, 6)
    expect(cy).toBeCloseTo(1, 6)
    expect(cz).toBeCloseTo(0, 6)
  })

  it('пустые массивы → {0,0,0}, без падения', () => {
    const r = centerMassAtOrigin(new Float32Array(0), new Uint32Array(0))
    expect(r).toEqual({ cx: 0, cy: 0, cz: 0 })
  })

  it('паритет слоёв: helpers-реэкспорт === csg/geometry-utils (один и тот же код)', () => {
    // Worker импортирует из csg/geometry-utils, frontend — из store/helpers
    // (реэкспорт). Одна функция → diff worker vs helpers тождественно = 0.
    expect(centerMassFromHelpers).toBe(centerMassAtOrigin)
  })
})
