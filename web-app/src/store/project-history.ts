// ============================================================
// project-history — эффективная история (Фаза 9.5.0)
// ============================================================
//
// Правка прошлого шага N (fillet / move / mirror) записывается append-only
// операцией `edit_step` в конец истории; `operations[N]` не трогается
// (docs/PHASE_9_5_DESIGN.md, подход B′). Потребители истории (воспроизведение
// сцены и дерева, калибровка 9.3, замки 9.9) получают ЭФФЕКТИВНУЮ историю —
// результат `projectHistory`:
//   1. у шага N подставлены новые значения (последняя правка шага побеждает);
//   2. у «замороженных» шагов ниже по течению (group / edit_child_params / align)
//      подставлены пересчитанные результаты из `edit_step.replacements`;
//   3. сами `edit_step` выброшены.
//
// Проекция идемпотентна: в эффективной истории нет `edit_step`, поэтому
// повторная проекция возвращает ТОТ ЖЕ массив. Это позволяет проецировать на
// входе каждого потребителя (rebuild.ts, edit-child.ts) без риска двойного
// применения и без зависимости от того, спроецировал ли историю вызывающий.
//
// Модуль чистый: без WASM, без стора, без UI.
// ============================================================

import type {
  TinkerCraftOperation, EditStepOperation, StepPatch, StepPatchKind, StepReplacement,
} from '../csg/types'
import { devWarn } from '../utils/debug'

/** Предел числа пересчитываемых замороженных шагов одной правки (R4). */
export const MAX_CASCADE_STEPS = 50

// ---------------------------------------------------------------------------
// Отпечаток и применимость патча
// ---------------------------------------------------------------------------

/** Вид патча, применимый к шагу данного типа; `null` — шаг не редактируется как шаг. */
export function patchKindFor(type: TinkerCraftOperation['type']): StepPatchKind | null {
  return type === 'fillet' || type === 'move' || type === 'mirror' ? type : null
}

/**
 * Отпечаток шага (тип + id цели) — защита от рассинхрона индекса (R7).
 * fillet → id; move → ids; mirror → ids НОВЫХ объектов (через запятую).
 * `null` — шаг не редактируется как шаг.
 */
export function stepFingerprint(op: TinkerCraftOperation): EditStepOperation['stepFingerprint'] | null {
  switch (op.type) {
    case 'fillet': return { type: op.type, targetId: op.id }
    case 'move': return { type: op.type, targetId: op.ids.join(',') }
    case 'mirror': return { type: op.type, targetId: op.ids.join(',') }
    default: return null
  }
}

/**
 * Шаг с новыми значениями. Иммутабельно (исходная операция не меняется).
 * `null` — вид патча не соответствует типу шага.
 */
export function applyStepPatch(op: TinkerCraftOperation, patch: StepPatch): TinkerCraftOperation | null {
  if (patch.kind === 'fillet' && op.type === 'fillet') {
    return { ...op, radius: patch.radius }
  }
  if (patch.kind === 'move' && op.type === 'move') {
    // Патч — полный набор новых дельт: отсутствующий rot/scale означает «нет».
    const { rotDelta: _r, scaleDelta: _s, ...rest } = op
    return {
      ...rest,
      delta: { ...patch.delta },
      ...(patch.rotDelta ? { rotDelta: { ...patch.rotDelta } } : {}),
      ...(patch.scaleDelta ? { scaleDelta: { ...patch.scaleDelta } } : {}),
    }
  }
  if (patch.kind === 'mirror' && op.type === 'mirror') {
    return { ...op, plane: patch.plane }
  }
  return null
}

/**
 * Замороженный шаг с пересчитанным результатом. Поля, которых нет в замене,
 * остаются как в операции. `null` — тип шага не совпал с `r.kind`.
 */
export function applyReplacement(op: TinkerCraftOperation, r: StepReplacement): TinkerCraftOperation | null {
  if (op.type !== r.kind) return null
  if (op.type === 'align') {
    return r.deltas ? { ...op, deltas: { ...r.deltas } } : op
  }
  if (op.type === 'group') {
    return {
      ...op,
      ...(r.resultVertices ? { resultVertices: r.resultVertices } : {}),
      ...(r.resultIndices ? { resultIndices: r.resultIndices } : {}),
      ...(r.resultNormals ? { resultNormals: r.resultNormals } : {}),
      ...(r.resultCenter ? { resultCenter: { ...r.resultCenter } } : {}),
      ...(r.resultRotation ? { resultRotation: { ...r.resultRotation } } : {}),
      ...(r.resultScale ? { resultScale: { ...r.resultScale } } : {}),
      ...(r.originalBboxSize ? { originalBboxSize: { ...r.originalBboxSize } } : {}),
    }
  }
  if (op.type === 'edit_child_params') {
    return {
      ...op,
      ...(r.resultVertices ? { resultVertices: r.resultVertices } : {}),
      ...(r.resultIndices ? { resultIndices: r.resultIndices } : {}),
      ...(r.resultNormals ? { resultNormals: r.resultNormals } : {}),
      ...(r.originalBboxSize ? { originalBboxSize: { ...r.originalBboxSize } } : {}),
      ...(r.params ? { params: { ...r.params } } : {}),
    }
  }
  return null
}

// ---------------------------------------------------------------------------
// Проекция
// ---------------------------------------------------------------------------

export type IgnoredEditReason =
  | 'bad_index'        // stepIndex вне [0, индекс правки) или цель — сама edit_step
  | 'fingerprint'      // отпечаток не совпал (история повреждена / усечена)
  | 'kind'             // вид патча не подходит к типу шага
  | 'replacement'      // замена указывает не на тот шаг / не того типа

export interface ProjectionResult {
  /** Эффективная история (без edit_step). Без правок — тот же массив, что на входе. */
  ops: TinkerCraftOperation[]
  /** Сырые индексы проигнорированных edit_step (правка целиком, атомарно) */
  ignored: Array<{ index: number; reason: IgnoredEditReason }>
}

/** Гипотетическая правка поверх истории — вход для каскада (9.5.1+). */
export interface HypotheticalEdit {
  /** Индекс шага в сырой истории */
  stepIndex: number
  patch: StepPatch
}

function isIndex(v: unknown, lo: number, hi: number): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= lo && v < hi
}

function validateEdit(ops: TinkerCraftOperation[], at: number, e: EditStepOperation): IgnoredEditReason | null {
  if (!isIndex(e.stepIndex, 0, at)) return 'bad_index'
  const target = ops[e.stepIndex]
  if (target.type === 'edit_step') return 'bad_index'
  const fp = stepFingerprint(target)
  if (!fp || !e.stepFingerprint || fp.type !== e.stepFingerprint.type || fp.targetId !== e.stepFingerprint.targetId) {
    return 'fingerprint'
  }
  if (!e.patch || patchKindFor(target.type) !== e.patch.kind) return 'kind'
  for (const r of e.replacements ?? []) {
    // Замена — только ниже по течению от шага N и выше самой правки
    if (!isIndex(r.stepIndex, e.stepIndex + 1, at) || ops[r.stepIndex].type !== r.kind) return 'replacement'
  }
  return null
}

/**
 * Эффективная история с диагностикой.
 *
 * Каждая `edit_step` с сырым индексом i относится только к шагам < i, поэтому
 * проекция префикса `ops.slice(0, h)` учитывает ровно правки, сделанные до h
 * (undo правки = шаг назад по индексу). Последняя правка шага побеждает; замена
 * замороженного шага — тоже последняя (каждая правка считает каскад по
 * эффективной истории своего момента, поэтому её замены полные).
 *
 * `hypothetical` — ещё не записанная правка поверх (для каскада): применяется
 * последней, без замен — замороженные шаги ниже остаются старыми.
 */
export function projectHistoryDetailed(
  ops: TinkerCraftOperation[],
  hypothetical?: HypotheticalEdit,
): ProjectionResult {
  const ignored: ProjectionResult['ignored'] = []
  if (!hypothetical && !ops.some((op) => op.type === 'edit_step')) return { ops, ignored }

  const patches = new Map<number, StepPatch>()
  const replacements = new Map<number, StepReplacement>()
  for (let i = 0; i < ops.length; i++) {
    const op = ops[i]
    if (op.type !== 'edit_step') continue
    const reason = validateEdit(ops, i, op)
    if (reason) {
      ignored.push({ index: i, reason })
      devWarn('[projectHistory]', `edit_step #${i} проигнорирована: ${reason}`)
      continue
    }
    patches.set(op.stepIndex, op.patch)
    for (const r of op.replacements ?? []) replacements.set(r.stepIndex, r)
  }
  if (hypothetical) {
    const target = ops[hypothetical.stepIndex]
    if (target && target.type !== 'edit_step' && patchKindFor(target.type) === hypothetical.patch.kind) {
      patches.set(hypothetical.stepIndex, hypothetical.patch)
    } else {
      ignored.push({ index: -1, reason: target ? 'kind' : 'bad_index' })
    }
  }

  const out: TinkerCraftOperation[] = []
  for (let i = 0; i < ops.length; i++) {
    let op = ops[i]
    if (op.type === 'edit_step') continue
    const p = patches.get(i)
    if (p) op = applyStepPatch(op, p) ?? op
    const r = replacements.get(i)
    if (r) op = applyReplacement(op, r) ?? op
    out.push(op)
  }
  return { ops: out, ignored }
}

/**
 * Эффективная история (см. `projectHistoryDetailed`). Идемпотентна:
 * `projectHistory(projectHistory(x)) === projectHistory(x)` (тот же массив).
 * С `hypothetical` — история «как если бы шаг N сразу был с новыми значениями»
 * (замороженные шаги ниже по течению НЕ пересчитаны — это задача каскада).
 */
export function projectHistory(
  ops: TinkerCraftOperation[],
  hypothetical?: HypotheticalEdit,
): TinkerCraftOperation[] {
  return projectHistoryDetailed(ops, hypothetical).ops
}

/** Эффективная история префикса `[0, historyIndex)` — единая точка для стора (R5). */
export function effectiveOps(ops: TinkerCraftOperation[], historyIndex: number): TinkerCraftOperation[] {
  return projectHistory(ops.slice(0, historyIndex))
}

/**
 * Сопоставление индексов: эффективный индекс → сырой. Нужен, когда результат
 * анализа эффективной истории (каскад) надо записать в `edit_step` сырыми
 * индексами. Только для историй БЕЗ гипотетической правки.
 */
export function effectiveToRawIndex(ops: TinkerCraftOperation[]): number[] {
  const map: number[] = []
  for (let i = 0; i < ops.length; i++) if (ops[i].type !== 'edit_step') map.push(i)
  return map
}

// ---------------------------------------------------------------------------
// Каскад: какие шаги ниже по течению надо пересчитать
// ---------------------------------------------------------------------------

export interface CascadePlan {
  /** Замороженные шаги (эффективные индексы, по порядку), зависящие от шага N */
  frozen: Array<{ stepIndex: number; kind: 'group' | 'edit_child_params' }>
  /** Шаги align, затронутые правкой (deltas пересчитываются — политика re-solve, В2) */
  align: number[]
  /** id объектов, геометрия или положение которых меняется правкой (после последнего шага) */
  affectedIds: Set<string>
}

/** Объекты, которые шаг N затрагивает непосредственно. */
function seedIds(op: TinkerCraftOperation): string[] {
  switch (op.type) {
    case 'fillet': return [op.id]
    case 'move': return [...op.ids]
    case 'mirror': return [...op.ids]
    default: return []
  }
}

/**
 * Замыкание зависимостей шага `stepIndex` по ЭФФЕКТИВНОЙ истории
 * (§3.1 PHASE_9_5_DESIGN): S = цели шага N; далее по шагам N+1…end:
 * - `group` с операндом из S → пересчитать, результат в S;
 * - `mirror` с оригиналом из S → копия в S (воспроизводится сама);
 * - `edit_child_params` с корнем из S → пересчитать;
 * - `align`: цель из S или якорь из S → пересчитать deltas; при якоре из S
 *   сдвигаются все цели → все в S;
 * - `delete` → id выходят из S.
 * Остальные шаги воспроизводятся сами и S не меняют.
 */
export function computeCascade(effective: TinkerCraftOperation[], stepIndex: number): CascadePlan {
  const plan: CascadePlan = { frozen: [], align: [], affectedIds: new Set() }
  const target = effective[stepIndex]
  if (!target || target.type === 'edit_step') return plan
  const S = plan.affectedIds
  for (const id of seedIds(target)) S.add(id)

  for (let j = stepIndex + 1; j < effective.length; j++) {
    const op = effective[j]
    if (op.type === 'group') {
      if (op.ids.some((id) => S.has(id))) {
        plan.frozen.push({ stepIndex: j, kind: 'group' })
        if (op.resultId) S.add(op.resultId)
      }
      // Операнды поглощены результатом
      for (const id of op.ids) S.delete(id)
    } else if (op.type === 'mirror') {
      const orig = op.originalIds ?? []
      for (let k = 0; k < orig.length && k < op.ids.length; k++) {
        if (S.has(orig[k])) S.add(op.ids[k])
      }
    } else if (op.type === 'edit_child_params') {
      if (S.has(op.rootId)) plan.frozen.push({ stepIndex: j, kind: 'edit_child_params' })
    } else if (op.type === 'align') {
      const anchorHit = S.has(op.anchorId)
      if (anchorHit || op.ids.some((id) => S.has(id))) {
        plan.align.push(j)
        if (anchorHit) for (const id of op.ids) S.add(id)
      }
    } else if (op.type === 'delete') {
      for (const id of op.ids) S.delete(id)
    }
  }
  return plan
}
