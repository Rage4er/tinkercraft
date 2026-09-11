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

import { computeAABB, extractAndCenterInPlace, useDocumentStore } from './document-store'
import { useEconomyStore } from './economy-store'
import type { SceneObject } from '../csg/types'

beforeEach(() => {
  h.exportToStl.mockReset()
  h.downloadStlBlob.mockReset()
  // Стабильное состояние документа/экономики для exportStl
  useDocumentStore.setState({ objects: {}, operations: [], fileName: null, historyIndex: 0 })
  useEconomyStore.setState({
    tokens: 100,
    lastExportHash: null,
    todayExportHashes: [],
    todayCashbacks: 0,
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

describe('exportStl кэшбэк после успеха (P2-6)', () => {
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

  it('начисляет кэшбэк ТОЛЬКО после успешного создания Blob (сериализации)', () => {
    h.exportToStl.mockReturnValueOnce(new Blob(['stl']))
    useDocumentStore.setState({
      objects: { a: cube('a'), b: cube('b') },
      operations: [],
      historyIndex: 0,
      fileName: null,
    })
    useEconomyStore.setState({ tokens: 100, lastExportHash: null, todayExportHashes: [], todayCashbacks: 0 })

    useDocumentStore.getState().exportStl()

    expect(h.exportToStl).toHaveBeenCalledTimes(1)
    expect(h.downloadStlBlob).toHaveBeenCalledTimes(1)
    // Кэшбэк начислен — токены выросли
    expect(useEconomyStore.getState().tokens).toBeGreaterThan(100)
    expect(useEconomyStore.getState().todayCashbacks).toBe(1)
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

    useDocumentStore.getState().exportStl()

    // Экспорт не состоялся — кэшбэк НЕ начислен, файл не скачан
    expect(h.downloadStlBlob).not.toHaveBeenCalled()
    expect(useEconomyStore.getState().tokens).toBe(100)
    expect(useEconomyStore.getState().todayCashbacks).toBe(0)
  })
})
