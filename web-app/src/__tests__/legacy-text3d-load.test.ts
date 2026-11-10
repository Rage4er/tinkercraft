// ============================================================
// legacy-text3d-load.test.ts — 3D-текст старых проектов yandex-games (v1.4.0, merge main)
// ============================================================
// До v1.4.0 yandex-games писал 3D-текст шагом `text3d`; с merge main текст — `import_mesh` с
// исходной строкой (UX-AUDIT-31). Старые .3dtc / .doodle / автосейвы должны открываться: шаг
// переводится в import_mesh (io/legacy-text3d.ts), объект — 3D-текст на прежнем месте, квест
// «Гравировка» (count_text3d) и категория «текст» кэшбэка по-прежнему его видят.
// Реальный WASM (worker-bridge): меш старого текста не сшит — путь фолбэка baked-геометрии.

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
import { clearTree } from '../csg/history-tree'
import { isTextObject } from '../store/text-object'
import { serialize3dtc, parse3dtc } from '../io/3dtc-io'
import { serializeDoodle } from '../io/doodle-io'
import { migrateLegacyText3d } from '../io/legacy-text3d'
import { useEconomyStore } from '../store/economy-store'
import { economyShapeKind, scanForCashback } from '../store/economy-config'
import type { TinkerCraftOperation, TransformNR } from '../csg/types'

const st = () => useDocumentStore.getState()
const T: TransformNR = { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 }

/** Шаг text3d, как его писал yandex-games до v1.4.0 (addTextMesh): несшитый меш, имя «Текст: …». */
const legacyText = (): TinkerCraftOperation => ({
  type: 'text3d', id: 'txt_1', name: 'Текст: Привет', color: '#cba6f7', transform: { ...T, x: 40 },
  // параллелограмм из 2 треугольников: центр масс (4, 3, 0)
  vertices: [0, 0, 0, 8, 0, 0, 0, 6, 0, 8, 6, 0], indices: [0, 1, 2, 1, 3, 2],
} as unknown as TinkerCraftOperation)
/** История: куб → старый текст → сдвиг текста (шаг после text3d воспроизводится). */
const LEGACY_OPS = (): TinkerCraftOperation[] => [
  { type: 'add_shape', id: 'obj_1', shapeType: 'cube', params: { width: 10, height: 10, depth: 10 }, color: '#89b4fa', transform: { ...T } },
  legacyText(),
  { type: 'move', ids: ['txt_1'], delta: { x: 5, y: 0, z: 0 } },
]

/** Текст на месте: объект-текст, строка из имени, позиция = spawn 40 + центр масс 4 + сдвиг 5. */
function expectLegacyTextLoaded(): void {
  expect(st().operations.map((o) => o.type)).toEqual(['add_shape', 'import_mesh', 'move'])
  const op = st().operations[1]
  expect(op.type === 'import_mesh' && op.text).toBe('Привет')
  const o = st().objects.txt_1
  expect(o).toBeDefined()
  expect(o.shapeType).toBe('import_mesh')
  expect(isTextObject(o)).toBe(true)
  expect(o.name).toBe('Текст: Привет')
  expect(o.color).toBe('#cba6f7')
  expect(o.transform.x).toBeCloseTo(40 + 4 + 5, 4)
  expect(o.transform.y).toBeCloseTo(3, 4)
  expect(o.indices).toHaveLength(6)
}

beforeEach(() => {
  useDocumentStore.setState({ objects: {}, operations: [], historyIndex: 0, selectedIds: [], busy: false })
  clearSnapshots(); clearTree()
  picked.current = null; session.current = null
})

describe('migrateLegacyText3d', () => {
  it('без шагов text3d — тот же массив, changed = false', () => {
    const ops = LEGACY_OPS().filter((o) => (o.type as string) !== 'text3d')
    const m = migrateLegacyText3d(ops)
    expect(m.changed).toBe(false)
    expect(m.operations).toBe(ops)
  })

  it('text3d → import_mesh с текстом из имени; id, цвет, трансформ и геометрия прежние; вход не мутируется', () => {
    const ops = LEGACY_OPS()
    const m = migrateLegacyText3d(ops)
    expect(m.changed).toBe(true)
    expect(m.operations[1]).toEqual({
      type: 'import_mesh', id: 'txt_1', name: 'Текст: Привет', color: '#cba6f7', transform: { ...T, x: 40 },
      vertices: [0, 0, 0, 8, 0, 0, 0, 6, 0, 8, 6, 0], indices: [0, 1, 2, 1, 3, 2], text: 'Привет',
    })
    expect(m.operations[0]).toBe(ops[0])
    expect((ops[1] as { type: string }).type).toBe('text3d')
  })

  it('TypedArray-геометрия (IndexedDB) → number[]', () => {
    const op = { ...legacyText(), vertices: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), indices: new Uint32Array([0, 1, 2]) } as unknown as TinkerCraftOperation
    const out = migrateLegacyText3d([op]).operations[0]
    expect(out.type === 'import_mesh' && Array.isArray(out.vertices) && Array.isArray(out.indices)).toBe(true)
  })
})

describe('загрузка старого проекта с 3D-текстом', () => {
  it('.3dtc: parse3dtc принимает text3d; openProject — текст как в main, на прежнем месте; undo/redo', async () => {
    const blob = await serialize3dtc({ objects: {}, operations: LEGACY_OPS(), operationsTrimmed: false })
    expect((await parse3dtc(blob)).operations.map((o) => o.type)).toEqual(['add_shape', 'text3d', 'move'])
    picked.current = { file: new File([blob], 'old.3dtc'), buffer: await blob.arrayBuffer() }
    await st().openProject()
    expectLegacyTextLoaded()
    await st().undo()
    expect(st().objects.txt_1.transform.x).toBeCloseTo(44, 4)
    await st().redo()
    expect(st().objects.txt_1.transform.x).toBeCloseTo(49, 4)
  })

  it('.doodle (старый файл, «Открыть» конвертирует в .3dtc): openProject — текст как в main', async () => {
    const blob = await serializeDoodle(LEGACY_OPS())
    picked.current = { file: new File([blob], 'old.doodle'), buffer: await blob.arrayBuffer() }
    await st().openProject()
    expectLegacyTextLoaded()
    expect(st().fileName).toBe('old.3dtc')
  })

  it('автосейв: restoreAutosave — текст как в main, индекс истории прежний', async () => {
    session.current = { operations: LEGACY_OPS(), historyIndex: 3, fileName: null, savedAt: 0 }
    expect(await st().restoreAutosave()).toBe(true)
    expectLegacyTextLoaded()
    expect(st().historyIndex).toBe(3)
  })
})

describe('экономика: 3D-текст main (import_mesh + text) — тип text3d', () => {
  // серый #808080 — «без цвета» (иначе объект засчитался бы и в категорию «цвет»)
  const textObj = { shapeType: 'import_mesh', text: 'Hi', color: '#808080', transform: { scaleX: 1, scaleY: 1, scaleZ: 1 } }
  const stlObj = { shapeType: 'import_mesh', color: '#808080', transform: { scaleX: 1, scaleY: 1, scaleZ: 1 } }

  it('economyShapeKind: текст → text3d (и старый id txt_N без поля text), STL и примитивы — свой тип', () => {
    expect(economyShapeKind('txt_7', textObj)).toBe('text3d')
    expect(economyShapeKind('txt_8', stlObj)).toBe('text3d')     // старый текст main: по id
    expect(economyShapeKind('stl_1', stlObj)).toBe('import_mesh')
    expect(economyShapeKind('obj_1', { shapeType: 'cube' })).toBe('cube')
  })

  it('кэшбэк: текст — категория «текст» и отдельный тип; STL — нет', () => {
    const withText = scanForCashback({ txt_1: textObj, stl_1: stlObj }, [])
    expect(withText.uniqueShapeTypes).toBe(2)
    expect(withText.toolCategories).toBe(1)
    const stlOnly = scanForCashback({ stl_1: stlObj }, [])
    expect(stlOnly.uniqueShapeTypes).toBe(1)
    expect(withText.toolsCount - stlOnly.toolsCount).toBe(1)
  })

  it('квест «Гравировка» (count_text3d) засчитывается за текст, созданный как в main', async () => {
    const quest = { difficulty: 'medium' as const, trigger: 'count_text3d' as const, category: 'composition' as const, target: 1, progress: 0, reward: 30, completed: false }
    useEconomyStore.setState({ todayQuests: [quest], todayQuestsCompleted: [] })
    await st().addRawMesh('Текст: Hi', [0, 0, 0, 8, 0, 0, 0, 6, 0, 8, 6, 0], [0, 1, 2, 1, 3, 2], 'Hi')
    const q = useEconomyStore.getState().todayQuests[0]
    expect(q.progress).toBe(1)
    expect(q.completed).toBe(true)
  })
})
