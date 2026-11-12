// ============================================================
// formats.test.tsx — FORMATS-OBJ-3MF-GLTF: экспорт OBJ / 3MF / glTF, импорт OBJ / 3MF
// ============================================================
// Сцена — настоящий WASM (worker-bridge): куб 20³ на X = 30 и сфера. Экспорт сверяется с теми же
// мировыми координатами, что STL; файлы разбираются обратно (OBJ, 3MF — нашим импортом).

import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../csg/worker-client', async () => {
  const bridge = await import('./worker-bridge')
  return {
    workerBuildShape: bridge.workerBuildShape,
    workerBuildImportedMesh: bridge.workerBuildImportedMesh,
    workerSyncObjects: bridge.workerSyncObjects,
    workerSyncMesh: bridge.workerSyncMesh,
    workerCsgBoolean: bridge.workerCsgBoolean,
    workerCsgBooleanWithSync: bridge.workerCsgBooleanWithSync,
    workerCsgBooleanMulti: bridge.workerCsgBooleanMulti,
    workerMirrorObject: bridge.workerMirrorObject,
    workerRebuildScene: bridge.workerRebuildScene,
    workerDeleteObjects: bridge.workerDeleteObjects,
    workerClearAll: bridge.workerClearAll,
    workerRebuildNode: bridge.workerRebuildNode,
    isWorkerReady: bridge.isWorkerReady,
    disposeWorker: bridge.disposeWorker,
  }
})
const picked: { file: File | null } = { file: null }
vi.mock('../io/stl-import', async (orig) => ({
  ...(await orig<typeof import('../io/stl-import')>()),
  openStlFilePicker: async () => picked.file,
}))
const downloads: Array<{ blob: Blob; name: string }> = []
vi.mock('../io/3dtc-io', async (orig) => ({
  ...(await orig<typeof import('../io/3dtc-io')>()),
  downloadBlob: (blob: Blob, name: string) => { downloads.push({ blob, name }) },
}))

import JSZip from 'jszip'
import { useDocumentStore } from '../store/document-store'
import { clearSnapshots } from '../store/snapshots'
import { clearTree } from '../csg/history-tree'
import { worldMeshes, objText, exportToObj, exportTo3mf, exportToGltf, parseObjText, parse3mf, parseMeshFile, EXPORT_FORMATS } from '../io/mesh-formats'
import type { TransformNR } from '../csg/types'

const st = () => useDocumentStore.getState()
const AT = (x: number): TransformNR => ({ x, y: 0, z: 10, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 })
const bbox = (v: ArrayLike<number>) => {
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < v.length; i += 3) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], v[i + k]); mx[k] = Math.max(mx[k], v[i + k]) }
  return { mn, mx }
}
async function scene() {
  await st().addShape('cube', { width: 20, height: 20, depth: 20 }, AT(30))
  await st().addShape('sphere', { radius: 8, segments: 24 }, AT(-30))
  return Object.values(st().objects)
}

beforeEach(() => {
  useDocumentStore.setState({ objects: {}, operations: [], historyIndex: 0, selectedIds: [], busy: false, fileName: null })
  clearSnapshots(); clearTree(); downloads.length = 0; picked.file = null
})

describe('экспорт', () => {
  it('worldMeshes: мировые координаты (куб 20³ на X = 30, Z = 10), скрытые — не экспортируются', async () => {
    const objs = await scene()
    const ms = worldMeshes(objs)
    expect(ms).toHaveLength(2)
    const cube = bbox(ms[0].vertices)
    expect(cube.mn.map((v) => +v.toFixed(3))).toEqual([20, -10, 0])
    expect(cube.mx.map((v) => +v.toFixed(3))).toEqual([40, 10, 20])
    expect(worldMeshes(objs.map((o, i) => (i === 1 ? { ...o, visible: false } : o)))).toHaveLength(1)
  })

  it('OBJ: объект на объект; разбор обратно — те же вершины и треугольники', async () => {
    const objs = await scene()
    const ms = worldMeshes(objs)
    const text = objText(ms)
    expect(text.match(/^o /gm)).toHaveLength(2)
    const back = parseObjText(text, 'x.obj')
    expect(back.success).toBe(true)
    if (!back.success) return
    expect(back.vertices.length).toBe(ms[0].vertices.length + ms[1].vertices.length)
    expect(back.indices.length).toBe(ms[0].indices.length + ms[1].indices.length)
    expect(bbox(back.vertices).mx[0]).toBeCloseTo(40, 4)
    expect((await exportToObj(objs).text()).startsWith('# TinkerCraft Web — OBJ')).toBe(true)
  })

  it('3MF: ZIP с [Content_Types], _rels, 3D/3dmodel.model (мм, цвета); разбор обратно', async () => {
    const objs = await scene()
    const blob = await exportTo3mf(objs)
    const zip = await JSZip.loadAsync(await blob.arrayBuffer())
    expect(Object.keys(zip.files)).toEqual(expect.arrayContaining(['[Content_Types].xml', '_rels/.rels', '3D/3dmodel.model']))
    const xml = await zip.file('3D/3dmodel.model')!.async('string')
    expect(xml).toContain('unit="millimeter"')
    expect(xml.match(/<object /g)).toHaveLength(2)
    expect(xml).toContain(`displaycolor="${objs[0].color.toUpperCase()}FF"`)
    const back = await parse3mf(await blob.arrayBuffer(), 'x.3mf')
    expect(back.success).toBe(true)
    if (!back.success) return
    const ms = worldMeshes(objs)
    expect(back.indices.length).toBe(ms[0].indices.length + ms[1].indices.length)
    expect(bbox(back.vertices).mn[0]).toBeCloseTo(bbox(ms[1].vertices).mn[0], 4)
  })

  it('glTF: JSON 2.0, два меша, корень — Y-вверх и метры (куб 20 мм = 0.02 м)', async () => {
    const objs = await scene()
    const json = JSON.parse(await (await exportToGltf(objs)).text())
    expect(json.asset.version).toBe('2.0')
    expect(json.meshes).toHaveLength(2)
    expect(json.materials).toHaveLength(2)
    const root = json.nodes.find((n: { name?: string }) => n.name === 'TinkerCraft')
    // корень — матрица (столбцы): Z модели (вверх, мм) → Y glTF (вверх, м), Y → −Z, X → X; масштаб 0,001
    const m: number[] = root.matrix
    const apply = (x: number, y: number, z: number) => [0, 1, 2].map((r) => m[r] * x + m[4 + r] * y + m[8 + r] * z + m[12 + r])
    expect(apply(0, 0, 20).map((v) => +v.toFixed(6))).toEqual([0, 0.02, 0])
    expect(apply(20, 0, 0).map((v) => +v.toFixed(6))).toEqual([0.02, 0, 0])
    expect(apply(0, 20, 0).map((v) => +v.toFixed(6))).toEqual([0, 0, -0.02])
    const posAcc = json.accessors[json.meshes[0].primitives[0].attributes.POSITION]
    expect(posAcc.max[0] - posAcc.min[0]).toBeCloseTo(20, 3)
    expect(json.buffers[0].uri.startsWith('data:application/octet-stream;base64,')).toBe(true)
  })

  it('стор: exportMesh — файл с расширением формата; пустая сцена — без ошибок', async () => {
    await scene()
    useDocumentStore.setState({ fileName: 'Дом.3dtc' })
    for (const f of ['obj', '3mf', 'gltf'] as const) await st().exportMesh(f)
    expect(downloads.map((d) => d.name)).toEqual(['Дом.obj', 'Дом.3mf', 'Дом.gltf'])
    expect(EXPORT_FORMATS).toEqual(['stl', 'obj', '3mf', 'gltf'])
  })
})

describe('импорт', () => {
  it('OBJ: квадрат-многоугольник веером, «v/vt/vn», отрицательные индексы; ошибки — понятным текстом', () => {
    const r = parseObjText('v 0 0 0\nv 1 0 0\nv 1 1 0\nv 0 1 0\nvt 0 0\nf 1/1/1 2/1/1 3/1/1 4/1/1\nf -4 -2 -1\n', 'q.obj')
    expect(r.success && Array.from(r.indices)).toEqual([0, 1, 2, 0, 2, 3, 0, 2, 3])
    expect(parseObjText('v 0 0 0\nf 1 2 3\n', 'bad.obj').success).toBe(false)
    expect(parseObjText('# пусто\n', 'e.obj').success).toBe(false)
  })

  it('«Импорт» → OBJ: объект в сцене (закрытый куб — участвует в CSG), имя — файл (WASM)', async () => {
    const cubeObj = 'v -5 -5 -5\nv 5 -5 -5\nv 5 5 -5\nv -5 5 -5\nv -5 -5 5\nv 5 -5 5\nv 5 5 5\nv -5 5 5\n' +
      'f 1 3 2\nf 1 4 3\nf 5 6 7\nf 5 7 8\nf 1 2 6\nf 1 6 5\nf 2 3 7\nf 2 7 6\nf 3 4 8\nf 3 8 7\nf 4 1 5\nf 4 5 8\n'
    picked.file = new File([cubeObj], 'box.obj')
    await st().importStl()
    const objs = Object.values(st().objects)
    expect(objs).toHaveLength(1)
    expect(objs[0].shapeType).toBe('import_mesh')
    expect(objs[0].name).toBe('box.obj')
    expect(st().operations.at(-1)?.type).toBe('import_mesh')
    await st().addShape('cube', { width: 4, height: 4, depth: 4 }, AT(0))
    st().selectObjects(Object.keys(st().objects), false)
    await st().csgBoolean('subtract')
    expect(Object.values(st().objects).map((o) => o.shapeType)).toEqual(['csg'])
  })

  it('«Импорт» → 3MF (наш экспорт): один меш из двух объектов; STL — прежний разбор (null)', async () => {
    const objs = await scene()
    const blob = await exportTo3mf(objs)
    useDocumentStore.setState({ objects: {}, operations: [], historyIndex: 0 })
    clearTree()
    picked.file = new File([await blob.arrayBuffer()], 'scene.3mf')
    await st().importStl()
    expect(Object.values(st().objects)).toHaveLength(1)
    expect(await parseMeshFile(new File(['solid x'], 'a.stl'))).toBeNull()
  })
})
