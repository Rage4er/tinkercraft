// ============================================================
// Фаза 8.5, Этап 8.5.2 — addShape: spawn в transform, НЕ в vertices
// ============================================================
//
// Инвариант (ARCHITECTURE_RENDER.md §1):
// - SceneObject.vertices — ВСЕГДА в origin (COM ≈ 0)
// - SceneObject.transform.position — spawn (idx * OBJECT_SPACING)
// - Spawn НЕ должен запекаться в вершины
//
// Транспорт Worker заменён in-process мостом (worker-bridge.ts) —
// настоящие worker-handlers + настоящий manifold-3d WASM.

import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../csg/worker-client', async () => {
  const bridge = await import('../__tests__/worker-bridge')
  return {
    workerBuildShape: bridge.workerBuildShape,
    workerApplyFillet: bridge.workerApplyFillet,
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

import { useDocumentStore } from './document-store'
import { clearTree } from '../csg/history-tree'
import { centerMassAtOrigin } from '../csg/geometry-utils'
import { OBJECT_SPACING } from '../constants'

/** COM вершин без мутации (копия перед centerMassAtOrigin). */
function comOf(vertices: Float32Array, indices: Uint32Array): { cx: number; cy: number; cz: number } {
  const verts = new Float32Array(vertices)
  const tris = new Uint32Array(indices)
  return centerMassAtOrigin(verts, tris)
}

describe('addShape — spawn в transform, не в vertices (Этап 8.5.2)', () => {
  beforeEach(() => {
    clearTree()
    useDocumentStore.setState({ objects: {}, operations: [], historyIndex: 0, selectedIds: [], busy: false })
  })

  it('куб: vertices в origin (COM ≈ 0), transform.position = spawn', async () => {
    await useDocumentStore.getState().addShape('cube', { width: 20, height: 20, depth: 20 })
    const state = useDocumentStore.getState()
    const ids = Object.keys(state.objects)
    expect(ids).toHaveLength(1)
    const obj = state.objects[ids[0]]

    // vertices в origin: COM ≈ (0,0,0)
    const com = comOf(obj.vertices, obj.indices)
    expect(Math.abs(com.cx)).toBeLessThan(1e-4)
    expect(Math.abs(com.cy)).toBeLessThan(1e-4)
    expect(Math.abs(com.cz)).toBeLessThan(1e-4)

    // первый объект: spawn x = 0 * OBJECT_SPACING = 0
    expect(obj.transform.x).toBe(0 * OBJECT_SPACING)
    expect(obj.transform.y).toBe(0)
    expect(obj.transform.z).toBe(0)
  })

  it('второй объект: spawn x = OBJECT_SPACING в transform, vertices всё ещё в origin', async () => {
    await useDocumentStore.getState().addShape('cube', { width: 20, height: 20, depth: 20 })
    await useDocumentStore.getState().addShape('cube', { width: 20, height: 20, depth: 20 })
    const state = useDocumentStore.getState()
    const ids = Object.keys(state.objects)
    expect(ids).toHaveLength(2)
    const second = state.objects[ids[1]]

    // spawn применён К ТРАНСФОРМУ: x = 1 * 25 = 25
    expect(second.transform.x).toBe(1 * OBJECT_SPACING)

    // но НЕ к вершинам: COM ≈ (0,0,0) — если бы spawn запёкся, cx был бы ≈ 25
    const com = comOf(second.vertices, second.indices)
    expect(Math.abs(com.cx)).toBeLessThan(1e-4)
    expect(Math.abs(com.cy)).toBeLessThan(1e-4)
    expect(Math.abs(com.cz)).toBeLessThan(1e-4)

    // bbox вершин тоже в origin: центр bbox x ≈ 0, не 25
    let minX = Infinity, maxX = -Infinity
    for (let i = 0; i < second.vertices.length; i += 3) {
      minX = Math.min(minX, second.vertices[i])
      maxX = Math.max(maxX, second.vertices[i])
    }
    expect(Math.abs((minX + maxX) / 2)).toBeLessThan(1e-4)
  })

  it('призма sides=3: vertices в origin (COM ≈ 0), spawn только в transform', async () => {
    await useDocumentStore.getState().addShape('cube', { width: 20, height: 20, depth: 20 })
    await useDocumentStore.getState().addShape('prism', { radius: 12, height: 20, sides: 3 })
    const state = useDocumentStore.getState()
    const ids = Object.keys(state.objects)
    const prism = state.objects[ids[1]]
    expect(prism.shapeType).toBe('prism')

    expect(prism.transform.x).toBe(1 * OBJECT_SPACING)

    const com = comOf(prism.vertices, prism.indices)
    expect(Math.abs(com.cx)).toBeLessThan(1e-4)
    expect(Math.abs(com.cy)).toBeLessThan(1e-4)
    expect(Math.abs(com.cz)).toBeLessThan(1e-4)
  })

  it('конус: COM-центрирование (centerManifoldToCOM) через полный путь store', async () => {
    await useDocumentStore.getState().addShape('cube', { width: 20, height: 20, depth: 20 })
    await useDocumentStore.getState().addShape('cone', { radius: 10, height: 24, segments: 32 })
    const state = useDocumentStore.getState()
    const ids = Object.keys(state.objects)
    const cone = state.objects[ids[1]]
    expect(cone.shapeType).toBe('cone')

    expect(cone.transform.x).toBe(1 * OBJECT_SPACING)

    // COM конуса в origin — иначе рендер/линейка сдвинуты на h/4 = 6 мм
    const com = comOf(cone.vertices, cone.indices)
    expect(Math.abs(com.cx)).toBeLessThan(1e-4)
    expect(Math.abs(com.cy)).toBeLessThan(1e-4)
    expect(Math.abs(com.cz)).toBeLessThan(1e-4)
  })
})
