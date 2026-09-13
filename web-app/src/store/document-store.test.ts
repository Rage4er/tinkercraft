// ============================================================
// Unit tests — document-store: computeAABB, extractAndCenterInPlace,
// exportStl (P2-6: кэшбэк начисляется ТОЛЬКО после успешного экспорта)
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── P2-6: мокаем STL-сериализацию, чтобы проверить цепочку успеха экспорта ───
const h = vi.hoisted(() => ({
  exportToStl: vi.fn(),
  downloadStlBlob: vi.fn(),
}))
vi.mock('../io/stl-export', () => ({
  exportToStl: h.exportToStl,
  downloadStlBlob: h.downloadStlBlob,
}))

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

import { computeAABB, extractAndCenterInPlace, useDocumentStore } from './document-store'
import { useEconomyStore } from './economy-store'
import { calculateCashbackV2, scanForCashback } from './economy-config'
import type { SceneObject } from '../csg/types'

beforeEach(() => {
  h.exportToStl.mockReset()
  h.downloadStlBlob.mockReset()
  pm.pmSave.mockReset()
  pm.pmUpdate.mockReset()
  pm.pmLoad.mockReset()
  pm.pmList.mockReset()
  pm.pmSave.mockResolvedValue({ id: 'proj-1', name: 'Test', objectCount: 0, savedAt: 123 })
  pm.pmUpdate.mockResolvedValue(undefined)
  pm.pmList.mockResolvedValue([])
  // Стабильное состояние документа/экономики для exportStl
  useDocumentStore.setState({ objects: {}, operations: [], fileName: null, historyIndex: 0, currentProjectId: null, currentProjectName: null, modified: false })
  useEconomyStore.setState({
    tokens: 100,
    lastExportHash: null,
    todayExportHashes: [],
    todayCashbacks: 0,
    todayQuests: [],
    todayQuestsCompleted: [],
  })
})

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

  it('начисляет награды за завершённые квесты после успешного сохранения', async () => {
    pm.pmSave.mockResolvedValueOnce({ id: 'proj-1', name: 'Test', objectCount: 0, savedAt: 123 })
    pm.pmList.mockResolvedValueOnce([])
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
