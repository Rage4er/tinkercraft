// ============================================================
// legacy-fillet.test.ts — миграция старых проектов со скруглением (remove-fillet)
// ============================================================

import { describe, it, expect } from 'vitest'
import { migrateLegacyFillet } from './legacy-fillet'
import type { TinkerCraftOperation, SceneObject, TransformNR, EditStepOperation } from '../csg/types'

const T: TransformNR = { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 }
const cube = (id: string, extra: Record<string, number> = {}): TinkerCraftOperation =>
  ({ type: 'add_shape', id, shapeType: 'cube', params: { width: 10, height: 10, depth: 10, ...extra }, color: '#fff', transform: T })

describe('migrateLegacyFillet', () => {
  it('без скругления — история та же (тот же массив), changed = false', () => {
    const ops = [cube('a'), { type: 'move', ids: ['a'], delta: { x: 1, y: 0, z: 0 } } as TinkerCraftOperation]
    const m = migrateLegacyFillet(ops)
    expect(m.changed).toBe(false)
    expect(m.operations).toBe(ops)
    expect(m.remapIndex(2)).toBe(2)
  })

  it('шаги fillet вырезаются, filletRadius снимается из params операций', () => {
    const ops: TinkerCraftOperation[] = [
      cube('a'),
      { type: 'fillet', id: 'a', radius: 2 },
      { type: 'resize_dims', id: 'a', params: { width: 12, height: 10, depth: 10, filletRadius: 2 } as never },
      cube('b', { filletRadius: 3 }),                         // paste скруглённого куба
      { type: 'edit_child_params', rootId: 'c', nodeId: 'a', params: { width: 14, filletRadius: 2 } as never, resultVertices: [], resultIndices: [] },
    ]
    const m = migrateLegacyFillet(ops)
    expect(m.changed).toBe(true)
    expect(m.removedSteps).toBe(1)
    expect(m.operations.map((o) => o.type)).toEqual(['add_shape', 'resize_dims', 'add_shape', 'edit_child_params'])
    for (const op of m.operations) {
      if ('params' in op) expect(op.params).not.toHaveProperty('filletRadius')
    }
    expect((m.operations[1] as { params: object }).params).toEqual({ width: 12, height: 10, depth: 10 })
    // вход не мутирован
    expect(ops[1].type).toBe('fillet')
    expect((ops[2] as { params: object }).params).toHaveProperty('filletRadius')
    // индекс истории: из 5 шагов до конца остались 4, до шага 2 — 1
    expect(m.remapIndex(5)).toBe(4)
    expect(m.remapIndex(2)).toBe(1)
  })

  it('edit_step перенумеровывается; правка вырезанного шага выбрасывается', () => {
    const ops: TinkerCraftOperation[] = [
      cube('a'),                                                            // 0
      { type: 'fillet', id: 'a', radius: 2 },                               // 1 — вырезается
      { type: 'move', ids: ['a'], delta: { x: 1, y: 0, z: 0 } },            // 2 → 1
      cube('b'),                                                            // 3 → 2
      { type: 'group', ids: ['a', 'b'], resultId: 'c' },                    // 4 → 3
      // правка шага fillet (устаревший формат 9.5) — выбрасывается
      { type: 'edit_step', stepIndex: 1, stepFingerprint: { type: 'fillet', targetId: 'a' },
        patch: { kind: 'fillet', radius: 3 } as never, replacements: [] } as EditStepOperation,  // 5 → −
      { type: 'edit_step', stepIndex: 2, stepFingerprint: { type: 'move', targetId: 'a' },
        patch: { kind: 'move', delta: { x: 4, y: 0, z: 0 } },
        replacements: [{ stepIndex: 4, kind: 'group', resultVertices: [1] }] } as EditStepOperation, // 6 → 4
    ]
    const m = migrateLegacyFillet(ops)
    expect(m.operations).toHaveLength(5)
    const e = m.operations[4] as EditStepOperation
    expect(e.type).toBe('edit_step')
    expect(e.stepIndex).toBe(1)
    expect(e.replacements[0].stepIndex).toBe(3)
    expect(m.remapIndex(7)).toBe(5)
  })

  it('объекты: filletRadius снимается, changed = true даже без шагов fillet', () => {
    const objects = {
      a: { id: 'a', shapeType: 'cube', params: { width: 10, filletRadius: 2 }, color: '#fff', transform: T, visible: true, locked: false, vertices: new Float32Array(), indices: new Uint32Array() } as unknown as SceneObject,
      b: { id: 'b', shapeType: 'sphere', params: { radius: 5 }, color: '#fff', transform: T, visible: true, locked: false, vertices: new Float32Array(), indices: new Uint32Array() } as SceneObject,
    }
    const m = migrateLegacyFillet([cube('a'), cube('b')], objects)
    expect(m.changed).toBe(true)
    expect(m.objects!.a.params).toEqual({ width: 10 })
    expect(m.objects!.b).toBe(objects.b)
  })
})
