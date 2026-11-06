// ============================================================
// project-history.test.ts — Фаза 9.5.0: эффективная история (без WASM)
// ============================================================

import { describe, it, expect, beforeEach } from 'vitest'
import type {
  TinkerCraftOperation, EditStepOperation, GroupOperation, TransformNR, StepPatch, StepReplacement,
} from '../csg/types'
import {
  projectHistory, projectHistoryDetailed, effectiveOps, effectiveToRawIndex,
  stepFingerprint, applyStepPatch, applyReplacement, computeCascade, patchKindFor,
  effectivePatches, effectiveOpAt, cascadeSteps,
} from './project-history'
import { buildRebuildMeta, rebuildBuildTree } from './rebuild'
import { findCreationTransform } from './edit-child'
import { clearTree, getNode } from '../csg/history-tree'

const ID: TransformNR = { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 }
const at = (x: number, extra: Partial<TransformNR> = {}): TransformNR => ({ ...ID, x, ...extra })

const add = (id: string, x = 0): TinkerCraftOperation =>
  ({ type: 'add_shape', id, shapeType: 'cube', params: { width: 10, height: 10, depth: 10 }, color: '#fff', transform: at(x) })
const group = (a: string, b: string, resultId: string, cx = 0): GroupOperation => ({
  type: 'group', ids: [a, b], resultId, treeOperation: 'union', shapeType: 'csg', color: '#fff',
  resultVertices: [0, 0, 0, 1, 0, 0, 0, 1, 0], resultIndices: [0, 1, 2],
  resultCenter: { x: cx, y: 0, z: 0 }, resultRotation: { x: 0, y: 0, z: 0 }, resultScale: { x: 1, y: 1, z: 1 },
  originalBboxSize: { x: 1, y: 1, z: 0 },
})
function edit(
  ops: TinkerCraftOperation[], stepIndex: number, patch: StepPatch, replacements: StepReplacement[] = [],
): EditStepOperation {
  const fp = stepFingerprint(ops[stepIndex])
  if (!fp) throw new Error('шаг не редактируется')
  return { type: 'edit_step', stepIndex, stepFingerprint: fp, patch, replacements }
}

/** cube a (0) → move a +2 (1) → cube b (2) → move a +5 (3) → union a+b → c (4) */
function base(): TinkerCraftOperation[] {
  return [
    add('a'),
    { type: 'move', ids: ['a'], delta: { x: 2, y: 0, z: 0 } },
    add('b', 20),
    { type: 'move', ids: ['a'], delta: { x: 5, y: 0, z: 0 } },
    group('a', 'b', 'c', 5),
  ]
}

/** Патч move по X (шаг 1 базового сценария) */
const M = (x: number): StepPatch => ({ kind: 'move', delta: { x, y: 0, z: 0 } })
const dx = (op: TinkerCraftOperation) => (op as { delta: { x: number } }).delta.x

beforeEach(() => clearTree())

describe('projectHistory', () => {
  it('без edit_step — тождество (тот же массив) и идемпотентность', () => {
    const ops = base()
    expect(projectHistory(ops)).toBe(ops)
    const withEdit = [...ops, edit(ops, 1, M(3))]
    const once = projectHistory(withEdit)
    expect(projectHistory(once)).toBe(once)
  })

  it('подставляет patch в шаг N, выбрасывает edit_step, исходные операции не мутирует', () => {
    const ops = base()
    const raw = [...ops, edit(ops, 1, M(3))]
    const eff = projectHistory(raw)
    expect(eff).toHaveLength(ops.length)
    expect(eff.some((o) => o.type === 'edit_step')).toBe(false)
    expect(eff[1]).toEqual({ type: 'move', ids: ['a'], delta: { x: 3, y: 0, z: 0 } })
    expect(ops[1]).toEqual({ type: 'move', ids: ['a'], delta: { x: 2, y: 0, z: 0 } })
    // незатронутые шаги — те же объекты (без копирования)
    expect(eff[0]).toBe(ops[0])
    expect(eff[4]).toBe(ops[4])
  })

  it('последняя правка шага побеждает; префикс без неё (= undo) — предыдущая', () => {
    const ops = base()
    const raw = [...ops, edit(ops, 1, M(3)), edit(ops, 1, M(4))]
    expect(dx(projectHistory(raw)[1])).toBe(4)
    expect(dx(effectiveOps(raw, raw.length - 1)[1])).toBe(3)
    expect(dx(effectiveOps(raw, ops.length)[1])).toBe(2)
  })

  it('move: патч — полный набор дельт (rot/scale без значения снимаются)', () => {
    const op: TinkerCraftOperation = { type: 'move', ids: ['a'], delta: { x: 1, y: 0, z: 0 }, rotDelta: { x: 0, y: 30, z: 0 }, kind: 'rotate' }
    const p = applyStepPatch(op, { kind: 'move', delta: { x: 7, y: 0, z: 0 } })
    expect(p).toEqual({ type: 'move', ids: ['a'], delta: { x: 7, y: 0, z: 0 }, kind: 'rotate' })
    const p2 = applyStepPatch(op, { kind: 'move', delta: { x: 0, y: 0, z: 0 }, scaleDelta: { x: 2, y: 1, z: 1 } })
    expect(p2).toMatchObject({ scaleDelta: { x: 2, y: 1, z: 1 } })
    expect(p2).not.toHaveProperty('rotDelta')
  })

  it('mirror: смена плоскости; несовпадение вида патча → null', () => {
    const op: TinkerCraftOperation = { type: 'mirror', originalIds: ['a'], ids: ['a2'], plane: 'YZ' }
    expect(applyStepPatch(op, { kind: 'mirror', plane: 'XZ' })).toMatchObject({ plane: 'XZ' })
    expect(applyStepPatch(op, M(1))).toBeNull()
    expect(applyStepPatch({ type: 'fillet', id: 'a', radius: 2 }, M(1))).toBeNull()   // устаревший шаг не правится
    expect(stepFingerprint({ type: 'fillet', id: 'a', radius: 2 })).toBeNull()
    expect(patchKindFor({ type: 'group', ids: [] })).toBeNull()                  // группа без source
    expect(stepFingerprint(op)).toEqual({ type: 'mirror', targetId: 'a2' })
  })

  it('несовпадение отпечатка / индекса / вида → правка игнорируется целиком', () => {
    const ops = base()
    const good = edit(ops, 1, M(3))
    const cases: Array<[EditStepOperation, string]> = [
      [{ ...good, stepFingerprint: { type: 'move', targetId: 'zzz' } }, 'fingerprint'],
      [{ ...good, stepIndex: 99 }, 'bad_index'],
      [{ ...good, stepIndex: -1 }, 'bad_index'],
      [{ ...good, patch: { kind: 'mirror', plane: 'XY' } }, 'kind'],
      [{ ...good, replacements: [{ stepIndex: 2, kind: 'group' }] }, 'replacement'],   // шаг 2 — add_shape
      [{ ...good, replacements: [{ stepIndex: 0, kind: 'group' }] }, 'replacement'],   // выше шага N
    ]
    for (const [e, reason] of cases) {
      const r = projectHistoryDetailed([...ops, e])
      expect(r.ignored).toEqual([{ index: ops.length, reason }])
      expect(r.ops).toEqual(ops)
    }
  })

  it('edit_step не может ссылаться на шаг после себя или на другую edit_step', () => {
    const ops = base()
    const e1 = edit(ops, 1, M(3))
    const onEdit: EditStepOperation = { ...e1, stepIndex: ops.length }   // указывает на e1
    const r = projectHistoryDetailed([...ops, e1, onEdit])
    expect(r.ignored).toEqual([{ index: ops.length + 1, reason: 'bad_index' }])
    expect(dx(r.ops[1])).toBe(3)
  })

  it('гипотетическая правка: patch применён, замороженные шаги не тронуты', () => {
    const ops = base()
    const eff = projectHistory(ops, { stepIndex: 3, patch: { kind: 'move', delta: { x: 9, y: 0, z: 0 } } })
    expect(eff).not.toBe(ops)
    expect((eff[3] as { delta: { x: number } }).delta.x).toBe(9)
    expect(eff[4]).toBe(ops[4])
    const bad = projectHistoryDetailed(ops, { stepIndex: 0, patch: M(1) })   // шаг 0 — add_shape
    expect(bad.ignored).toEqual([{ index: -1, reason: 'kind' }])
  })

  it('effectiveToRawIndex: эффективный индекс → сырой', () => {
    const ops = base()
    const raw = [...ops.slice(0, 2), edit(ops, 1, M(3)), ...ops.slice(2)]
    expect(effectiveToRawIndex(raw)).toEqual([0, 1, 3, 4, 5])
  })
})

describe('projectHistory — каскад CSG и pivot (потребители)', () => {
  /** Правка move операнда A: замена group несёт новый pivot (TRS A) и меш. */
  function movedEdit() {
    const ops = base()
    const repl: StepReplacement = {
      stepIndex: 4, kind: 'group',
      resultVertices: [1, 1, 1, 2, 1, 1, 1, 2, 1], resultIndices: [0, 2, 1],
      resultCenter: { x: 12, y: 0, z: 0 }, resultRotation: { x: 0, y: 30, z: 0 }, resultScale: { x: 2, y: 1, z: 1 },
      originalBboxSize: { x: 1, y: 1, z: 0 },
    }
    // сдвиг a: +2 (шаг 1) + 10 (правленый шаг 3) = 12
    const raw = [...ops, edit(ops, 3, { kind: 'move', delta: { x: 10, y: 0, z: 0 }, rotDelta: { x: 0, y: 30, z: 0 }, scaleDelta: { x: 1, y: 0, z: 0 } }, [repl])]   // scaleDelta аддитивна: 1 + 1 = 2
    return { ops, raw, repl }
  }

  it('buildRebuildMeta: pivot и меш CSG — из замены (полный TRS)', () => {
    const { ops, raw, repl } = movedEdit()
    const before = buildRebuildMeta(ops).meta.c
    expect(before.transform).toMatchObject({ x: 5, rotY: 0, scaleX: 1 })
    const m = buildRebuildMeta(raw).meta.c
    expect(m.transform).toEqual({ x: 12, y: 0, z: 0, rotX: 0, rotY: 30, rotZ: 0, scaleX: 2, scaleY: 1, scaleZ: 1 })
    expect(m.resultVertices).toBe(repl.resultVertices)
    expect(m.resultIndices).toBe(repl.resultIndices)
  })

  it('rebuildBuildTree: boolean-корень получает новый pivot, операнд — пропатченный move', () => {
    const { raw } = movedEdit()
    rebuildBuildTree(raw)
    expect(getNode('c')?.type).toBe('boolean')
    expect(getNode('c')?.localTransform).toMatchObject({ x: 12, rotY: 30, scaleX: 2 })
    expect(getNode('a')?.localTransform).toMatchObject({ x: 12, rotY: 30, scaleX: 2 })
  })

  it('findCreationTransform (калибровка 9.3 / замки 9.9) читает эффективный pivot', () => {
    const { ops, raw } = movedEdit()
    expect(findCreationTransform(ops, 'c')).toMatchObject({ x: 5, rotY: 0 })
    expect(findCreationTransform(raw, 'c')).toMatchObject({ x: 12, rotY: 30, scaleX: 2 })
  })

  it('K>1: обе CSG ниже по течению заменены; undo (префикс) — исходные', () => {
    const ops: TinkerCraftOperation[] = [...base(), add('d', 40), group('c', 'd', 'e', 5)]
    const r4: StepReplacement = { stepIndex: 4, kind: 'group', resultVertices: [9, 9, 9], resultIndices: [0, 0, 0] }
    const r6: StepReplacement = { stepIndex: 6, kind: 'group', resultVertices: [8, 8, 8], resultIndices: [0, 0, 0] }
    const raw = [...ops, edit(ops, 1, M(3), [r4, r6])]
    const eff = projectHistory(raw) as GroupOperation[]
    expect(eff[4].resultVertices).toEqual([9, 9, 9])
    expect(eff[6].resultVertices).toEqual([8, 8, 8])
    // поля без замены — из операции
    expect(eff[6].resultCenter).toEqual({ x: 5, y: 0, z: 0 })
    expect(buildRebuildMeta(raw).meta.e.resultVertices).toEqual([8, 8, 8])
    expect(buildRebuildMeta(raw.slice(0, ops.length)).meta.e.resultVertices).toEqual([0, 0, 0, 1, 0, 0, 0, 1, 0])
  })

  it('замены разных правок: на шаг побеждает последняя, прочие сохраняются', () => {
    const ops: TinkerCraftOperation[] = [...base(), add('d', 40), group('c', 'd', 'e', 5)]
    const e1 = edit(ops, 1, M(3), [
      { stepIndex: 4, kind: 'group', resultVertices: [1] }, { stepIndex: 6, kind: 'group', resultVertices: [2] },
    ])
    const e2 = edit(ops, 3, { kind: 'move', delta: { x: 6, y: 0, z: 0 } }, [{ stepIndex: 4, kind: 'group', resultVertices: [3] }])
    const eff = projectHistory([...ops, e1, e2]) as GroupOperation[]
    expect(eff[4].resultVertices).toEqual([3])
    expect(eff[6].resultVertices).toEqual([2])
    expect(dx(eff[1])).toBe(3)
  })

  it('edit_child_params ниже по течению: меш из замены, params ребёнка — из операции', () => {
    const ops: TinkerCraftOperation[] = [
      ...base(),
      { type: 'edit_child_params', rootId: 'c', nodeId: 'b', params: { width: 12, height: 10, depth: 10 }, resultVertices: [0], resultIndices: [0] },
    ]
    const repl: StepReplacement = { stepIndex: 5, kind: 'edit_child_params', resultVertices: [7], resultIndices: [1] }
    const raw = [...ops, edit(ops, 1, M(3), [repl])]
    expect(buildRebuildMeta(raw).meta.c.resultVertices).toEqual([7])
    rebuildBuildTree(raw)
    expect(getNode('b')?.params).toEqual({ width: 12, height: 10, depth: 10 })
  })

  it('align: deltas из замены (re-solve, В2)', () => {
    const ops: TinkerCraftOperation[] = [
      add('a'), add('b', 30),
      { type: 'move', ids: ['a'], delta: { x: 0, y: 4, z: 0 } },
      { type: 'align', ids: ['a'], axis: 'Y', anchor: 'min', anchorId: 'b', deltas: { a: -4 } },
    ]
    const raw = [...ops, edit(ops, 2, { kind: 'move', delta: { x: 0, y: 9, z: 0 } }, [{ stepIndex: 3, kind: 'align', deltas: { a: -9 } }])]
    expect(buildRebuildMeta(ops).meta.a.transform.y).toBe(0)
    // literal (без замены) сломал бы выравнивание: 9 − 4 = 5
    expect(buildRebuildMeta(projectHistory(ops, { stepIndex: 2, patch: { kind: 'move', delta: { x: 0, y: 9, z: 0 } } })).meta.a.transform.y).toBe(5)
    expect(buildRebuildMeta(raw).meta.a.transform.y).toBe(0)
    expect(applyReplacement(ops[3], { stepIndex: 3, kind: 'group' })).toBeNull()
  })
})

describe('computeCascade', () => {
  it('move → group → group: оба CSG; несвязанный CSG не попадает', () => {
    const ops: TinkerCraftOperation[] = [
      ...base(),                       // 0..4: c = a ∪ b
      add('d', 40), group('c', 'd', 'e'), // 5, 6: e = c ∪ d
      add('x'), add('y'), group('x', 'y', 'z'), // 7..9: независимый
    ]
    const plan = computeCascade(ops, 1)
    expect(plan.frozen).toEqual([{ stepIndex: 4, kind: 'group' }, { stepIndex: 6, kind: 'group' }])
    expect([...plan.affectedIds]).toEqual(['e'])
  })

  it('mirror переносит зависимость на копию; delete обрывает', () => {
    const ops: TinkerCraftOperation[] = [
      add('a'),                                                  // 0
      { type: 'move', ids: ['a'], delta: { x: 1, y: 0, z: 0 } }, // 1
      { type: 'mirror', originalIds: ['a'], ids: ['a2'], plane: 'YZ' }, // 2
      add('b'), group('a2', 'b', 'c'),                           // 3, 4 — зависит через копию
      { type: 'delete', ids: ['a'] },                            // 5
      add('q'), group('a', 'q', 'r'),                            // 6, 7 — «a» уже удалён (id переиспользован)
    ]
    const plan = computeCascade(ops, 1)
    expect(plan.frozen).toEqual([{ stepIndex: 4, kind: 'group' }])
  })

  it('edit_child_params по корню из S; align: якорь из S добавляет все цели', () => {
    const ops: TinkerCraftOperation[] = [
      ...base(),                                                                    // 0..4
      { type: 'edit_child_params', rootId: 'c', nodeId: 'b', params: {}, resultVertices: [], resultIndices: [] }, // 5
      add('t'),                                                                     // 6
      { type: 'align', ids: ['t'], axis: 'X', anchor: 'min', anchorId: 'c', deltas: { t: 1 } }, // 7
      add('u'), group('t', 'u', 'v'),                                               // 8, 9
    ]
    const plan = computeCascade(ops, 3)
    expect(plan.frozen).toEqual([
      { stepIndex: 4, kind: 'group' }, { stepIndex: 5, kind: 'edit_child_params' }, { stepIndex: 9, kind: 'group' },
    ])
    expect(plan.align).toEqual([7])
    expect(plan.alignResolve[7]).toEqual(['t'])                 // якорь сдвинут → все цели
    // все пересчитываемые шаги по порядку истории (замороженные и align вперемешку)
    expect(cascadeSteps(plan).map((x) => `${x.stepIndex}:${x.kind}`)).toEqual([
      '4:group', '5:edit_child_params', '7:align', '9:group',
    ])
  })

  it('align: якорь не из S → re-solve только целей из S', () => {
    const ops: TinkerCraftOperation[] = [
      ...base(),                                                                    // 0..4: c = a ∪ b
      add('t'), add('k'),                                                           // 5, 6
      { type: 'align', ids: ['c', 't'], axis: 'Y', anchor: 'center', anchorId: 'k', deltas: { c: 1, t: 2 } }, // 7
    ]
    const plan = computeCascade(ops, 1)
    expect(plan.align).toEqual([7])
    expect(plan.alignResolve[7]).toEqual(['c'])
    expect(plan.affectedIds.has('t')).toBe(false)
  })

  it('шаг без целей / вне диапазона — пустой план', () => {
    const ops = base()
    expect(computeCascade(ops, 0).frozen).toEqual([])
    expect(computeCascade(ops, 99).frozen).toEqual([])
  })
})

describe('effectivePatches / effectiveOpAt (9.5.2)', () => {
  it('последняя валидная правка шага — с before и сырым индексом правки', () => {
    const ops = base()
    const e1 = { ...edit(ops, 1, M(4)), before: M(2) }
    const e2 = { ...edit(ops, 1, M(7)), before: M(4) }
    const bad = { ...edit(ops, 3, M(1)), stepFingerprint: { type: 'move' as const, targetId: 'zzz' } }
    const all = [...ops, e1, bad, e2]
    const p = effectivePatches(all)
    expect([...p.keys()]).toEqual([1])                          // правка с чужим отпечатком не считается
    expect(p.get(1)).toEqual({ patch: M(7), editIndex: 7, before: M(4) })
    expect(dx(effectiveOpAt(all, 1)!)).toBe(7)
    expect(dx(effectiveOpAt(all, 3)!)).toBe(5)                  // не правленный шаг — как есть
    expect(effectiveOpAt(all, 5)).toBeNull()                    // сама edit_step
    expect(effectiveOpAt(all, 99)).toBeNull()
    expect(dx(effectiveOpAt(all.slice(0, 6), 1)!)).toBe(4)      // префикс (undo второй правки)
  })
})

describe('правка шага mirror (9.5.3): проекция и каскад', () => {
  // a (0) → mirror a→a2 YZ (1) → mirror a2→a3 XZ (2) → b (3) → union a3+b → c (4)
  const mops = (): TinkerCraftOperation[] => [
    add('a', 5),
    { type: 'mirror', originalIds: ['a'], ids: ['a2'], plane: 'YZ' },
    { type: 'mirror', originalIds: ['a2'], ids: ['a3'], plane: 'XZ' },
    add('b', 20),
    group('a3', 'b', 'c'),
  ]
  it('правка ЗАМЕНЯЕТ вклад шага: копия [XY], а не [YZ, XY]; ниже — перекомпозиция', () => {
    const ops = mops()
    const before = buildRebuildMeta(ops.slice(0, 3)).meta
    expect(before.a2.mirrored).toEqual(['YZ'])
    expect(before.a3.mirrored).toEqual(['YZ', 'XZ'])
    const e = edit(ops, 1, { kind: 'mirror', plane: 'XY' })
    const after = buildRebuildMeta([...ops.slice(0, 3), e]).meta
    expect(after.a2.mirrored).toEqual(['XY'])
    expect(after.a3.mirrored).toEqual(['XY', 'XZ'])
    // правка на ту же плоскость, что у следующего шага: XZ∘XZ = тождество у a3
    const e2 = edit(ops, 1, { kind: 'mirror', plane: 'XZ' })
    expect(buildRebuildMeta([...ops.slice(0, 3), e2]).meta.a3.mirrored).toBeUndefined()
    // ids копий не меняются — меняется только плоскость
    expect((applyStepPatch(ops[1], { kind: 'mirror', plane: 'XY' }) as { ids: string[] }).ids).toEqual(['a2'])
  })
  it('computeCascade: S = копии шага; через mirror копии → CSG пересчитывается', () => {
    const ops = [...mops(), add('q', 40), group('a', 'q', 'r')]   // CSG с ОРИГИНАЛОМ не зависит от правки
    const plan = computeCascade(ops, 1)
    expect(plan.frozen).toEqual([{ stepIndex: 4, kind: 'group' }])
    expect(plan.affectedIds.has('c')).toBe(true)
    expect(plan.affectedIds.has('r')).toBe(false)
  })
})

describe('правка шага extrude (9.5.4): вид, отпечаток, проекция, каскад', () => {
  const T0: TransformNR = { ...ID }
  // a (0) → slab (1) → group a+slab → e, source extrude (2) → b (3) → union e+b → c (4)
  const eops = (): TinkerCraftOperation[] => [
    add('a'),
    { type: 'add_shape', id: 's', shapeType: 'cube', params: { width: 10, height: 10, depth: 5 }, color: '#fff', transform: { ...T0, z: 7.5 } },
    { ...group('a', 's', 'e'), source: { kind: 'extrude', baseId: 'a', slabId: 's', axis: 'Z', depth: 5 } },
    add('b', 20),
    group('e', 'b', 'c'),
  ]
  it('вид и отпечаток: только группа с source; цель — id плиты', () => {
    const ops = eops()
    expect(patchKindFor(ops[2])).toBe('extrude')
    expect(patchKindFor(ops[4])).toBeNull()
    expect(stepFingerprint(ops[2])).toEqual({ type: 'group', targetId: 's' })
    expect(stepFingerprint(ops[4])).toBeNull()
  })
  it('applyStepPatch: эффективная глубина в source; сырой шаг не мутирован; не та группа → null', () => {
    const ops = eops()
    const p = applyStepPatch(ops[2], { kind: 'extrude', depth: 10 }) as GroupOperation
    expect(p.source!.depth).toBe(10)
    expect((ops[2] as GroupOperation).source!.depth).toBe(5)
    expect(applyStepPatch(ops[4], { kind: 'extrude', depth: 10 })).toBeNull()
    expect(applyStepPatch(ops[2], M(1))).toBeNull()
  })
  it('проекция: замена плиты (до группы) и самой группы N принимаются; add_shape — params/transform', () => {
    const ops = eops()
    const slabR: StepReplacement = { stepIndex: 1, kind: 'add_shape', params: { width: 10, height: 10, depth: 10 }, transform: { ...T0, z: 10 } }
    const groupR: StepReplacement = { stepIndex: 2, kind: 'group', resultVertices: [9, 9, 9], resultIndices: [0, 0, 0] }
    const e = edit(ops, 2, { kind: 'extrude', depth: 10 }, [slabR, groupR])
    const res = projectHistoryDetailed([...ops, e])
    expect(res.ignored).toEqual([])
    const slab = res.ops[1] as { params: { depth: number }; transform: TransformNR }
    expect(slab.params.depth).toBe(10)
    expect(slab.transform.z).toBe(10)
    expect((res.ops[2] as GroupOperation).resultVertices).toEqual([9, 9, 9])
    expect((res.ops[2] as GroupOperation).source!.depth).toBe(10)
    // самозамена группы — только у правки extrude: move-правка с заменой шага N отклоняется
    const bad = { ...edit(ops, 2, { kind: 'extrude', depth: 10 }), patch: M(1) } as EditStepOperation
    expect(projectHistoryDetailed([...ops, bad]).ignored[0].reason).toBe('kind')
  })
  it('computeCascade: сама группа N + CSG ниже; S — результат', () => {
    const plan = computeCascade(eops(), 2)
    expect(plan.frozen).toEqual([{ stepIndex: 2, kind: 'group' }, { stepIndex: 4, kind: 'group' }])
    expect([...plan.affectedIds]).toEqual(['c'])
  })
})
