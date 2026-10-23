// ============================================================
// Unit tests — фолбэк baked-геометрии в rebuildFromHistory (FIX UB-0)
//
// Воркер может НЕ вернуть меш для import_mesh: non-manifold STL → cache=null,
// или меши сверх защитных размеров → skip. Без фолбэка импортированная
// геометрия исчезала после загрузки проекта/.doodle (путь undo/redo тот же).
//
// Воркер моканут — тесты не требуют WASM.
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../csg/worker-client', () => ({
  workerRebuildScene: vi.fn(),
}))

import { workerRebuildScene } from '../csg/worker-client'
import { rebuildFromHistory } from './rebuild'
import type { ImportMeshOperation, TinkerCraftOperation } from '../csg/types'

const T = { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 }

/** Импорт «треугольной пластины» из 1 треугольника. */
function makeImport(id: string, name = 'деталь.stl'): ImportMeshOperation {
  return {
    type: 'import_mesh',
    id,
    name,
    color: '#f9e2af',
    transform: { ...T, x: 25 },
    vertices: new Float32Array([0, 0, 0, 10, 0, 0, 0, 10, 0]),
    indices: new Uint32Array([0, 1, 2]),
  }
}

const mockedRebuild = vi.mocked(workerRebuildScene)

beforeEach(() => {
  mockedRebuild.mockReset()
})

describe('rebuildFromHistory — baked import_mesh (UB-0)', () => {
  it('возвращает геометрию из операции, если воркер её не вернул', async () => {
    // Воркер ответил пусто (non-manifold → cache=null либо skip по размеру)
    mockedRebuild.mockResolvedValue({ results: [], ms: 0 })

    const ops: TinkerCraftOperation[] = [makeImport('imp_1')]
    const objects = await rebuildFromHistory(ops)

    expect(objects['imp_1']).toBeDefined()
    expect(objects['imp_1'].vertices).toHaveLength(9)
    expect(objects['imp_1'].indices).toHaveLength(3)
    // FIX (8.5.2.5): фолбэк центрирует вершины по центроидy (для незамкнутой
    // пластины из 1 треугольника — площадной центроид (10/3, 10/3, 0)),
    // а смещение уходит в pivot. world = pivot + vertex == прежние координаты.
    const com = 10 / 3
    const expectedVerts = [0 - com, 0 - com, 0, 10 - com, 0 - com, 0, 0 - com, 10 - com, 0]
    expectedVerts.forEach((v, i) => expect(objects['imp_1'].vertices[i]).toBeCloseTo(v, 5))
    expect(objects['imp_1'].shapeType).toBe('import_mesh')
    // Позиция = transform операции (25) + центроид меша (10/3) —
    // вершины в origin, world-позиция сохранена
    expect(objects['imp_1'].transform.x).toBeCloseTo(25 + com, 5)
    expect(objects['imp_1'].transform.y).toBeCloseTo(0 + com, 5)
    expect(objects['imp_1'].name).toBe('деталь.stl')
  })

  it('не дублирует объект, если воркер его вернул', async () => {
    mockedRebuild.mockResolvedValue({
      results: [{
        objId: 'imp_1',
        vertices: new Float32Array([1, 1, 1, 2, 1, 1, 1, 2, 1]),
        indices: new Uint32Array([0, 1, 2]),
        normals: null,
        tris: 1,
        ms: 0,
      }],
      ms: 0,
    })

    const objects = await rebuildFromHistory([makeImport('imp_1')])

    expect(Object.keys(objects)).toHaveLength(1)
    // Приоритет у ответа воркера (FIX 8.5.2.5: он возвращает origin-центрированные
    // вершины + centerOffset; mock без centerOffset → вершины берутся как есть)
    expect(Array.from(objects['imp_1'].vertices)).toEqual([1, 1, 1, 2, 1, 1, 1, 2, 1])
  })

  it('пропускает битые меши (слишком короткие вершины/индексы)', async () => {
    mockedRebuild.mockResolvedValue({ results: [], ms: 0 })
    const broken = makeImport('imp_bad')
    broken.vertices = new Float32Array([0, 0, 0]) // < 9 → не меш
    broken.indices = new Uint32Array([0, 1, 2])

    const objects = await rebuildFromHistory([broken])

    expect(objects['imp_bad']).toBeUndefined()
  })

  it('не выдумывает объект, которого нет в meta (например, после delete)', async () => {
    mockedRebuild.mockResolvedValue({ results: [], ms: 0 })
    const ops: TinkerCraftOperation[] = [makeImport('imp_1'), { type: 'delete', ids: ['imp_1'] }]

    const objects = await rebuildFromHistory(ops)

    expect(objects['imp_1']).toBeUndefined()
  })
})
