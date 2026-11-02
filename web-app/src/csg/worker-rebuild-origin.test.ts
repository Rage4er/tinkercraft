// ============================================================
// handleRebuildScene — vertices в origin (COM)
// Фаза 8.5, Этап 8.5.2.5: rebuild НЕ запекает spawn в вершины
// ============================================================
//
// Инвариант (ARCHITECTURE_RENDER.md §1):
// - SceneObject.vertices — ВСЕГДА в origin (COM ≈ 0)
// - transform.position — pivot (spawn; для import + COM исходного меша)
// - world = pivot + vertex — НЕ меняется после фикса (centerOffset
//   прибавляется к pivot в store/rebuild.ts)
//
// Транспорт Worker заменён in-process мостом (worker-bridge.ts) —
// настоящие worker-handlers + настоящий manifold-3d WASM.

import { describe, it, expect, afterEach, vi } from 'vitest'

// store/rebuild.ts импортирует worker-client (Web Worker) — в jsdom транспорта
// нет, подменяем тем же in-process мостом, что и через bridge.
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

import { centerMassAtOrigin } from './geometry-utils'
import { workerBuildShape, workerRebuildScene, workerClearAll } from '../__tests__/worker-bridge'
import { rebuildFromHistory } from '../store/rebuild'

const IDENTITY = { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 }

/** COM вершин без мутации (копия перед centerMassAtOrigin). */
function comOf(vertices: Float32Array, indices: Uint32Array): { cx: number; cy: number; cz: number } {
  const verts = new Float32Array(vertices)
  const tris = new Uint32Array(indices)
  return centerMassAtOrigin(verts, tris)
}

/** Cuboid-куб (manifold) со сдвигом — used as «сырой STL» для import_mesh. */
async function offsetBoxMesh(dx: number, dy: number, dz: number) {
  const src = await workerBuildShape('rebuild-origin-src', 'cube', { width: 10, height: 10, depth: 10 } as never, IDENTITY)
  const raw = new Float32Array(src.vertices)
  for (let i = 0; i < raw.length; i += 3) {
    raw[i] += dx
    raw[i + 1] += dy
    raw[i + 2] += dz
  }
  return { raw, rawIdx: new Uint32Array(src.indices) }
}

describe('handleRebuildScene — vertices в origin (Этап 8.5.2.5)', () => {
  afterEach(async () => {
    await workerClearAll()
  })

  it('add_shape cube: vertices в origin (COM ≈ 0), centerOffset ≈ 0', async () => {
    const ops = [
      { type: 'add_shape', id: 'cube_1', shapeType: 'cube', params: { width: 20, height: 20, depth: 20 }, color: '#fff', transform: { ...IDENTITY, x: 25 } },
    ]
    const { results } = await workerRebuildScene(ops)
    const m = results.find(r => r.objId === 'cube_1')!
    expect(m, 'cube_1 in results').toBeTruthy()

    const com = comOf(m.vertices, m.indices)
    expect(Math.abs(com.cx)).toBeLessThan(1e-4)
    expect(Math.abs(com.cy)).toBeLessThan(1e-4)
    expect(Math.abs(com.cz)).toBeLessThan(1e-4)

    // spawn НЕ запечён: bbox центра ≈ 0, не 25
    let minX = Infinity, maxX = -Infinity
    for (let i = 0; i < m.vertices.length; i += 3) {
      minX = Math.min(minX, m.vertices[i])
      maxX = Math.max(maxX, m.vertices[i])
    }
    expect(Math.abs((minX + maxX) / 2)).toBeLessThan(1e-4)

    // centerOffset ≈ 0 — pivot останется spawn (25) без поправок
    expect(Math.abs(m.centerOffset?.x ?? 0)).toBeLessThan(1e-4)
    expect(Math.abs(m.centerOffset?.y ?? 0)).toBeLessThan(1e-4)
    expect(Math.abs(m.centerOffset?.z ?? 0)).toBeLessThan(1e-4)
  })

  it('add_shape cone: COM ≈ 0 (без h/4-смещения), centerOffset ≈ 0', async () => {
    const ops = [
      { type: 'add_shape', id: 'cone_1', shapeType: 'cone', params: { radiusTop: 0, radiusBottom: 10, height: 20, segments: 32 }, color: '#fff', transform: { ...IDENTITY, x: 25 } },
    ]
    const { results } = await workerRebuildScene(ops)
    const m = results.find(r => r.objId === 'cone_1')!
    expect(m, 'cone_1 in results').toBeTruthy()

    const com = comOf(m.vertices, m.indices)
    expect(Math.abs(com.cx)).toBeLessThan(1e-4)
    expect(Math.abs(com.cy)).toBeLessThan(1e-4)
    expect(Math.abs(com.cz)).toBeLessThan(1e-4)
    expect(Math.abs(m.centerOffset?.x ?? 0)).toBeLessThan(1e-4)
  })

  it('add_shape + move: vertices в origin, spawn+delta не в вершинах', async () => {
    const ops = [
      { type: 'add_shape', id: 'cube_1', shapeType: 'cube', params: { width: 20, height: 20, depth: 20 }, color: '#fff', transform: { ...IDENTITY, x: 25 } },
      { type: 'move', ids: ['cube_1'], delta: { x: 10, y: 5, z: 0 } },
    ]
    const { results } = await workerRebuildScene(ops)
    const m = results.find(r => r.objId === 'cube_1')!
    expect(m, 'cube_1 in results').toBeTruthy()

    const com = comOf(m.vertices, m.indices)
    expect(Math.abs(com.cx)).toBeLessThan(1e-4)
    expect(Math.abs(com.cy)).toBeLessThan(1e-4)
    expect(Math.abs(com.cz)).toBeLessThan(1e-4)
  })

  it('import_mesh: vertices в origin (COM ≈ 0), centerOffset = COM исходного меша', async () => {
    const { raw, rawIdx } = await offsetBoxMesh(100, 200, 300)
    const ops = [
      { type: 'import_mesh', id: 'stl_1', name: 'box.stl', color: '#fff', transform: { ...IDENTITY }, vertices: raw, indices: rawIdx },
    ]
    const { results } = await workerRebuildScene(ops)
    const m = results.find(r => r.objId === 'stl_1')!
    expect(m, 'stl_1 in results').toBeTruthy()

    // vertices в origin
    const com = comOf(m.vertices, m.indices)
    expect(Math.abs(com.cx)).toBeLessThan(1e-4)
    expect(Math.abs(com.cy)).toBeLessThan(1e-4)
    expect(Math.abs(com.cz)).toBeLessThan(1e-4)

    // centerOffset = COM исходного STL (куб 10³ в (100,200,300) → COM ровно туда)
    expect(m.centerOffset?.x).toBeCloseTo(100, 4)
    expect(m.centerOffset?.y).toBeCloseTo(200, 4)
    expect(m.centerOffset?.z).toBeCloseTo(300, 4)

    // world-инвариант: v_centered + COM == v_raw (позиция не изменилась)
    for (let i = 0; i < m.vertices.length; i += 3) {
      expect(m.vertices[i] + (m.centerOffset?.x ?? 0)).toBeCloseTo(raw[i], 3)
      expect(m.vertices[i + 1] + (m.centerOffset?.y ?? 0)).toBeCloseTo(raw[i + 1], 3)
      expect(m.vertices[i + 2] + (m.centerOffset?.z ?? 0)).toBeCloseTo(raw[i + 2], 3)
    }
  })

  it('group (CSG): не центрируется — vertices == op.resultVertices, centerOffset нет', async () => {
    // Простейшие pivot-центрированные «CSG»-вершины (куб 10³ в origin)
    const src = await workerBuildShape('grp-src', 'cube', { width: 10, height: 10, depth: 10 } as never, IDENTITY)
    const resultVertices = Array.from(src.vertices)
    const resultIndices = Array.from(src.indices)
    const ops = [
      { type: 'group', ids: [], resultId: 'csg_1', resultVertices, resultIndices, resultCenter: { x: 0, y: 0, z: 0 } },
    ]
    const { results } = await workerRebuildScene(ops)
    const m = results.find(r => r.objId === 'csg_1')!
    expect(m, 'csg_1 in results').toBeTruthy()

    // Pivot-центрированная конвенция §5.4 сохранена: вершины == op.resultVertices
    for (let i = 0; i < m.vertices.length; i++) {
      expect(m.vertices[i]).toBeCloseTo(resultVertices[i], 6)
    }
    // CSG не получает centerOffset (store сам решает pivot)
    expect(m.centerOffset).toBeUndefined()
  })

  // ------------------------------------------------------------------
  // Главный инвариант этапа: world-позиция из rebuild == world-позиция live-объекта.
  // live: vertices = origin, pivot = spawn  → world = spawn + v
  // rebuild: vertices = origin, pivot = spawn + COM(≈0) → тот же world
  // ------------------------------------------------------------------
  it.each(['cube', 'cone'])('%s: rebuild world == live world (spawn не удваивается)', async (shapeType) => {
    const spawn = { ...IDENTITY, x: 25, y: 3 }
    const params = shapeType === 'cube'
      ? { width: 20, height: 20, depth: 20 }
      : { radiusTop: 0, radiusBottom: 10, height: 20, segments: 32 }

    // 1) live-путь (handleBuildShape, Этап 8.5.1): vertices в origin
    const live = await workerBuildShape(`live-${shapeType}`, shapeType as never, params as never, spawn)
    const liveWorld = new Float32Array(live.vertices.length)
    for (let i = 0; i < live.vertices.length; i += 3) {
      liveWorld[i] = live.vertices[i] + spawn.x
      liveWorld[i + 1] = live.vertices[i + 1] + spawn.y
      liveWorld[i + 2] = live.vertices[i + 2] + spawn.z
    }

    // 2) rebuild-путь (тот же objId НЕ переиспользуем — воркер очищает кэш сам)
    const ops = [
      { type: 'add_shape', id: `rb-${shapeType}`, shapeType, params, color: '#fff', transform: spawn },
    ]
    const { results } = await workerRebuildScene(ops)
    const m = results.find(r => r.objId === `rb-${shapeType}`)!
    expect(m, `${shapeType} in results`).toBeTruthy()

    // store/rebuild.ts: pivot = spawn + centerOffset
    const off = m.centerOffset ?? { x: 0, y: 0, z: 0 }
    const rbWorld = new Float32Array(m.vertices.length)
    for (let i = 0; i < m.vertices.length; i += 3) {
      rbWorld[i] = m.vertices[i] + spawn.x + off.x
      rbWorld[i + 1] = m.vertices[i + 1] + spawn.y + off.y
      rbWorld[i + 2] = m.vertices[i + 2] + spawn.z + off.z
    }

    // Вершины идут в одном и том же порядке (тот же buildPrimitive) — поэлементное сравнение
    expect(rbWorld.length).toBe(liveWorld.length)
    for (let i = 0; i < rbWorld.length; i++) {
      expect(rbWorld[i]).toBeCloseTo(liveWorld[i], 4)
    }
  })
})

describe('rebuildFromHistory — transform = pivot + centerOffset (store-контракт 8.5.3)', () => {
  afterEach(async () => {
    await workerClearAll()
  })
  it('import_mesh: obj COM ≈ 0, obj.transform = COM исходного меша, world совпадает', async () => {
    const { raw, rawIdx } = await offsetBoxMesh(100, 200, 300)
    const ops = [
      { type: 'import_mesh', id: 'stl_1', name: 'box.stl', color: '#fff', transform: { ...IDENTITY }, vertices: raw, indices: rawIdx },
    ] as never[]
    const objects = await rebuildFromHistory(ops)
    const obj = objects['stl_1']
    expect(obj, 'import object restored').toBeTruthy()

    const com = comOf(obj.vertices, obj.indices)
    expect(Math.abs(com.cx)).toBeLessThan(1e-4)
    expect(Math.abs(com.cy)).toBeLessThan(1e-4)
    expect(Math.abs(com.cz)).toBeLessThan(1e-4)

    // pivot = COM исходного меша (8.5.2.5-конвенция)
    expect(obj.transform.x).toBeCloseTo(100, 4)
    expect(obj.transform.y).toBeCloseTo(200, 4)
    expect(obj.transform.z).toBeCloseTo(300, 4)

    // world = pivot + vertex == исходные сырые координаты STL
    for (let i = 0; i < obj.vertices.length; i += 3) {
      expect(obj.vertices[i] + obj.transform.x).toBeCloseTo(raw[i], 3)
      expect(obj.vertices[i + 1] + obj.transform.y).toBeCloseTo(raw[i + 1], 3)
      expect(obj.vertices[i + 2] + obj.transform.z).toBeCloseTo(raw[i + 2], 3)
    }
  })

  it('add_shape: obj COM ≈ 0, transform = spawn (без двойного spawn)', async () => {
    const ops = [
      { type: 'add_shape', id: 'cube_1', shapeType: 'cube', params: { width: 20, height: 20, depth: 20 }, color: '#fff', transform: { ...IDENTITY, x: 25 } },
    ] as never[]
    const objects = await rebuildFromHistory(ops)
    const obj = objects['cube_1']
    expect(obj, 'cube object restored').toBeTruthy()

    const com = comOf(obj.vertices, obj.indices)
    expect(Math.abs(com.cx)).toBeLessThan(1e-4)
    expect(Math.abs(com.cy)).toBeLessThan(1e-4)
    expect(Math.abs(com.cz)).toBeLessThan(1e-4)

    expect(obj.transform.x).toBeCloseTo(25, 6)
    expect(obj.transform.y).toBeCloseTo(0, 6)
  })
})
