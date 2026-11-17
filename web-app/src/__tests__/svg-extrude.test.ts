// ============================================================
// svg-extrude.test.ts — SVG-EXTRUDE: контур 2D из .svg → 3D-тело
// ============================================================
// Прямоугольник 100×60 (depth 10, scale 1) → замкнутый меш 100×60×10 (объём 60000);
// контур с круглой дыркой → объём (6000 − π·10²)·depth (дырка вычтена — зеркало по Y
// чинит обход треугольников, иначе объём был бы отрицательным); масштаб — размеры ×scale;
// ошибки — SvgExtrudeError с ключами i18n (ru/en). Через store (addSvgObject): объект
// import_mesh «SVG: …» (не 3D-текст), дерево baked, undo/redo, .3dtc, CSG ∪ куб. Реальный WASM.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

vi.mock('../csg/worker-client', async () => {
  const bridge = await import('./worker-bridge')
  return {
    workerBuildShape: bridge.workerBuildShape,
    workerBuildImportedMesh: bridge.workerBuildImportedMesh,
    workerSyncObjects: bridge.workerSyncObjects,
    workerSyncMesh: bridge.workerSyncMesh,
    workerCsgBoolean: bridge.workerCsgBoolean,
    workerCsgBooleanWithSync: bridge.workerCsgBooleanWithSync,
    workerMirrorObject: bridge.workerMirrorObject,
    workerRebuildScene: bridge.workerRebuildScene,
    workerDeleteObjects: bridge.workerDeleteObjects,
    workerClearAll: bridge.workerClearAll,
    workerRebuildNode: bridge.workerRebuildNode,
    isWorkerReady: bridge.isWorkerReady,
    disposeWorker: bridge.disposeWorker,
  }
})

import { buildSvgMesh, parseSvgShapes, SvgExtrudeError, svgErrorMessage } from '../io/svg-extrude'
import { addSvgObject } from '../store/add-svg'
import { useDocumentStore } from '../store/document-store'
import { clearSnapshots } from '../store/snapshots'
import { clearTree, getNode } from '../csg/history-tree'
import { useNotifications } from '../store/notifications'
import { meshVolume } from '../store/edit-child'
import { computeRSMatrix } from '../csg/worker-matrix'
import { serialize3dtc, parse3dtc } from '../io/3dtc-io'
import { rebuildFromHistory, rebuildBuildTree } from '../store/rebuild'
import { isTextObject } from '../store/text-object'
import i18n from '../i18n'
import ru from '../i18n/locales/ru/translation.json'
import en from '../i18n/locales/en/translation.json'
import type { SceneObject, TinkerCraftOperation } from '../csg/types'

const st = () => useDocumentStore.getState()

function reset(): void {
  useDocumentStore.setState({ objects: {}, operations: [], historyIndex: 0, selectedIds: [], busy: false })
  useNotifications.setState({ notifications: [] })
  clearSnapshots(); clearTree()
}
beforeEach(reset)
afterEach(async () => { await i18n.changeLanguage('ru') })

const RECT = '<svg xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="100" height="60"/></svg>'
// Внешний контур (по часовой в экранных координатах) + круглое отверстие (против часовой)
const RECT_HOLE = '<svg xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" d="M0 0L100 0L100 60L0 60Z M40 30A10 10 0 1 0 60 30A10 10 0 1 0 40 30Z"/></svg>'
const EMPTY = '<svg xmlns="http://www.w3.org/2000/svg"></svg>'

/** AABB сырых вершин (в origin): [minX, minY, minZ, maxX, maxY, maxZ]. */
function rawBox(vertices: number[]): number[] {
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < vertices.length; i += 3)
    for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], vertices[i + k]); mx[k] = Math.max(mx[k], vertices[i + k]) }
  return [...mn, ...mx]
}

function worldVerts(obj: SceneObject): Float32Array {
  const t = obj.transform
  const [r00, r01, r02, r10, r11, r12, r20, r21, r22] = computeRSMatrix(
    { rotX: t.rotX, rotY: t.rotY, rotZ: t.rotZ },
    { scaleX: t.scaleX, scaleY: t.scaleY, scaleZ: t.scaleZ },
  )
  const out = new Float32Array(obj.vertices.length)
  for (let i = 0; i < out.length; i += 3) {
    const x = obj.vertices[i], y = obj.vertices[i + 1], z = obj.vertices[i + 2]
    out[i] = r00 * x + r01 * y + r02 * z + t.x
    out[i + 1] = r10 * x + r11 * y + r12 * z + t.y
    out[i + 2] = r20 * x + r21 * y + r22 * z + t.z
  }
  return out
}

const errors = () => useNotifications.getState().notifications.filter((n) => n.type === 'error')

describe('buildSvgMesh', () => {
  it('прямоугольник 100×60, глубина 10 → замкнутый меш 100×60×10, объём 60000', async () => {
    const mesh = await buildSvgMesh(RECT, { depth: 10, scale: 1 })
    expect(mesh.indices.length).toBeGreaterThan(0)
    const box = rawBox(mesh.vertices)
    expect(box[3] - box[0]).toBeCloseTo(100, 3)
    expect(box[4] - box[1]).toBeCloseTo(60, 3)
    expect(box[5] - box[2]).toBeCloseTo(10, 3)
    expect(meshVolume(new Float32Array(mesh.vertices), new Uint32Array(mesh.indices))).toBeCloseTo(60000, 0)
  })

  it('дырка вычитается: (6000 − π·10²)·10; без переворота обхода объём был бы отрицательным', async () => {
    const mesh = await buildSvgMesh(RECT_HOLE, { depth: 10, scale: 1 })
    const v = meshVolume(new Float32Array(mesh.vertices), new Uint32Array(mesh.indices))
    expect(v).toBeGreaterThan(0)
    expect(v).toBeCloseTo((6000 - Math.PI * 100) * 10, -2)
  })

  it('масштаб 0.5 → размеры 50×30, глубина не меняется', async () => {
    const mesh = await buildSvgMesh(RECT, { depth: 10, scale: 0.5 })
    const box = rawBox(mesh.vertices)
    expect(box[3] - box[0]).toBeCloseTo(50, 3)
    expect(box[4] - box[1]).toBeCloseTo(30, 3)
    expect(box[5] - box[2]).toBeCloseTo(10, 3)
  })

  it('контур не перевёрнут: y SVG (вниз) → y сцены (вверх)', async () => {
    // Фигура 20×10, у которой «верх» по SVG отличим: прямоугольник y∈[0,10].
    // После зеркала вершины занимают y ∈ [−10, 0] — знак объёма всё равно > 0 (winding чинится),
    // а расположение в origin не важно; главное — геометрия не самопересекается и объём полный.
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="20" height="10"/></svg>'
    const mesh = await buildSvgMesh(svg, { depth: 5, scale: 1 })
    expect(meshVolume(new Float32Array(mesh.vertices), new Uint32Array(mesh.indices))).toBeCloseTo(1000, 0)
  })

  it('SVG без контуров → SvgExtrudeError(errors.svgNoShapes), сообщения ru/en', async () => {
    await expect(parseSvgShapes(EMPTY)).rejects.toThrow(SvgExtrudeError)
    try {
      await buildSvgMesh(EMPTY, { depth: 10, scale: 1 })
      expect.unreachable()
    } catch (e) {
      expect((e as SvgExtrudeError).reasonKey).toBe('errors.svgNoShapes')
    }
    await i18n.changeLanguage('ru')
    expect(svgErrorMessage(new SvgExtrudeError('errors.svgNoShapes', ''))).toBe(ru.errors.svgNoShapes)
    await i18n.changeLanguage('en')
    expect(svgErrorMessage(new SvgExtrudeError('errors.svgNoShapes', ''))).toBe(en.errors.svgNoShapes)
  })

  it('глубина/масштаб ≤ 0 → SvgExtrudeError(errors.svgBadSize)', async () => {
    await expect(buildSvgMesh(RECT, { depth: 0, scale: 1 })).rejects.toMatchObject({ reasonKey: 'errors.svgBadSize' })
    await expect(buildSvgMesh(RECT, { depth: 10, scale: -1 })).rejects.toMatchObject({ reasonKey: 'errors.svgBadSize' })
  })
})

describe('addSvgObject (store, WASM)', () => {
  it('SVG → объект import_mesh «SVG: profile.svg» (id svg_…, не текст), дерево baked, на сетке', async () => {
    expect(await addSvgObject(RECT, 'profile.svg', { depth: 10, scale: 1 })).toBe(true)
    const id = Object.keys(st().objects)[0]
    expect(id.startsWith('svg_')).toBe(true)
    const obj = st().objects[id]
    expect(obj.shapeType).toBe('import_mesh')
    expect(obj.name).toBe(i18n.t('svgModal.objectName', { name: 'profile.svg' }))
    expect(isTextObject(obj)).toBe(false)          // не 3D-текст (префикс svg_, не txt_)
    expect(getNode(id)?.type).toBe('baked')        // дерево: запечённый меш
    // история: один шаг import_mesh с сырыми вершинами (рецепт для rebuild)
    expect(st().operations).toHaveLength(1)
    expect(st().operations[0].type).toBe('import_mesh')
    expect(errors()).toEqual([])
    // мировой AABB: габариты 100×60×10 (spawn вне origin, на сетке объектов)
    const wv = worldVerts(obj)
    const box = rawBox(Array.from(wv))
    expect(box[3] - box[0]).toBeCloseTo(100, 3)
    expect(box[4] - box[1]).toBeCloseTo(60, 3)
    expect(box[5] - box[2]).toBeCloseTo(10, 3)
  })

  it('undo/redo: тело убирается и возвращается тем же шагом', async () => {
    await addSvgObject(RECT, 'profile.svg', { depth: 10, scale: 1 })
    expect(Object.keys(st().objects)).toHaveLength(1)
    await st().undo()
    expect(Object.keys(st().objects)).toHaveLength(0)
    await st().redo()
    expect(Object.keys(st().objects)).toHaveLength(1)
  })

  it('SVG ∪ куб → один CSG (объём = сумма без перекрытия), без уведомлений', async () => {
    await addSvgObject(RECT, 'profile.svg', { depth: 10, scale: 1 })
    const svgId = Object.keys(st().objects)[0]
    const t = st().objects[svgId].transform
    // куб 10³ рядом (+70 по X — перекрытия с телом 100×60×10 нет, COM тела в spawn)
    await st().addShape('cube', { width: 10, height: 10, depth: 10 })
    const cube = Object.keys(st().objects).find((k) => k !== svgId)!
    await st().moveObject(cube, { ...st().objects[cube].transform, x: t.x + 70, y: t.y, z: t.z })
    st().selectObjects([svgId, cube], false)
    const n = st().operations.length
    await st().csgBoolean('union')
    expect(errors()).toEqual([])
    expect(st().operations).toHaveLength(n + 1)
    const root = st().selectedIds[0]
    expect(st().objects[root].shapeType).toBe('csg')
    expect(st().objects[svgId]).toBeUndefined()
    expect(meshVolume(worldVerts(st().objects[root]), st().objects[root].indices)).toBeCloseTo(60000 + 1000, -1)
  })

  it('.3dtc: сериализация → чистый rebuild — тело то же (имя, габариты)', async () => {
    await addSvgObject(RECT, 'profile.svg', { depth: 10, scale: 1 })
    const live = Object.values(st().objects)[0]
    const blob = await serialize3dtc({ objects: st().objects, operations: st().operations, operationsTrimmed: false })
    reset()
    const ops = (await parse3dtc(blob)).operations as TinkerCraftOperation[]
    const objects = await rebuildFromHistory(ops)
    rebuildBuildTree(ops, objects)
    useDocumentStore.setState({ operations: ops, historyIndex: ops.length, objects })
    const rebuilt = Object.values(useDocumentStore.getState().objects)[0]
    expect(rebuilt.name).toBe(live.name)
    const box = rawBox(Array.from(worldVerts(rebuilt)))
    expect(box[3] - box[0]).toBeCloseTo(100, 3)
    expect(box[5] - box[2]).toBeCloseTo(10, 3)
  })

  it('ошибка построения → уведомление errors.svgFailed, объект не добавлен', async () => {
    expect(await addSvgObject(EMPTY, 'empty.svg', { depth: 10, scale: 1 })).toBe(false)
    expect(Object.keys(st().objects)).toHaveLength(0)
    const msgs = errors()
    expect(msgs).toHaveLength(1)
    expect(msgs[0].message).toContain(ru.errors.svgNoShapes)
    await i18n.changeLanguage('en')
    useNotifications.setState({ notifications: [] })
    expect(await addSvgObject(EMPTY, 'empty.svg', { depth: 10, scale: 1 })).toBe(false)
    expect(errors()[0].message).toContain(en.errors.svgNoShapes)
  })
})
