// ============================================================
// csg-operands — операнды N-арного CSG (N-ARY-CSG)
// ============================================================
//
// Какие объекты и в каком порядке идут в одну CSG-операцию:
//   union              — все выбранные (или группы A ∪ B) → ОДИН CSG, N детей;
//   subtract/intersect — union(A) op union(B) → ОДИН CSG, группы A и B — его дети.
// Группы задаёт пользователь кнопками «Группа A» / «Группа B» (ui-store `csgGroups`):
//   - обе заданы             → A и B;
//   - задана одна            → вторая — текущее выделение без неё;
//   - ни одной, выбрано ≥ 2  → A — первый выбранный, B — остальные (бинарный случай:
//                              ровно 2 → a op b, как раньше).
// Мёртвые id (объект поглощён, удалён, undo) отбрасываются. Нечего считать → null
// (кнопки неактивны), простые сценарии уведомлением не отклоняются.
// ============================================================

import type { SceneObject } from '../csg/types'

/** Группы A/B для subtract/intersect (ui-store). */
export interface CsgGroups {
  a: string[]
  b: string[]
}

export const EMPTY_CSG_GROUPS: CsgGroups = { a: [], b: [] }

/** Операнды одной CSG-операции: `ids[0..groupA)` — группа A, остальные — B. */
export interface CsgOperands {
  ids: string[]
  groupA: number
}

const uniqueAlive = (ids: readonly string[], objects: Record<string, SceneObject>): string[] => {
  const seen = new Set<string>()
  const out: string[] = []
  for (const id of ids) {
    if (seen.has(id) || !objects[id]) continue
    seen.add(id)
    out.push(id)
  }
  return out
}

/** Живые члены групп (группа B без членов A). */
export function aliveGroups(groups: CsgGroups | undefined, objects: Record<string, SceneObject>): CsgGroups {
  const a = uniqueAlive(groups?.a ?? [], objects)
  const inA = new Set(a)
  const b = uniqueAlive(groups?.b ?? [], objects).filter((id) => !inA.has(id))
  return { a, b }
}

/** Операнды CSG по выделению и группам A/B; null — операция невозможна. */
export function resolveCsgOperands(
  selectedIds: readonly string[],
  groups: CsgGroups | undefined,
  objects: Record<string, SceneObject>,
): CsgOperands | null {
  let { a, b } = aliveGroups(groups, objects)
  const sel = uniqueAlive(selectedIds, objects)
  if (a.length > 0 && b.length === 0) {
    const inA = new Set(a)
    b = sel.filter((id) => !inA.has(id))
  } else if (a.length === 0 && b.length > 0) {
    const inB = new Set(b)
    a = sel.filter((id) => !inB.has(id))
  } else if (a.length === 0 && b.length === 0) {
    if (sel.length < 2) return null
    a = [sel[0]]
    b = sel.slice(1)
  }
  if (a.length === 0 || b.length === 0) return null
  return { ids: [...a, ...b], groupA: a.length }
}

/** Назначить выделение группой `which` (снимает эти объекты с другой группы). */
export function assignCsgGroup(groups: CsgGroups, which: 'a' | 'b', ids: readonly string[]): CsgGroups {
  const set = new Set(ids)
  const next = [...set]
  return which === 'a'
    ? { a: next, b: groups.b.filter((id) => !set.has(id)) }
    : { a: groups.a.filter((id) => !set.has(id)), b: next }
}
