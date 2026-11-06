// ============================================================
// edit-step — правка прошлого шага с каскадом (Фаза 9.5.2: move, 9.5.3: mirror, 9.5.4: extrude)
// ============================================================
//
// Строит операцию `edit_step` (docs/PHASE_9_5_DESIGN.md §3): история «как если бы
// шаг N сразу был с новыми значениями» (projectHistory с гипотетической правкой),
// затем по порядку пересчитываются шаги ниже по течению (computeCascade):
//   - group             → computeCsgResult над операндами из состояния ДО этого шага
//                         (в конвенции шага: pivot = TRS A либо legacy с запечённым RS);
//                         новый pivot = новый TRS операнда A (R8). Группа extrude
//                         (`source`) сначала заново строит плиту по мировой рамке базы
//                         на этом шаге (extrudeSlab) — замена её `add_shape`: правка
//                         глубины и сдвиг базы правкой раньше (плита следует за базой);
//   - edit_child_params → computeEditedChild (путь 9.3, с калибровкой) поверх новых
//                         params узла: правка пользователя = разница params с исходными;
//   - align             → re-solve (решение В2): deltas заново из axis/anchor/anchorId
//                         по рамкам объектов на этом шаге (тот же решатель, что alignSelected).
// Состояние до шага j — rebuildFromHistory(H_j), где H_j — эффективная история
// [0, j) с уже посчитанными заменами. Любой сбой → отказ всей правки (атомарно).
//
// Побочные эффекты: кэш воркера и Build Tree остаются в промежуточном состоянии —
// вызывающий (document-store.editStepParams) восстанавливает их в любом исходе.
// ============================================================

import type {
  TinkerCraftOperation, EditStepOperation, StepPatch, StepReplacement, SceneObject,
  GroupOperation, EditChildParamsOperation, AlignOperation, AddShapeOperation, ShapeParams, Vec3,
} from '../csg/types'
import {
  projectHistory, effectiveToRawIndex, effectiveOpAt, computeCascade, cascadeSteps, applyReplacement,
  stepFingerprint, patchKindFor, MAX_CASCADE_STEPS,
} from './project-history'
import { rebuildFromHistory, rebuildBuildTree, buildRebuildMeta } from './rebuild'
import { computeCsgResult, bakeResultRS, groupReplacementFromResult } from './csg-result'
import { computeEditedChild, type EditChildFailure } from './edit-child'
import { solveAlignDeltas, extrudeSlab, worldVerticesAABB, nextId } from './helpers'
import { getNode } from '../csg/history-tree'

/**
 * Виды патчей, которые поддерживает движок: move (9.5.2), mirror (9.5.3; шаг mirror ничего
 * не хранит готовым — копии и `mirrored[]` (composeMirroredList) воспроизводятся из
 * исходного списка оригинала, поэтому правка ЗАМЕНЯЕТ вклад шага, а не наслаивается).
 */
const SUPPORTED_KINDS: ReadonlySet<StepPatch['kind']> = new Set(['move', 'mirror', 'extrude'])
/** Глубина extrude: не нулевая (плита нулевой толщины — не объём) и в разумных пределах. */
const EXTRUDE_MIN = 0.01
const EXTRUDE_MAX = 10000
const PLANES: ReadonlySet<string> = new Set(['XY', 'XZ', 'YZ'])

/**
 * Правится ли шаг как прошлый шаг (edit_step с каскадом) — ✎ в Timeline и панель «Шаг N».
 * Единственный источник: SUPPORTED_KINDS (move, mirror, extrude); extrude — только группа с source.
 */
export function isStepEditable(op: TinkerCraftOperation): boolean {
  const kind = patchKindFor(op)
  return kind !== null && SUPPORTED_KINDS.has(kind)
}

/** Допуск сравнения значений патча («не изменилось»). */
const SAME_EPS = 1e-9

export type EditStepFailure =
  | 'not_found'        // шаг вне [0, historyIndex) или не того типа
  | 'unsupported'      // вид правки не поддержан
  | 'invalid'          // недопустимое значение
  | 'unchanged'        // значение не изменилось
  | 'too_many'         // каскад длиннее MAX_CASCADE_STEPS (R4)
  | 'missing_operand'  // операнда CSG нет в состоянии до шага
  | 'legacy'           // CSG без resultCenter (документы до CRIT-CSG-2)
  | 'empty'            // шаг ниже по течению стал пустым
  | 'child_failed'     // правка ребёнка ниже по течению не воспроизводится
  | 'failed'           // ошибка воркера

export type EditStepResult =
  | { ok: true; op: EditStepOperation; recomputed: number }
  | { ok: false; reason: EditStepFailure; /** сырой индекс проблемного шага */ failedStep?: number; childReason?: EditChildFailure }

const finiteVec = (v: Vec3 | undefined): boolean =>
  !v || (Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z))

/** Допустимо ли значение патча (без знания геометрии — масштаб клампит applyMoveDelta). */
function patchValid(p: StepPatch): boolean {
  if (p.kind === 'move') return !!p.delta && finiteVec(p.delta) && finiteVec(p.rotDelta) && finiteVec(p.scaleDelta)
  if (p.kind === 'mirror') return PLANES.has(p.plane)
  if (p.kind === 'extrude') return Number.isFinite(p.depth) && Math.abs(p.depth) >= EXTRUDE_MIN && Math.abs(p.depth) <= EXTRUDE_MAX
  return false
}

const ZERO: Vec3 = { x: 0, y: 0, z: 0 }
const sameVec = (a: Vec3 | undefined, b: Vec3 | undefined): boolean => {
  const u = a ?? ZERO, v = b ?? ZERO
  return Math.abs(u.x - v.x) < SAME_EPS && Math.abs(u.y - v.y) < SAME_EPS && Math.abs(u.z - v.z) < SAME_EPS
}

function samePatch(op: TinkerCraftOperation, p: StepPatch): boolean {
  if (p.kind === 'move' && op.type === 'move') {
    return sameVec(op.delta, p.delta) && sameVec(op.rotDelta, p.rotDelta) && sameVec(op.scaleDelta, p.scaleDelta)
  }
  if (p.kind === 'mirror' && op.type === 'mirror') return op.plane === p.plane
  if (p.kind === 'extrude' && op.type === 'group' && op.source) return Math.abs(op.source.depth - p.depth) < SAME_EPS
  return false
}

/** «Прежние значения» шага для подписи (эффективные — с учётом прошлых правок). */
function beforeOf(op: TinkerCraftOperation): StepPatch | undefined {
  if (op.type === 'move') {
    return {
      kind: 'move', delta: { ...op.delta },
      ...(op.rotDelta ? { rotDelta: { ...op.rotDelta } } : {}),
      ...(op.scaleDelta ? { scaleDelta: { ...op.scaleDelta } } : {}),
    }
  }
  if (op.type === 'mirror') return { kind: 'mirror', plane: op.plane }
  if (op.type === 'group' && op.source?.kind === 'extrude') return { kind: 'extrude', depth: op.source.depth }
  return undefined
}

/** Правка пользователя в edit_child_params = поля, отличающиеся от params узла ДО неё. */
function userPatch(stored: ShapeParams, before: ShapeParams | undefined): ShapeParams {
  const out: Record<string, number> = {}
  const b = (before ?? {}) as Record<string, number | undefined>
  for (const [k, v] of Object.entries(stored as Record<string, number | undefined>)) {
    if (typeof v === 'number' && b[k] !== v) out[k] = v
  }
  return out as ShapeParams
}

/** Плита не изменилась (шум float при пересчёте рамки не создаёт замену). */
function sameSlab(op: AddShapeOperation, slab: { params: ShapeParams; transform: { x: number; y: number; z: number } }): boolean {
  const p = op.params as Record<string, number | undefined>, q = slab.params as Record<string, number | undefined>
  const close = (u: number | undefined, v: number | undefined) => Math.abs((u ?? 0) - (v ?? 0)) < 1e-6
  return close(p.width, q.width) && close(p.height, q.height) && close(p.depth, q.depth) &&
    close(op.transform.x, slab.transform.x) && close(op.transform.y, slab.transform.y) && close(op.transform.z, slab.transform.z)
}

/**
 * Pivot примитивов — точно из истории (spawn + дельты), как у живых объектов.
 * rebuildFromHistory прибавляет к нему смещение COM, посчитанное воркером во float32
 * (шум ~1e-6), — каскад дал бы pivot CSG, отличающийся от живого объединения.
 * Геометрию обычного примитива воркер в CSG строит из params, поэтому вершины не важны;
 * зеркальные примитивы, CSG и импорт не трогаем (их вершины согласованы с pivot).
 */
function withExactTransforms(objects: Record<string, SceneObject>, ops: TinkerCraftOperation[]): Record<string, SceneObject> {
  const { meta } = buildRebuildMeta(ops)
  const out: Record<string, SceneObject> = { ...objects }
  for (const [id, o] of Object.entries(objects)) {
    const m = meta[id]
    if (!m || o.shapeType === 'csg' || o.shapeType === 'import_mesh' || o.mirrored) continue
    out[id] = { ...o, transform: { ...m.transform } }
  }
  return out
}

/**
 * Посчитать правку шага `stepIndex` (сырой индекс) на префиксе `[0, historyIndex)`.
 * Возвращает готовую `edit_step` либо причину отказа; историю не меняет.
 */
export async function computeStepEdit(args: {
  operations: TinkerCraftOperation[]
  historyIndex: number
  stepIndex: number
  patch: StepPatch
}): Promise<EditStepResult> {
  const { operations, historyIndex, stepIndex, patch } = args
  const raw = operations.slice(0, historyIndex)
  const target = raw[stepIndex]
  if (!target || target.type === 'edit_step' || patchKindFor(target) !== patch.kind) return { ok: false, reason: 'not_found' }
  if (!SUPPORTED_KINDS.has(patch.kind)) return { ok: false, reason: 'unsupported' }
  if (!patchValid(patch)) return { ok: false, reason: 'invalid' }
  const current = effectiveOpAt(raw, stepIndex)
  if (!current) return { ok: false, reason: 'not_found' }
  if (samePatch(current, patch)) return { ok: false, reason: 'unchanged' }
  const fp = stepFingerprint(target)
  if (!fp) return { ok: false, reason: 'not_found' }

  // Эффективные индексы ↔ сырые (edit_step выброшены в обеих проекциях — выравнивание общее)
  const toRaw = effectiveToRawIndex(raw)
  const effN = toRaw.indexOf(stepIndex)
  const effOld = projectHistory(raw)
  const cur = projectHistory(raw, { stepIndex, patch })
  const plan = computeCascade(cur, effN)
  const steps = cascadeSteps(plan)
  if (steps.length > MAX_CASCADE_STEPS) return { ok: false, reason: 'too_many' }

  const replacements: StepReplacement[] = []
  for (const { stepIndex: j, kind } of steps) {
    const rawJ = toRaw[j]
    const fail = (reason: EditStepFailure, childReason?: EditChildFailure): EditStepResult =>
      ({ ok: false, reason, failedStep: rawJ, childReason })
    const H = cur.slice(0, j)
    let replayed: Record<string, SceneObject>
    let before: Record<string, SceneObject>
    try {
      replayed = await rebuildFromHistory(H)
      before = withExactTransforms(replayed, H)
    } catch (e) {
      console.error('[edit-step] replay failed:', e)
      return fail('failed')
    }

    let r: StepReplacement
    if (kind === 'group') {
      const g = cur[j] as GroupOperation
      if (!g.resultCenter) return fail('legacy')
      const a = before[g.ids[0]]
      let b = before[g.ids[1]]
      if (!a || !b) return fail('missing_operand')
      if (g.source?.kind === 'extrude') {
        // Плита — по мировой рамке базы на этом шаге (как живое extrudeSelected); рамка —
        // по согласованной паре вершины + pivot воспроизведения (до точных pivot примитивов)
        const base = replayed[g.source.baseId]
        const k = cur.findIndex((o, idx) => idx < j && o.type === 'add_shape' && o.id === g.source!.slabId)
        if (!base || k < 0) return fail('missing_operand')
        const slab = extrudeSlab(worldVerticesAABB(base.vertices, base.transform), g.source.axis, g.source.depth)
        if (!sameSlab(cur[k] as AddShapeOperation, slab)) {
          const rs: StepReplacement = { stepIndex: toRaw[k], kind: 'add_shape', params: slab.params, transform: slab.transform }
          replacements.push(rs)
          cur[k] = applyReplacement(cur[k], rs) ?? cur[k]
        }
        b = { ...b, params: slab.params, transform: slab.transform }
      }
      let res
      try {
        res = await computeCsgResult(a, b, g.treeOperation ?? 'union', g.resultId ?? nextId('csg'))
      } catch (e) {
        console.error('[edit-step] CSG failed:', e)
        return fail('failed')
      }
      if (res.indices.length < 3) return fail('empty')
      // Конвенция шага: без resultRotation/Scale — legacy (RS запечён, pivot = позиция A)
      const legacy = g.resultRotation === undefined && g.resultScale === undefined
      r = groupReplacementFromResult(rawJ, legacy ? bakeResultRS(res) : res)
      if (legacy) { delete r.resultRotation; delete r.resultScale }
    } else if (kind === 'align') {
      // Re-solve (В2): цели, чья рамка или рамка якоря изменилась, — заново по рамкам
      // на этом шаге; у прочих записанная delta верна (их рамка и якорь прежние).
      const a = cur[j] as AlignOperation
      const resolved = solveAlignDeltas(before, plan.alignResolve[j] ?? [], a.axis, a.anchor, a.anchorId)
      r = { stepIndex: rawJ, kind: 'align', deltas: { ...a.deltas, ...resolved } }
    } else {
      const e = cur[j] as EditChildParamsOperation
      // params узла до правки: исходные (по старой истории) и новые (по каскаду)
      rebuildBuildTree(effOld.slice(0, j))
      const pOld = getNode(e.nodeId)?.params
      rebuildBuildTree(H, before)
      const res = await computeEditedChild({
        rootId: e.rootId, nodeId: e.nodeId, patch: userPatch(e.params, pOld),
        objects: before, operations: H, historyIndex: H.length,
      })
      if (!res.ok) return fail(res.reason === 'empty' ? 'empty' : 'child_failed', res.reason)
      r = {
        stepIndex: rawJ, kind: 'edit_child_params',
        resultVertices: res.mesh.vertices, resultIndices: res.mesh.indices,
        resultNormals: res.mesh.normals ?? undefined,
        originalBboxSize: res.mesh.originalBboxSize,
      }
    }
    replacements.push(r)
    cur[j] = applyReplacement(cur[j], r) ?? cur[j]
  }

  const op: EditStepOperation = {
    type: 'edit_step', stepIndex, stepFingerprint: fp, patch, before: beforeOf(current), replacements,
  }
  return { ok: true, op, recomputed: replacements.length }
}

/** Ключ i18n `errors.editStep.*` для причины отказа. */
export function editStepFailureKey(reason: EditStepFailure): string {
  switch (reason) {
    case 'not_found': return 'notFound'
    case 'unsupported': return 'unsupported'
    case 'invalid': return 'invalid'
    case 'too_many': return 'tooMany'
    case 'missing_operand': return 'missingOperand'
    case 'legacy': return 'legacy'
    case 'empty': return 'empty'
    case 'child_failed': return 'childFailed'
    default: return 'failed'
  }
}
