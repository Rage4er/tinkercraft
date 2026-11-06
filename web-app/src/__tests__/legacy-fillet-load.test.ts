// ============================================================
// legacy-fillet-load.test.ts — старые проекты со скруглением открываются (remove-fillet)
// ============================================================
// Реальный WASM: куб после загрузки острый, история без шага fillet, уведомление одно.

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
    workerMirrorObject: bridge.workerMirrorObject,
    workerRebuildScene: bridge.workerRebuildScene,
    workerDeleteObjects: bridge.workerDeleteObjects,
    workerClearAll: bridge.workerClearAll,
    workerRebuildNode: bridge.workerRebuildNode,
    isWorkerReady: bridge.isWorkerReady,
    disposeWorker: bridge.disposeWorker,
  }
})

// Выбор файла и автосейв — подменяются (DOM-диалог и IndexedDB не нужны)
const picked: { current: { file: File; buffer: ArrayBuffer } | null } = { current: null }
vi.mock('../io/3dtc-io', async (orig) => ({
  ...(await orig<typeof import('../io/3dtc-io')>()),
  open3dtcFilePicker: async () => picked.current,
}))
const session: { current: unknown } = { current: null }
vi.mock('../io/autosave', async (orig) => ({
  ...(await orig<typeof import('../io/autosave')>()),
  restoreSession: async () => session.current,
}))

import { useDocumentStore } from '../store/document-store'
import { clearSnapshots } from '../store/snapshots'
import { clearTree, getNode } from '../csg/history-tree'
import { rebuildFromHistory } from '../store/rebuild'
import { meshVolume } from '../store/edit-child'
import { useNotifications } from '../store/notifications'
import { serialize3dtc, parse3dtc } from '../io/3dtc-io'
import { serializeDoodle, parseDoodle } from '../io/doodle-io'
import { migrateLegacyFillet } from '../io/legacy-fillet'
import i18n from '../i18n'
import type { TinkerCraftOperation, SceneObject, TransformNR } from '../csg/types'

const st = () => useDocumentStore.getState()
const T: TransformNR = { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 }
const SHARP = 1000 // куб 10³

/** История старой версии: куб 10 → fillet r=2 → сдвиг (шаг после fillet воспроизводится). */
const LEGACY_OPS = (): TinkerCraftOperation[] => [
  { type: 'add_shape', id: 'obj_1', shapeType: 'cube', params: { width: 10, height: 10, depth: 10 }, color: '#89b4fa', transform: { ...T } },
  { type: 'fillet', id: 'obj_1', radius: 2 },
  { type: 'move', ids: ['obj_1'], delta: { x: 15, y: 0, z: 0 } },
]
/** Объект, как его сохраняла старая версия: скруглённые вершины + filletRadius в params. */
function legacyObject(): SceneObject {
  // «скруглённый» куб условно — меньший объём, чем 10³ (важно лишь, что не острый)
  const v = new Float32Array([-4, -4, -4, 4, -4, -4, 4, 4, -4, -4, 4, -4, -4, -4, 4, 4, -4, 4, 4, 4, 4, -4, 4, 4])
  const i = new Uint32Array([0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 2, 3, 7, 2, 7, 6, 1, 2, 6, 1, 6, 5, 0, 4, 7, 0, 7, 3])
  return {
    id: 'obj_1', shapeType: 'cube', params: { width: 10, height: 10, depth: 10, filletRadius: 2 } as SceneObject['params'],
    color: '#89b4fa', transform: { ...T, x: 15 }, visible: true, locked: false, vertices: v, indices: i,
  }
}
const vol = (o: SceneObject) => meshVolume(o.vertices, o.indices)
const legacyNotes = () => useNotifications.getState().notifications.filter((n) => n.message === i18n.t('errors.legacyFilletRemoved'))

beforeEach(() => {
  useDocumentStore.setState({ objects: {}, operations: [], historyIndex: 0, selectedIds: [], busy: false })
  useNotifications.setState({ notifications: [] })
  clearSnapshots(); clearTree()
})

describe('старый .3dtc со скруглением', () => {
  it('parse3dtc принимает файл; воспроизведение игнорирует fillet — куб острый', async () => {
    const blob = await serialize3dtc({ objects: { obj_1: legacyObject() }, operations: LEGACY_OPS(), operationsTrimmed: false })
    const doc = await parse3dtc(blob)
    expect(doc.operations.map((o) => o.type)).toEqual(['add_shape', 'fillet', 'move'])
    // даже без миграции воспроизведение не скругляет
    const objs = await rebuildFromHistory(doc.operations)
    expect(vol(objs.obj_1)).toBeCloseTo(SHARP, 3)
    expect(objs.obj_1.params).not.toHaveProperty('filletRadius')
    expect(objs.obj_1.transform.x).toBe(15)
  })

  it('openProject: история без fillet, куб острый (а не сохранённые вершины), одно уведомление', async () => {
    const blob = await serialize3dtc({ objects: { obj_1: legacyObject() }, operations: LEGACY_OPS(), operationsTrimmed: false })
    picked.current = { file: new File([blob], 'old.3dtc'), buffer: await blob.arrayBuffer() }
    await st().openProject()

    expect(st().operations.map((o) => o.type)).toEqual(['add_shape', 'move'])
    expect(st().historyIndex).toBe(2)
    const o = st().objects.obj_1
    expect(o.params).toEqual({ width: 10, height: 10, depth: 10 })
    expect(vol(o)).toBeCloseTo(SHARP, 3)
    expect(o.transform.x).toBe(15)
    expect(getNode('obj_1')?.params).not.toHaveProperty('filletRadius')
    expect(legacyNotes()).toHaveLength(1)

    // история работает: undo/redo по оставшимся шагам
    await st().undo()
    expect(st().objects.obj_1.transform.x).toBe(0)
    await st().redo()
    expect(st().objects.obj_1.transform.x).toBe(15)
  })

  it('файл без скругления открывается как раньше, без уведомления', async () => {
    const ops = LEGACY_OPS().filter((o) => o.type !== 'fillet')
    const objects = await rebuildFromHistory(ops)
    const blob = await serialize3dtc({ objects, operations: ops, operationsTrimmed: false })
    picked.current = { file: new File([blob], 'new.3dtc'), buffer: await blob.arrayBuffer() }
    await st().openProject()
    expect(st().operations).toHaveLength(2)
    expect(Array.from(st().objects.obj_1.vertices)).toEqual(Array.from(objects.obj_1.vertices))
    expect(legacyNotes()).toHaveLength(0)
  })
})

describe('старый .doodle и автосейв со скруглением', () => {
  it('.doodle: parseDoodle принимает fillet; миграция + воспроизведение — куб острый', async () => {
    const doc = await parseDoodle(await (await serializeDoodle(LEGACY_OPS())).arrayBuffer())
    expect(doc.operations.some((o) => o.type === 'fillet')).toBe(true)
    const m = migrateLegacyFillet(doc.operations)
    expect(m.changed).toBe(true)
    expect(m.operations.some((o) => o.type === 'fillet')).toBe(false)
    const objs = await rebuildFromHistory(m.operations)
    expect(vol(objs.obj_1)).toBeCloseTo(SHARP, 3)
  })

  it('restoreAutosave: история без fillet, индекс пересчитан, одно уведомление', async () => {
    session.current = { operations: LEGACY_OPS(), historyIndex: 3, fileName: null, savedAt: 0 }
    expect(await st().restoreAutosave()).toBe(true)
    expect(st().operations.map((o) => o.type)).toEqual(['add_shape', 'move'])
    expect(st().historyIndex).toBe(2)
    expect(vol(st().objects.obj_1)).toBeCloseTo(SHARP, 3)
    expect(legacyNotes()).toHaveLength(1)
  })
})
