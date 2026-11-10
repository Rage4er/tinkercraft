// ============================================================
// doodle-to-3dtc.test.ts — «Открыть» / «Сохранить» yandex-games = .3dtc (v1.4.0); старые .doodle
// игроков открываются и конвертируются в .3dtc (не теряются; размеры дальше сохраняются)
// ============================================================
// Реальный WASM (worker-bridge): объекты .doodle пересобираются из истории.

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

// Диалог «Открыть» и скачивание — подменяются (DOM-диалог не нужен; скачанный Blob — в тест)
const picked: { current: { file: File; buffer: ArrayBuffer } | null } = { current: null }
const downloads: Array<{ blob: Blob; name: string }> = []
vi.mock('../io/3dtc-io', async (orig) => ({
  ...(await orig<typeof import('../io/3dtc-io')>()),
  open3dtcFilePicker: async () => picked.current,
  downloadBlob: (blob: Blob, name: string) => { downloads.push({ blob, name }) },
}))

import { useDocumentStore } from '../store/document-store'
import { useDimensionsStore } from '../store/dimensions-store'
import { clearSnapshots } from '../store/snapshots'
import { clearTree } from '../csg/history-tree'
import { useNotifications } from '../store/notifications'
import { serializeDoodle } from '../io/doodle-io'
import { parse3dtc, serialize3dtc } from '../io/3dtc-io'
import { parseProjectFile, doodleToProjectName } from '../io/project-file'
import { DEFAULT_DIMENSION_OFFSET, DEFAULT_DIMENSION_STYLE, type Dimension } from '../store/dimensions'
import i18n from '../i18n'
import type { TinkerCraftOperation, TransformNR } from '../csg/types'

const st = () => useDocumentStore.getState()
const T: TransformNR = { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 }

/** История старого .doodle: два куба → объединение → сдвиг результата. */
const OPS = (): TinkerCraftOperation[] => [
  { type: 'add_shape', id: 'obj_1', shapeType: 'cube', params: { width: 10, height: 10, depth: 10 }, color: '#89b4fa', transform: { ...T } },
  { type: 'add_shape', id: 'obj_2', shapeType: 'cube', params: { width: 10, height: 10, depth: 10 }, color: '#a6e3a1', transform: { ...T, x: 5 } },
  { type: 'move', ids: ['obj_2'], delta: { x: 0, y: 5, z: 0 } },
]
const fileOf = async (blob: Blob, name: string) => ({ file: new File([blob], name), buffer: await blob.arrayBuffer() })
/** Уведомления о конвертации .doodle → .3dtc (для файла old.doodle). */
const doodleNotes = () => useNotifications.getState().notifications.filter((n) => n.message === i18n.t('errors.doodleConverted', { name: 'old.doodle' }))

beforeEach(() => {
  useDocumentStore.setState({ objects: {}, operations: [], historyIndex: 0, selectedIds: [], busy: false, fileName: null, modified: false })
  useDimensionsStore.getState().setDimensions([])
  useNotifications.setState({ notifications: [] })
  clearSnapshots(); clearTree()
  picked.current = null
  downloads.length = 0
})

describe('parseProjectFile / doodleToProjectName', () => {
  it('диалог «Открыть» принимает .3dtc и старые .doodle', async () => {
    const real = await vi.importActual<typeof import('../io/3dtc-io')>('../io/3dtc-io')
    let accept = ''
    const click = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(function (this: HTMLInputElement) {
      accept = this.accept; this.oncancel?.(new Event('cancel'))
    })
    expect(await real.open3dtcFilePicker()).toBeNull()
    click.mockRestore()
    expect(accept.split(',')).toEqual(expect.arrayContaining(['.3dtc', '.doodle']))
  })

  it('имя: .doodle → .3dtc, остальные — как есть', () => {
    expect(doodleToProjectName('Дом.doodle')).toBe('Дом.3dtc')
    expect(doodleToProjectName('a.DOODLE')).toBe('a.3dtc')
    expect(doodleToProjectName('b.3dtc')).toBe('b.3dtc')
  })

  it('.doodle → документ .3dtc: история та же, объектов нет (пересборка), размеров нет', async () => {
    const doc = await parseProjectFile(await fileOf(await serializeDoodle(OPS()), 'old.doodle'))
    expect(doc.fromDoodle).toBe(true)
    expect(doc.fileName).toBe('old.3dtc')
    expect(doc.operations.map((o) => o.type)).toEqual(['add_shape', 'add_shape', 'move'])
    expect(doc.objects).toEqual({})
    expect(doc.dimensions).toEqual([])
  })

  it('старый .doodle, переименованный в .zip, — тоже .doodle; .3dtc — как есть', async () => {
    const z = await parseProjectFile(await fileOf(await serializeDoodle(OPS()), 'old.zip'))
    expect(z.fromDoodle).toBe(true)
    expect(z.fileName).toBe('old.3dtc')
    const d = await parseProjectFile(await fileOf(await serialize3dtc({ objects: {}, operations: OPS(), operationsTrimmed: false }), 'new.3dtc'))
    expect(d.fromDoodle).toBe(false)
    expect(d.fileName).toBe('new.3dtc')
  })

  it('не проект — ошибка разбора .3dtc (как раньше)', async () => {
    await expect(parseProjectFile({ file: new File(['x'], 'bad.3dtc'), buffer: new TextEncoder().encode('not a zip').buffer as ArrayBuffer })).rejects.toThrow()
  })
})

describe('openProject: старый .doodle конвертируется в .3dtc', () => {
  it('объекты пересобраны из истории, имя «.3dtc», «не сохранено», одно уведомление; «Сохранить» → .3dtc с размерами', async () => {
    picked.current = await fileOf(await serializeDoodle(OPS()), 'old.doodle')
    await st().openProject()

    expect(st().operations.map((o) => o.type)).toEqual(['add_shape', 'add_shape', 'move'])
    expect(Object.keys(st().objects).sort()).toEqual(['obj_1', 'obj_2'])
    expect(st().objects.obj_2.transform.y).toBe(5)
    expect(st().objects.obj_1.vertices.length).toBeGreaterThan(0)
    expect(st().fileName).toBe('old.3dtc')
    expect(st().modified).toBe(true)
    expect(doodleNotes()).toHaveLength(1)

    // размер в конвертированном документе — сохраняется в .3dtc (в .doodle его негде было хранить)
    const box = { min: { x: -5, y: -5, z: -5 }, max: { x: 5, y: 5, z: 5 } }
    const dim: Dimension = {
      id: 'dim_1', type: 'linear', objectIdA: 'obj_1', objectIdB: 'obj_2',
      pointA: { x: 5, y: 0, z: 0 }, pointB: { x: -5, y: 0, z: 0 }, boxA: box, boxB: box,
      offset: DEFAULT_DIMENSION_OFFSET, style: DEFAULT_DIMENSION_STYLE,
    }
    useDimensionsStore.getState().setDimensions([dim])
    await st().saveProject()
    expect(downloads).toHaveLength(1)
    expect(downloads[0].name).toBe('old.3dtc')
    expect(st().modified).toBe(false)
    const saved = await parse3dtc(downloads[0].blob)
    expect(saved.operations.map((o) => o.type)).toEqual(['add_shape', 'add_shape', 'move'])
    expect(saved.dimensions?.map((d) => d.id)).toEqual(['dim_1'])

    // и открывается как обычный .3dtc — с размером
    useDimensionsStore.getState().setDimensions([])
    picked.current = await fileOf(downloads[0].blob, 'old.3dtc')
    await st().openProject()
    expect(st().fileName).toBe('old.3dtc')
    expect(st().modified).toBe(false)
    expect(useDimensionsStore.getState().dimensions.map((d) => d.id)).toEqual(['dim_1'])
    expect(doodleNotes()).toHaveLength(1)   // уведомление — только за .doodle
  })
})
