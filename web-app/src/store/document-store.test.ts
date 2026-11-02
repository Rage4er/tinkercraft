// ============================================================
// Unit tests — document-store: computeAABB, extractAndCenterInPlace,
// resizeObject (Фаза 8, Этап 7) + economy-интеграция yandex-games
// (exportStl кэшбэк P2-6/U8, saveToProject commitQuests P0-2,
// addShape quest progress UB2-1)
// ============================================================
// Основа: main-тесты (8.5-семантика). Дополнено адаптированными
// economy-тестами из yandex-games (моки stl-export/platform/project-manager).

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── P2-6: мокаем STL-сериализацию, чтобы проверить цепочку успеха экспорта ───
const h = vi.hoisted(() => ({
  exportToStl: vi.fn(),
  downloadStlBlob: vi.fn(),
}))
vi.mock('../io/stl-export', async (importOriginal) => {
  // StlTooLargeError — настоящий класс: exportStl проверяет instanceof, чтобы
  // показать локализованное сообщение о лимите треугольников (E1)
  const actual = await importOriginal<typeof import('../io/stl-export')>()
  return {
    exportToStl: h.exportToStl,
    downloadStlBlob: h.downloadStlBlob,
    StlTooLargeError: actual.StlTooLargeError,
  }
})

// Экономика «доступна» — кэшбэк начисляется (проверка анти-фарма внутри
// calculateAndClaimCashback остаётся настоящей, нам нужен только факт доступности).
vi.mock('../platform', () => ({
  getPlatform: () => null,
  isEconomyAvailable: () => true,
  getPlatformType: () => 'yandex',
  initPlatform: async () => true,
}))

// P0-2: мокаем Project Manager — saveToProject вызывает pmSave/pmList
const pm = vi.hoisted(() => ({
  pmSave: vi.fn(),
  pmUpdate: vi.fn(),
  pmLoad: vi.fn(),
  pmList: vi.fn(),
}))
vi.mock('../io/project-manager', () => ({
  saveProject: pm.pmSave,
  updateProject: pm.pmUpdate,
  loadProject: pm.pmLoad,
  listProjects: pm.pmList,
}))

// jsdom не имеет Worker/WASM: mock worker-client синтетическими origin-мешами.
// vi.mock hoisted — определён до импорта document-store.
const wc = vi.hoisted(() => {
  function originBoxMesh(id: string, params: Record<string, number>) {
    const w = params.width ?? (params.radius ?? 5) * 2
    const h = params.height ?? 10
    const d = params.depth ?? (params.radius ?? 5) * 2
    const hw = w / 2, hh = h / 2, hd = d / 2
    const vertices = new Float32Array([
      -hw, -hh, -hd, hw, -hh, -hd, hw, hh, -hd, -hw, hh, -hd,
      -hw, -hh, hd, hw, -hh, hd, hw, hh, hd, -hw, hh, hd,
    ])
    const indices = new Uint32Array([
      0, 2, 1, 0, 3, 2, 1, 2, 6, 1, 6, 5, 4, 5, 6, 4, 6, 7,
      0, 1, 5, 0, 5, 4, 2, 3, 7, 2, 7, 6, 0, 4, 7, 0, 7, 3,
    ])
    return { objId: id, vertices, indices, normals: null, tris: 12, ms: 0 }
  }
  return {
    originBoxMesh,
    workerBuildShape: vi.fn(async (id: string, _st: string, p: Record<string, number>) => originBoxMesh(id, p)),
    workerCsgBoolean: vi.fn(),
    workerCsgBooleanWithSync: vi.fn(),
    workerBuildImportedMesh: vi.fn(),
    workerApplyFillet: vi.fn(),
    workerMirrorObject: vi.fn(),
    workerRebuildScene: vi.fn(async () => ({ results: [], ms: 0 })),
    workerDeleteObjects: vi.fn(async () => { }),
    workerClearAll: vi.fn(async () => { }),
    workerSyncObjects: vi.fn(async () => { }),
    workerSyncMesh: vi.fn(async () => { }),
    workerRebuildNode: vi.fn(async () => originBoxMesh('n', {})),
  }
})
vi.mock('../csg/worker-client', () => wc)

import { computeAABB, extractAndCenterInPlace, useDocumentStore } from './document-store'
import { makeObject } from './helpers'
import { useEconomyStore } from './economy-store'
import { calculateCashbackV2, scanForCashback } from './economy-config'
import { workerBuildShape } from '../csg/worker-client'
import { createPrimitiveNode, createBooleanNode, getNode, clearTree } from '../csg/history-tree'
import type { SceneObject, TransformNR } from '../csg/types'

describe('computeAABB', () => {
  it('computes correct min/max for a simple box', () => {
    const verts = new Float32Array([
      0, 0, 0,
      2, 0, 0,
      2, 3, 0,
      0, 3, 0,
      0, 0, 4,
      2, 0, 4,
      2, 3, 4,
      0, 3, 4,
    ])
    const aabb = computeAABB(verts)
    expect(aabb.min.x).toBe(0)
    expect(aabb.min.y).toBe(0)
    expect(aabb.min.z).toBe(0)
    expect(aabb.max.x).toBe(2)
    expect(aabb.max.y).toBe(3)
    expect(aabb.max.z).toBe(4)
  })

  it('handles negative coordinates', () => {
    const verts = new Float32Array([
      -5, -10, -3,
      5, 10, 3,
    ])
    const aabb = computeAABB(verts)
    expect(aabb.min.x).toBe(-5)
    expect(aabb.min.y).toBe(-10)
    expect(aabb.min.z).toBe(-3)
    expect(aabb.max.x).toBe(5)
    expect(aabb.max.y).toBe(10)
    expect(aabb.max.z).toBe(3)
  })

  it('handles a single vertex', () => {
    const verts = new Float32Array([7, 8, 9])
    const aabb = computeAABB(verts)
    expect(aabb.min.x).toBe(7)
    expect(aabb.min.y).toBe(8)
    expect(aabb.min.z).toBe(9)
    expect(aabb.max.x).toBe(7)
    expect(aabb.max.y).toBe(8)
    expect(aabb.max.z).toBe(9)
  })
})

describe('extractAndCenterInPlace', () => {
  it('shifts vertices so bbox center is at origin', () => {
    // Box from (10,20,30) to (30,40,50) — center at (20,30,40)
    const verts = new Float32Array([
      10, 20, 30,
      30, 20, 30,
      30, 40, 30,
      10, 40, 30,
      10, 20, 50,
      30, 20, 50,
      30, 40, 50,
      10, 40, 50,
    ])
    const { cx, cy, cz } = extractAndCenterInPlace(verts)
    expect(cx).toBe(20)
    expect(cy).toBe(30)
    expect(cz).toBe(40)

    // After centering, min should be at (-10,-10,-10) and max at (10,10,10)
    const aabb = computeAABB(verts)
    expect(aabb.min.x).toBe(-10)
    expect(aabb.min.y).toBe(-10)
    expect(aabb.min.z).toBe(-10)
    expect(aabb.max.x).toBe(10)
    expect(aabb.max.y).toBe(10)
    expect(aabb.max.z).toBe(10)
  })

  it('modifies the input array in-place', () => {
    const verts = new Float32Array([0, 0, 0, 10, 0, 0, 0, 10, 0])
    const original = new Float32Array(verts)
    extractAndCenterInPlace(verts)
    // The array should have changed
    expect(verts).not.toEqual(original)
  })

  it('returns zero center for empty array', () => {
    const verts = new Float32Array(0)
    const { cx, cy, cz } = extractAndCenterInPlace(verts)
    expect(cx).toBe(0)
    expect(cy).toBe(0)
    expect(cz).toBe(0)
  })

  it('is a no-op for already-centered geometry', () => {
    // Box from (-5,-5,-5) to (5,5,5) — center at (0,0,0)
    const verts = new Float32Array([
      -5, -5, -5,
      5, -5, -5,
      5, 5, -5,
      -5, 5, -5,
      -5, -5, 5,
      5, -5, 5,
      5, 5, 5,
      -5, 5, 5,
    ])
    const original = new Float32Array(verts)
    const { cx, cy, cz } = extractAndCenterInPlace(verts)
    expect(cx).toBe(0)
    expect(cy).toBe(0)
    expect(cz).toBe(0)
    // Vertices should not change
    expect(verts).toEqual(original)
  })
})

// ─── P2-6: кэшбэк начисляется ТОЛЬКО после успешного экспорта ───────
// U8/P1-1: единая модель кэшбэка — кэшбэк начисляется ТОЛЬКО на рекламном
// пути ('ad'). При оплате токенами он уже учтён в цене модалки (netCost).
// Хэш модели фиксируется при ЛЮБОМ успешном экспорте (анти-фарм).

describe('exportStl кэшбэк после успеха (P2-6 + U8/P1-1)', () => {
  const cube = (id: string): SceneObject => ({
    id,
    shapeType: 'cube',
    params: { width: 10, depth: 10, height: 10 },
    color: '#89b4fa',
    transform: { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 },
    visible: true,
    locked: false,
    vertices: new Float32Array(),
    indices: new Uint32Array(),
  })

  beforeEach(() => {
    h.exportToStl.mockReset()
    h.downloadStlBlob.mockReset()
  })

  it('начисляет кэшбэк на рекламном пути ТОЛЬКО после успешного создания Blob', () => {
    h.exportToStl.mockReturnValueOnce(new Blob(['stl']))
    useDocumentStore.setState({
      objects: { a: cube('a'), b: cube('b') },
      operations: [],
      historyIndex: 0,
      fileName: null,
    })
    useEconomyStore.setState({ tokens: 100, lastExportHash: null, todayExportHashes: [], todayCashbacks: 0 })

    useDocumentStore.getState().exportStl('ad')

    expect(h.exportToStl).toHaveBeenCalledTimes(1)
    expect(h.downloadStlBlob).toHaveBeenCalledTimes(1)
    // Кэшбэк начислен — токены выросли
    expect(useEconomyStore.getState().tokens).toBeGreaterThan(100)
    expect(useEconomyStore.getState().todayCashbacks).toBe(1)
  })

  it('U8: при оплате токенами кэшбэк НЕ начисляется повторно (нет задвоения)', () => {
    h.exportToStl.mockReturnValueOnce(new Blob(['stl']))
    useDocumentStore.setState({
      objects: { a: cube('a'), b: cube('b') },
      operations: [],
      historyIndex: 0,
      fileName: null,
    })
    // Модалка уже списала netCost = 50 − кэшбэк (для 2 кубов кэшбэк ≥ 1)
    useEconomyStore.setState({ tokens: 51, lastExportHash: null, todayExportHashes: [], todayCashbacks: 0 })

    useDocumentStore.getState().exportStl('tokens')

    expect(h.downloadStlBlob).toHaveBeenCalledTimes(1)
    // Кэшбэк НЕ начислен повторно — токены не выросли
    expect(useEconomyStore.getState().tokens).toBe(51)
    expect(useEconomyStore.getState().todayCashbacks).toBe(0)
    // Анти-фарм: хэш всё равно зафиксирован — повторный экспорт той же
    // модели (даже рекламой) кэшбэк не даст.
    expect(useEconomyStore.getState().lastExportHash).not.toBeNull()
  })

  it('U8: итоговый баланс при токен-оплате = −50 + кэшбэк, а не −50 + 2×кэшбэк', () => {
    h.exportToStl.mockReturnValueOnce(new Blob(['stl']))
    useDocumentStore.setState({
      objects: { a: cube('a'), b: cube('b') },
      operations: [],
      historyIndex: 0,
      fileName: null,
    })
    // Считаем кэшбэк для 2 кубов (как в модалке)
    const scan = scanForCashback(
      useDocumentStore.getState().objects as never,
      useDocumentStore.getState().operations as never,
    )
    const cashback = calculateCashbackV2(scan)
    const startTokens = 100
    useEconomyStore.setState({ tokens: startTokens, lastExportHash: null, todayExportHashes: [], todayCashbacks: 0 })

    // Модалка: spendTokens(50 − cashback)
    const ok = useEconomyStore.getState().spendTokens(Math.max(0, 50 - cashback))
    expect(ok).toBe(true)
    // Экспорт: токен-путь — кэшбэк НЕ начисляется повторно
    useDocumentStore.getState().exportStl('tokens')

    // Итоговый баланс: 100 − 50 + cashback (скидка один раз), НЕ 100 − 50 + 2×cashback
    expect(useEconomyStore.getState().tokens).toBe(startTokens - 50 + cashback)
    expect(useEconomyStore.getState().todayCashbacks).toBe(0)
  })

  it('НЕ начисляет кэшбэк, если сериализация STL упала', () => {
    h.exportToStl.mockImplementationOnce(() => {
      throw new Error('worker crashed')
    })
    useDocumentStore.setState({
      objects: { a: cube('a'), b: cube('b') },
      operations: [],
      historyIndex: 0,
      fileName: null,
    })
    useEconomyStore.setState({ tokens: 100, lastExportHash: null, todayExportHashes: [], todayCashbacks: 0 })

    useDocumentStore.getState().exportStl('ad')

    // Экспорт не состоялся — кэшбэк НЕ начислен, файл не скачан
    expect(h.downloadStlBlob).not.toHaveBeenCalled()
    expect(useEconomyStore.getState().tokens).toBe(100)
    expect(useEconomyStore.getState().todayCashbacks).toBe(0)
  })

  it('U8: повторный экспорт той же модели без изменений — без кэшбэка (анти-фарм)', () => {
    h.exportToStl.mockReturnValue(new Blob(['stl']))
    useDocumentStore.setState({
      objects: { a: cube('a'), b: cube('b') },
      operations: [],
      historyIndex: 0,
      fileName: null,
    })
    useEconomyStore.setState({ tokens: 100, lastExportHash: null, todayExportHashes: [], todayCashbacks: 0 })

    // Первый экспорт рекламой — кэшбэк начислен
    useDocumentStore.getState().exportStl('ad')
    const tokensAfterFirst = useEconomyStore.getState().tokens
    const cashbacksAfterFirst = useEconomyStore.getState().todayCashbacks
    expect(cashbacksAfterFirst).toBe(1)

    // Второй экспорт той же модели рекламой — кэшбэк НЕ начислен (хэш тот же)
    useDocumentStore.getState().exportStl('ad')
    expect(useEconomyStore.getState().tokens).toBe(tokensAfterFirst)
    expect(useEconomyStore.getState().todayCashbacks).toBe(1)
  })
})

// ─── P0-2: commitQuests в saveToProject (зачёт наград при сохранении) ───

describe('saveToProject commitQuests (P0-2)', () => {
  const quest = {
    difficulty: 'easy' as const,
    trigger: 'count_cubes' as const,
    category: 'composition' as const,
    target: 5,
    progress: 5,
    reward: 20,
    completed: true,
  }

  beforeEach(() => {
    pm.pmSave.mockReset()
    pm.pmUpdate.mockReset()
    pm.pmLoad.mockReset()
    pm.pmList.mockReset()
    pm.pmSave.mockResolvedValue({ id: 'proj-1', name: 'Test', objectCount: 0, savedAt: 123 })
    pm.pmUpdate.mockResolvedValue(undefined)
    pm.pmList.mockResolvedValue([])
  })

  it('начисляет награды за завершённые квесты после успешного сохранения', async () => {
    useDocumentStore.setState({
      objects: {},
      operations: [],
      historyIndex: 0,
      fileName: null,
      currentProjectId: null,
      currentProjectName: null,
      modified: false,
    })
    useEconomyStore.setState({
      tokens: 100,
      todayQuests: [quest],
      todayQuestsCompleted: [],
      lastExportHash: null,
      todayExportHashes: [],
      todayCashbacks: 0,
    })

    await useDocumentStore.getState().saveToProject('Test Project')

    expect(pm.pmSave).toHaveBeenCalledTimes(1)
    // Награда за квест начислена (easy = 20)
    expect(useEconomyStore.getState().tokens).toBe(120)
    expect(useEconomyStore.getState().todayQuestsCompleted).toContain('easy')
  })

  it('НЕ начисляет награды, если сохранение упало (ошибка) — квесты не засчитываются', async () => {
    pm.pmList.mockResolvedValueOnce([])
    pm.pmSave.mockRejectedValueOnce(new Error('IDB full'))
    useDocumentStore.setState({
      objects: {},
      operations: [],
      historyIndex: 0,
      fileName: null,
      currentProjectId: null,
      currentProjectName: null,
      modified: false,
    })
    useEconomyStore.setState({
      tokens: 100,
      todayQuests: [quest],
      todayQuestsCompleted: [],
      lastExportHash: null,
      todayExportHashes: [],
      todayCashbacks: 0,
    })

    await useDocumentStore.getState().saveToProject('Test Project')

    // Сохранение не состоялось — квесты НЕ засчитаны, токены не изменились
    expect(useEconomyStore.getState().tokens).toBe(100)
    expect(useEconomyStore.getState().todayQuestsCompleted).not.toContain('easy')
  })
})

// ─── UB2-1: addShape обновляет прогресс квестов (evaluateQuests) ───

describe('addShape quest progress (UB2-1)', () => {
  const uniqueShapesQuest = {
    difficulty: 'easy' as const,
    trigger: 'count_unique_shapes' as const,
    category: 'diversity' as const,
    target: 4,
    progress: 0,
    reward: 20,
    completed: false,
  }

  beforeEach(() => {
    wc.workerBuildShape.mockReset()
    wc.workerBuildShape.mockImplementation(async (id: string) => ({ ...wc.originBoxMesh(id, {}), objId: id }))
    useDocumentStore.setState({
      objects: {},
      operations: [],
      historyIndex: 0,
      fileName: null,
      currentProjectId: null,
      currentProjectName: null,
      modified: false,
      selectedIds: [],
      busy: false,
    })
    useEconomyStore.setState({
      tokens: 100,
      todayQuests: [uniqueShapesQuest],
      todayQuestsCompleted: [],
      todayActions: 0,
      lastActionTimestamp: null,
      lastExportHash: null,
      todayExportHashes: [],
      todayCashbacks: 0,
    })
  })

  it('создание примитива обновляет прогресс квеста (раньше addShape не звал evaluateQuests)', async () => {
    await useDocumentStore.getState().addShape('cube')

    const quest = useEconomyStore.getState().todayQuests[0]
    // Один куб = один уникальный тип фигуры → прогресс 1/4
    expect(quest.progress).toBe(1)
    expect(quest.completed).toBe(false)
  })

  it('4 РАЗНЫХ типа фигур завершают квест (уникальные типы, не количество примитивов)', async () => {
    const store = useDocumentStore.getState()
    await store.addShape('cube')
    await store.addShape('sphere')
    await store.addShape('cylinder')
    await store.addShape('cone')

    const quest = useEconomyStore.getState().todayQuests[0]
    expect(quest.progress).toBe(4)
    expect(quest.completed).toBe(true)
  })

  it('4 ОДИНАКОВЫХ примитива НЕ завершают квест (прогресс 1/4 — считаются типы)', async () => {
    const store = useDocumentStore.getState()
    await store.addShape('cube')
    await store.addShape('cube')
    await store.addShape('cube')
    await store.addShape('cube')

    const quest = useEconomyStore.getState().todayQuests[0]
    expect(quest.progress).toBe(1)
    expect(quest.completed).toBe(false)
  })
})

// ============================================================
// Фаза 8, Этап 7 — resizeObject: params-only, vertices в origin
// (RESIZE-TRS-DOUBLE)
// ============================================================
const IDENTITY: TransformNR = { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 }

// Тот же origin-box, что возвращает mock workerBuildShape — для seed-объектов
function originBox(params: Record<string, number>): { vertices: Float32Array; indices: Uint32Array } {
  const w = params.width ?? (params.radius ?? 5) * 2
  const h = params.height ?? 10
  const d = params.depth ?? (params.radius ?? 5) * 2
  const hw = w / 2, hh = h / 2, hd = d / 2
  return {
    vertices: new Float32Array([
      -hw, -hh, -hd, hw, -hh, -hd, hw, hh, -hd, -hw, hh, -hd,
      -hw, -hh, hd, hw, -hh, hd, hw, hh, hd, -hw, hh, hd,
    ]),
    indices: new Uint32Array([
      0, 2, 1, 0, 3, 2, 1, 2, 6, 1, 6, 5, 4, 5, 6, 4, 6, 7,
      0, 1, 5, 0, 5, 4, 2, 3, 7, 2, 7, 6, 0, 4, 7, 0, 7, 3,
    ]),
  }
}

function seedObject(id: string, shapeType: SceneObject['shapeType'], params: Record<string, number>, transform: TransformNR): SceneObject {
  const { vertices, indices } = originBox(params)
  const obj = makeObject({ id, shapeType, params: { ...params }, color: '#fff', transform, visible: true, locked: false, vertices, indices, normals: null })
  useDocumentStore.setState((s) => ({ objects: { ...s.objects, [id]: obj } }))
  return obj
}

describe('resizeObject (Этап 7, RESIZE-TRS-DOUBLE)', () => {
  beforeEach(() => {
    clearTree()
    useDocumentStore.setState({ objects: {}, operations: [], historyIndex: 0, selectedIds: [], busy: false })
    vi.mocked(workerBuildShape).mockClear()
  })

  it('vertices не удваиваются: mesh пересобирается в ORIGIN, transform не меняется', async () => {
    const transform: TransformNR = { x: 10, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 30, scaleX: 2, scaleY: 1, scaleZ: 1 }
    seedObject('p1', 'prism', { radius: 12, height: 20, sides: 3 }, transform)
    const before = useDocumentStore.getState().objects.p1
    const beforeMax = Math.max(...Array.from(before.vertices.map(Math.abs)))

    await useDocumentStore.getState().resizeObject('p1', { height: 40 })
    const after = useDocumentStore.getState().objects.p1

    // Ключевой признак Stage 7: mesh запрошен с НУЛЕВЫМ transform (origin),
    // а НЕ с obj.transform (иначе TRS запекается в vertices → удвоение на pivot)
    const call = vi.mocked(workerBuildShape).mock.calls.find((c) => c[0] === 'p1')!
    expect(call[3]).toEqual({ x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 })

    // params обновлены
    expect(after.params).toEqual({ radius: 12, height: 40, sides: 3 })
    // vertices в origin: bbox центрирован, ни rot, ни scale не запечены
    const aabb = computeAABB(after.vertices)
    const afterMax = Math.max(...Array.from(after.vertices.map(Math.abs)))
    expect((aabb.min.x + aabb.max.x) / 2).toBeCloseTo(0, 5)
    expect((aabb.min.y + aabb.max.y) / 2).toBeCloseTo(0, 5)
    expect(aabb.max.y - aabb.min.y).toBeCloseTo(40, 5) // новый params.height, не 40*2
    // transform не изменился — TRS живёт ТОЛЬКО в transform
    expect(after.transform).toEqual(transform)

    console.log(`Before resize: vertices in origin (max |v| = ${beforeMax}), transform.position = [${transform.x}, ${transform.y}, ${transform.z}]`)
    console.log(`After resize:  vertices in origin (max |v| = ${afterMax}), transform.position = [${after.transform.x}, ${after.transform.y}, ${after.transform.z}]`)
  })

  it('anchor-семантика: transform.position не меняется (центральный anchor; anchorDelta в API отсутствует)', async () => {
    // grep-факт: resizeObject(id, params: ShapeParams) — параметра anchor нет;
    // anchor в store существует только у alignSelected. Текущая семантика —
    // рост вокруг pivot (центр). Проверим, что position сохранён.
    const transform: TransformNR = { ...IDENTITY, x: 10 }
    seedObject('c1', 'cube', { width: 10, height: 10, depth: 10 }, transform)
    await useDocumentStore.getState().resizeObject('c1', { width: 30 })
    const after = useDocumentStore.getState().objects.c1
    expect(after.transform.x).toBe(10)
    expect(after.transform.y).toBe(0)
    expect(after.transform.z).toBe(0)
    expect(after.params.width).toBe(30)
  })

  it('CSG-результат: vertices не трогаются, resize = scale в transform', async () => {
    const transform: TransformNR = { ...IDENTITY, x: 5 }
    const obj = seedObject('g1', 'csg', {}, transform)
    const beforeVertices = obj.vertices

    await useDocumentStore.getState().resizeObject('g1', { width: 20 })
    const after = useDocumentStore.getState().objects.g1

    // vertices не перезаписаны (тот же буфер, тот же origin-контент)
    expect(after.vertices).toBe(beforeVertices)
    const aabb = computeAABB(after.vertices)
    expect((aabb.min.x + aabb.max.x) / 2).toBeCloseTo(0, 5)
    // scale = target/currentSize (20/10), позиция не изменилась
    expect(after.transform.scaleX).toBeCloseTo(2, 6)
    expect(after.transform.x).toBe(5)
    // CSG НЕ пересобирается через workerBuildShape (mesh-запись — корень бага)
    expect(vi.mocked(workerBuildShape)).not.toHaveBeenCalled()
  })

  it('Scenario 2 (§10.2): призма → rotate 30° → scale 2× → resize — без удвоения', async () => {
    const transform: TransformNR = { x: 10, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 30, scaleX: 2, scaleY: 1, scaleZ: 1 }
    seedObject('sc2', 'prism', { radius: 12, height: 20, sides: 3 }, transform)

    await useDocumentStore.getState().resizeObject('sc2', { height: 40 })
    const after = useDocumentStore.getState().objects.sc2

    // Математическое ожидание: vertices = origin-бокс НОВЫХ params;
    // мировые габариты = params × scale (scale применён ОДИН раз — на pivot).
    const aabb = computeAABB(after.vertices)
    const localSize = { x: aabb.max.x - aabb.min.x, y: aabb.max.y - aabb.min.y, z: aabb.max.z - aabb.min.z }
    const worldSize = {
      x: localSize.x * after.transform.scaleX,
      y: localSize.y * after.transform.scaleY,
      z: localSize.z * after.transform.scaleZ,
    }
    const expected = { x: 48, y: 40, z: 24 } // (2*radius)*scaleX, height, (2*radius)*scaleZ
    const diff = Math.max(
      Math.abs(worldSize.x - expected.x),
      Math.abs(worldSize.y - expected.y),
      Math.abs(worldSize.z - expected.z),
    )
    // Старый код дал бы worldSize.x = 24*2(запеч.) *2(pivot) = 96 — удвоение
    expect(diff).toBeLessThan(1e-4)
    expect(after.transform.rotZ).toBe(30) // rotation не удвоен и не запечён
    expect(after.transform.scaleX).toBe(2)

    console.log('Prism sides=3 → rotate 30° → scale 2x → resize height=40')
    console.log(`Final world size: [${worldSize.x}, ${worldSize.y}, ${worldSize.z}]`)
    console.log(`Expected:         [${expected.x}, ${expected.y}, ${expected.z}]  diff = ${diff}`)
  })

  it('relativeToParent детей boolean не меняется при resize', async () => {
    createPrimitiveNode('ra', 'cube', { width: 10, height: 10, depth: 10 }, { ...IDENTITY })
    createPrimitiveNode('rb', 'cube', { width: 10, height: 10, depth: 10 }, { ...IDENTITY, x: 10 })
    createBooleanNode('ru', 'union', 'ra', 'rb')

    const beforeRelA = JSON.parse(JSON.stringify(getNode('ra')!.relativeToParent))
    expect(beforeRelA).not.toBeNull() // Stage 3 заполняет relativeToParent детей

    seedObject('ra', 'cube', { width: 10, height: 10, depth: 10 }, { ...IDENTITY })
    await useDocumentStore.getState().resizeObject('ra', { width: 30 })

    const afterNode = getNode('ra')!
    // JSON-клон нормализует -0 → 0 (subtractTransform даёт -0 в rotationDelta;
    // Object.is различает 0 и -0, семантически это одно и то же)
    expect(JSON.parse(JSON.stringify(afterNode.relativeToParent))).toEqual(beforeRelA)
    expect(afterNode.params).toEqual({ width: 30, height: 10, depth: 10 })
  })

  it('localTransform ноды не меняется при resize (anchor = центр)', async () => {
    const T: TransformNR = { x: 7, y: 2, z: 0, rotX: 0, rotY: 0, rotZ: 45, scaleX: 1, scaleY: 1, scaleZ: 1 }
    seedObject('lt1', 'cube', { width: 10, height: 10, depth: 10 }, T)

    await useDocumentStore.getState().resizeObject('lt1', { width: 20 })

    const node = getNode('lt1')!
    expect(node.localTransform).toEqual(T)
    expect(node.params).toEqual({ width: 20, height: 10, depth: 10 })
    // и в store transform идентичен
    expect(useDocumentStore.getState().objects.lt1.transform).toEqual(T)
  })
})
