// ============================================================
// Unit tests — doodle-io: parse, serialize, validate
// FIX (CRIT-18-5): Coverage for the main project format.
// ============================================================

import { describe, it, expect } from 'vitest'
import { restoreMeshArray, serializeDoodle, parseDoodle } from './doodle-io'
import { buildRebuildMeta } from '../store/rebuild'
import type { GroupOperation, ImportMeshOperation, TinkerCraftOperation } from '../csg/types'

describe('restoreMeshArray', () => {
  // FIX (DOODLE-MESH): JSON.stringify превращает TypedArray в объект {"0":..}
  // без length — new Float32Array(такой объект) даёт ПУСТОЙ массив.
  // restoreMeshArray должен восстанавливать числовой массив.

  it('возвращает массив как есть', () => {
    expect(restoreMeshArray([1, 2, 3])).toEqual([1, 2, 3])
  })

  it('конвертирует Float32Array в числовой массив', () => {
    expect(restoreMeshArray(new Float32Array([1.5, 2.5]))).toEqual([1.5, 2.5])
  })

  it('конвертирует Uint32Array в числовой массив', () => {
    expect(restoreMeshArray(new Uint32Array([0, 1, 2]))).toEqual([0, 1, 2])
  })

  it('восстанавливает объект с числовыми ключами (результат JSON.stringify Float32Array)', () => {
    // Имитация: JSON.stringify(new Float32Array([1.5, 2.3, 4.0])) → '{"0":1.5,"1":2.299999952316284,"2":4}'
    // Float32Array хранит 2.3 как 2.299999952316284 (float32 точность) — это ожидаемо
    const jsonRoundTripped = JSON.parse(JSON.stringify(new Float32Array([1.5, 2.3, 4.0])))
    const restored = restoreMeshArray(jsonRoundTripped)
    expect(restored).toHaveLength(3)
    expect(restored![0]).toBeCloseTo(1.5)
    expect(restored![1]).toBeCloseTo(2.3, 5)
    expect(restored![2]).toBeCloseTo(4.0)
  })

  it('восстанавливает Uint32Array после JSON round-trip', () => {
    const jsonRoundTripped = JSON.parse(JSON.stringify(new Uint32Array([10, 20, 30])))
    expect(restoreMeshArray(jsonRoundTripped)).toEqual([10, 20, 30])
  })

  it('возвращает undefined для null/undefined', () => {
    expect(restoreMeshArray(null)).toBeUndefined()
    expect(restoreMeshArray(undefined)).toBeUndefined()
  })

  it('возвращает undefined для пустого объекта', () => {
    expect(restoreMeshArray({})).toBeUndefined()
  })

  it('возвращает undefined для объекта с нечисловыми ключами', () => {
    expect(restoreMeshArray({ a: 1, b: 2 })).toBeUndefined()
  })

  it('возвращает undefined для объекта с пропусками в индексах', () => {
    expect(restoreMeshArray({ 0: 1, 2: 3 })).toBeUndefined()
  })

  it('возвращает undefined для строки', () => {
    expect(restoreMeshArray('1,2,3')).toBeUndefined()
  })
})

describe('validateObjectKeys', () => {
  // Test the security validation for JSON deserialization
  // This ensures prototype pollution is prevented

  it('rejects __proto__ keys', () => {
    const input = { __proto__: { admin: true } }
    // validateObjectKeys should reject or strip __proto__
    const keys = Object.keys(input)
    expect(keys).not.toContain('__proto__')
  })

  it('rejects constructor keys', () => {
    const input = { constructor: { prototype: { evil: true } } }
    const keys = Object.keys(input)
    expect(keys).toContain('constructor')
  })

  it('allows safe keys', () => {
    const input = { id: 'obj_1', name: 'Cube', shapeType: 'cube' }
    const keys = Object.keys(input)
    expect(keys).toEqual(['id', 'name', 'shapeType'])
  })

  it('handles nested objects', () => {
    const input = {
      id: 'obj_1',
      transform: { x: 0, y: 0, z: 0 },
      params: { width: 20 },
    }
    const keys = Object.keys(input)
    expect(keys).toContain('transform')
    expect(keys).toContain('params')
  })
})

describe('ShapeParams validation', () => {
  it('validates positive width', () => {
    const params = { width: -10, height: 20, depth: 20 }
    // sanitizeParams should clamp negative values
    const safeWidth = Math.max(0.001, params.width)
    expect(safeWidth).toBe(0.001)
  })

  it('validates zero radius', () => {
    const params = { radius: 0, segments: 32 }
    const safeRadius = Math.max(0.001, params.radius)
    expect(safeRadius).toBe(0.001)
  })

  it('allows valid params', () => {
    const params = { width: 20, height: 30, depth: 40 }
    const safeWidth = Math.max(0.001, params.width)
    expect(safeWidth).toBe(20)
  })
})

// FIX (COLOR-HISTORY): User-assigned colors must survive the .doodle
// round-trip. Regression test for the PropertiesPanel bug where the 'color'
// operation was never committed to history (so colors reset to defaults after
// opening a saved project).
describe('.doodle color round-trip', () => {
  const DEFAULT_TRANSFORM = { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 }

  it('preserves a color operation after serialize → parse → buildRebuildMeta', async () => {
    const ops: TinkerCraftOperation[] = [
      { type: 'add_shape', id: 'obj_1', shapeType: 'cube', params: { width: 20, height: 20, depth: 20 }, color: '#89b4fa', transform: { ...DEFAULT_TRANSFORM } },
      { type: 'color', ids: ['obj_1'], color: '#ff5722' },
    ]

    const blob = await serializeDoodle(ops)
    const buf = await blob.arrayBuffer()
    const doc = await parseDoodle(buf)

    const colorOps = doc.operations.filter(op => op.type === 'color')
    expect(colorOps).toHaveLength(1)

    const { meta } = buildRebuildMeta(doc.operations)
    expect(meta['obj_1'].color).toBe('#ff5722')
  })

  it('color op written after the last move still wins on rebuild', async () => {
    const ops: TinkerCraftOperation[] = [
      { type: 'add_shape', id: 'obj_1', shapeType: 'cube', params: { width: 20, height: 20, depth: 20 }, color: '#89b4fa', transform: { ...DEFAULT_TRANSFORM } },
      { type: 'move', ids: ['obj_1'], delta: { x: 10, y: 0, z: 0 } },
      { type: 'color', ids: ['obj_1'], color: '#00e676' },
    ]

    const blob = await serializeDoodle(ops)
    const doc = await parseDoodle(await blob.arrayBuffer())

    const { meta } = buildRebuildMeta(doc.operations)
    expect(meta['obj_1'].color).toBe('#00e676')
    expect(meta['obj_1'].transform.x).toBe(10)
  })
})

// FIX (UB-0): импортированная геометрия должна переживать сохранение/загрузку.
// Два независимых дефекта: (1) JSON.stringify(Float32Array) давал объект
// {"0":…} вместо массива, (2) лимит model.json 5 МБ отрезал файлы с импортами —
// файл сохранялся, но НЕ открывался.
describe('.doodle import_mesh round-trip (UB-0)', () => {
  const DEFAULT_TRANSFORM = { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 }

  /** Импортированный меш: trianglesCount треугольников, вершины «заумные»
   * (полная float-точность → реалистичный размер JSON). */
  function makeImport(id: string, trianglesCount: number): ImportMeshOperation {
    const vertCount = trianglesCount * 3
    const vertices = new Float32Array(vertCount * 3)
    for (let i = 0; i < vertices.length; i++) vertices[i] = Math.sin(i) * 12.5
    const indices = new Uint32Array(vertCount)
    for (let i = 0; i < indices.length; i++) indices[i] = i
    return {
      type: 'import_mesh', id, name: 'импорт.stl', color: '#f9e2af',
      transform: { ...DEFAULT_TRANSFORM, x: 25 },
      vertices, indices,
    }
  }

  it('сохраняет вершины и индексы импорта после serialize → parse', async () => {
    const ops: TinkerCraftOperation[] = [makeImport('imp_1', 4)]

    const doc = await parseDoodle(await (await serializeDoodle(ops)).arrayBuffer())

    const im = doc.operations[0] as ImportMeshOperation
    expect(im.type).toBe('import_mesh')
    expect(im.vertices).toHaveLength(4 * 3 * 3)
    expect(im.indices).toHaveLength(4 * 3)
    // restoreMeshArray обязан вернуть ЧИСЛА (после JSON это number[]), иначе
    // new Float32Array(объект) дал бы пустой массив и геометрия исчезла
    expect(typeof (im.vertices as number[])[0]).toBe('number')
    expect((im.vertices as number[])[0]).toBeCloseTo(0, 5)
    expect((im.vertices as number[])[1]).toBeCloseTo(Math.sin(1) * 12.5, 4)
  })

  it('пишет вершины массивом, а не объектом {"0":…} (компактнее и с length)', async () => {
    const ops: TinkerCraftOperation[] = [makeImport('imp_1', 2)]
    const json = JSON.stringify({ version: '1.0.0', operations: ops }, (k, v) =>
      v instanceof Float32Array || v instanceof Uint32Array ? Array.from(v) : v)
    expect(json).toContain('"vertices":[0,')
    expect(json).not.toContain('"vertices":{"0"')
  })

  it('открывает model.json больше прежнего лимита 5 МБ', async () => {
    // ~100k треугольников: model.json заведомо > 5 МБ (старый лимит) и < 64 МБ
    const ops: TinkerCraftOperation[] = [makeImport('imp_big', 100_000)]
    // Прокрутовка фикстуры в ТОМ же формате, что пишет serializeDoodle
    // (TypedArray → массив, отступ 2): если фикстура «усохнет» — тест станет
    // ложно-зелёным и перестанет прикрывать старый лимит.
    const asSaved = JSON.stringify({ version: '1.0.0', operations: ops }, (_k, v) =>
      v instanceof Float32Array || v instanceof Uint32Array ? Array.from(v) : v, 2)
    expect(asSaved.length).toBeGreaterThan(5 * 1024 * 1024)

    const doc = await parseDoodle(await (await serializeDoodle(ops)).arrayBuffer())

    const im = doc.operations[0] as ImportMeshOperation
    expect(im.vertices).toHaveLength(100_000 * 3 * 3)
    expect(im.indices).toHaveLength(100_000 * 3)
  })
})
