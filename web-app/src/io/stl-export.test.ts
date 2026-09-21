// ============================================================
// Unit tests — stl-export: exportToStl
// ============================================================

import { describe, it, expect } from 'vitest'
import { exportToStl, StlTooLargeError } from './stl-export'
import i18n from '../i18n'
import type { SceneObject, ShapeParams, TransformNR } from '../csg/types'

const T: TransformNR = { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 }
const P: ShapeParams = { width: 1, height: 1, depth: 1 }

function makeObj(overrides: Partial<SceneObject> = {}): SceneObject {
  return {
    id: 'test',
    shapeType: 'cube',
    params: P,
    color: '#fff',
    transform: T,
    visible: true,
    locked: false,
    vertices: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
    indices: new Uint32Array([0, 1, 2]),
    ...overrides,
  }
}

describe('exportToStl', () => {
  it('produces a valid binary STL blob', () => {
    const blob = exportToStl([makeObj()])
    expect(blob).toBeInstanceOf(Blob)
    expect(blob.size).toBe(84 + 50 * 1) // header(80) + count(4) + 50 bytes per triangle
  })

  it('writes correct triangle count in header', async () => {
    const obj = makeObj({
      vertices: new Float32Array([
        0, 0, 0, 1, 0, 0, 0, 1, 0,
        0, 0, 1, 1, 0, 1, 0, 1, 1,
      ]),
      indices: new Uint32Array([0, 1, 2, 3, 4, 5]),
    })
    const blob = exportToStl([obj])
    const buf = new ArrayBuffer(blob.size)
    new Uint8Array(buf).set(new Uint8Array(await blob.arrayBuffer()))
    const dv = new DataView(buf)
    // Triangle count is at offset 80, uint32 LE
    expect(dv.getUint32(80, true)).toBe(2)
  })

  it('skips hidden objects', () => {
    const visible = makeObj({ id: 'v' })
    const hidden = makeObj({ id: 'h', visible: false })
    const blob = exportToStl([visible, hidden])
    // Only 1 triangle from the visible object
    expect(blob.size).toBe(84 + 50 * 1)
  })

  it('handles empty input', async () => {
    const blob = exportToStl([])
    expect(blob.size).toBe(84) // just header + zero count
    const buf = new ArrayBuffer(blob.size)
    new Uint8Array(buf).set(new Uint8Array(await blob.arrayBuffer()))
    const dv = new DataView(buf)
    expect(dv.getUint32(80, true)).toBe(0)
  })

  // FIX (WARN-R3-8): Tests for transform application
  // FIX (UB-0): трансформ применяется К bbox-центрированной геометрии —
  // так же, как во вьюпорте (centerGeometry + transform на pivot).
  it('applies translation transform to vertices', async () => {
    const obj = makeObj({
      vertices: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      indices: new Uint32Array([0, 1, 2]),
      transform: { ...T, x: 10, y: 20, z: 30 },
    })
    const blob = exportToStl([obj])
    expect(blob.size).toBe(84 + 50 * 1)

    // First vertex (0,0,0) → centered (−0.5,−0.5,0) → +(10,20,30) = (9.5,19.5,30)
    const buf = new ArrayBuffer(blob.size)
    new Uint8Array(buf).set(new Uint8Array(await blob.arrayBuffer()))
    const dv = new DataView(buf)
    // Normal (12 bytes) + first vertex (12 bytes)
    const ax = dv.getFloat32(84 + 12, true)
    const ay = dv.getFloat32(84 + 12 + 4, true)
    const az = dv.getFloat32(84 + 12 + 8, true)
    expect(ax).toBeCloseTo(9.5, 5)
    expect(ay).toBeCloseTo(19.5, 5)
    expect(az).toBeCloseTo(30, 5)
  })

  // FIX (UB-0): позиция спавна, запечённая воркером в вершины, НЕ должна
  // применяться дважды. Примитив создан с transform.x=25 → воркер запёк +25
  // в вершины, store записал +25 в transform. Экспорт обязан дать +25, а не +50.
  it('spawn position baked into vertices is not double-applied (UB-0)', async () => {
    // «Куб» у origin: вершины мировые (t=0), transform x=0
    const objA = makeObj({
      id: 'a',
      vertices: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      indices: new Uint32Array([0, 1, 2]),
      transform: { ...T },
    })
    // «Куб» со спавном x=25: воркер запёк +25 в вершины, transform x=25
    const objB = makeObj({
      id: 'b',
      vertices: new Float32Array([25, 0, 0, 26, 0, 0, 25, 1, 0]),
      indices: new Uint32Array([0, 1, 2]),
      transform: { ...T, x: 25 },
    })
    const blob = exportToStl([objA, objB])
    const buf = new ArrayBuffer(blob.size)
    new Uint8Array(buf).set(new Uint8Array(await blob.arrayBuffer()))
    const dv = new DataView(buf)
    // Vertex A of triangle 1 (objA): 84 + normal(12)
    const axA = dv.getFloat32(84 + 12, true)
    // Vertex A of triangle 2 (objB): 84 + 50 + normal(12)
    const axB = dv.getFloat32(84 + 50 + 12, true)
    // Относительное смещение между фигурами = 25 (раньше было 50 — «разлетались»)
    expect(axB - axA).toBeCloseTo(25, 4)
    // Абсолютная позиция objB — как во вьюпорте (центр геометрии на x=25):
    // (25 − 25.5) + 25 = 24.5
    expect(axB).toBeCloseTo(24.5, 4)
  })

  it('applies scale transform to vertices', async () => {
    const obj = makeObj({
      vertices: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      indices: new Uint32Array([0, 1, 2]),
      transform: { ...T, scaleX: 2, scaleY: 2, scaleZ: 2 },
    })
    const blob = exportToStl([obj])
    expect(blob.size).toBe(84 + 50 * 1)

    // Second vertex (1,0,0) → centered (0.5,−0.5,0) → ×2 = (1,−1,0)
    // STL layout per triangle: normal(12) + A(12) + B(12) + C(12) + attr(2) = 50 bytes
    // Vertex B is at: header(84) + normal(12) + vertexA(12) = 108
    const buf = new ArrayBuffer(blob.size)
    new Uint8Array(buf).set(new Uint8Array(await blob.arrayBuffer()))
    const dv = new DataView(buf)
    const bx = dv.getFloat32(84 + 12 + 12, true) // normal(12) + vertexA(12)
    expect(bx).toBeCloseTo(1, 5)
  })

  it('identity transform produces same output as no transform', async () => {
    const obj1 = makeObj({
      vertices: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      indices: new Uint32Array([0, 1, 2]),
    })
    const obj2 = makeObj({
      vertices: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      indices: new Uint32Array([0, 1, 2]),
      transform: { ...T }, // identity
    })
    const blob1 = await exportToStl([obj1]).arrayBuffer()
    const blob2 = await exportToStl([obj2]).arrayBuffer()
    expect(new Uint8Array(blob1)).toEqual(new Uint8Array(blob2))
  })

  it('multi-axis rotation matches Three.js XYZ Euler order', async () => {
    // FIX (ROT-XYZ-STL): exportToStl now uses computeRSMatrix (Three.js XYZ).
    // Rotate vertex (1,0,0) by rotX=30, rotY=45, rotZ=0.
    // FIX (UB-0): трансформ применяется к центрированной геометрии:
    // (1,0,0) → centered (0.5,−0.5,0) → Rx(30)·Ry(45)·v = (0.3536, −0.2562, −0.5562).
    const obj = makeObj({
      vertices: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      indices: new Uint32Array([0, 1, 2]),
      transform: { ...T, rotX: 30, rotY: 45, rotZ: 0 },
    })
    const blob = exportToStl([obj])
    const buf = new ArrayBuffer(blob.size)
    new Uint8Array(buf).set(new Uint8Array(await blob.arrayBuffer()))
    const dv = new DataView(buf)
    // Vertex B at: header(84) + normal(12) + vertexA(12) = 108
    const bx = dv.getFloat32(84 + 12 + 12, true)
    const by = dv.getFloat32(84 + 12 + 12 + 4, true)
    const bz = dv.getFloat32(84 + 12 + 12 + 8, true)
    expect(bx).toBeCloseTo(0.3536, 3)
    expect(by).toBeCloseTo(-0.2562, 3)
    expect(bz).toBeCloseTo(-0.5562, 3)
  })

  it('non-uniform scale applies per-axis', async () => {
    // Vertex (1,1,1) → centered (0.5,0.5,0.5) → scaled X=2, Y=3, Z=4 → (1,1.5,2)
    const obj = makeObj({
      vertices: new Float32Array([0, 0, 0, 1, 1, 1, 0, 1, 0]),
      indices: new Uint32Array([0, 1, 2]),
      transform: { ...T, scaleX: 2, scaleY: 3, scaleZ: 4 },
    })
    const blob = exportToStl([obj])
    const buf = new ArrayBuffer(blob.size)
    new Uint8Array(buf).set(new Uint8Array(await blob.arrayBuffer()))
    const dv = new DataView(buf)
    const bx = dv.getFloat32(84 + 12 + 12, true)
    const by = dv.getFloat32(84 + 12 + 12 + 4, true)
    const bz = dv.getFloat32(84 + 12 + 12 + 8, true)
    expect(bx).toBeCloseTo(1, 5)
    expect(by).toBeCloseTo(1.5, 5)
    expect(bz).toBeCloseTo(2, 5)
  })

  // FIX (E1): лимит треугольников обязан отклонять сцену ЯВНО. Раньше он
  // урезал только размер буфера и заголовок, а цикл записи лимита не знал →
  // выход за границу DataView (RangeError) либо файл с недостоверным count.
  it('throws StlTooLargeError instead of writing a broken file (E1)', () => {
    const obj = makeObj({ indices: new Uint32Array([0, 1, 2, 0, 1, 2]) }) // 2 треугольника
    let caught: unknown = null
    try {
      exportToStl([obj], 1)
    } catch (e) {
      caught = e
    }
    expect(caught).toBeInstanceOf(StlTooLargeError)
    // Локализованное сообщение из errors.stlTooManyTris (ключ был мёртвым)
    expect((caught as StlTooLargeError).count).toBe(2)
    expect((caught as StlTooLargeError).max).toBe(1)
    expect((caught as Error).message).toContain('2')
    // Ровно лимит — не ошибка
    expect(() => exportToStl([obj], 2)).not.toThrow()
  })

  // FIX (E2): заголовок пишется UTF-8, а не побайтно через charCodeAt —
  // кириллица в ru-локали раньше превращалась в мусорные байты.
  it('writes the header as UTF-8 within 80 bytes (E2)', async () => {
    const blob = exportToStl([makeObj()])
    const buf = new ArrayBuffer(blob.size)
    new Uint8Array(buf).set(new Uint8Array(await blob.arrayBuffer()))
    const header = new TextDecoder().decode(new Uint8Array(buf, 0, 80)).replace(/\0.*$/s, '')
    // Заголовок —Decodable-строка без «обрезков» charCodeAt (байты <128 либо валидный UTF-8)
    expect(header.length).toBeGreaterThan(0)
    expect(header).toBe(i18n.t('app.stlHeader'))
  })
})
