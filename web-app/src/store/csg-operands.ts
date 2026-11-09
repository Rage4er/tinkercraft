// ============================================================
// csg-operands — операнды N-арного CSG (N-ARY-CSG)
// ============================================================
//
// Какие объекты и в каком порядке идут в одну CSG-операцию:
//   union              — все выбранные → ОДИН CSG, N детей;
//   subtract/intersect — union(A) op union(B) → ОДИН CSG, группы A и B — его дети.
// Группы A/B приходят из режима «A → B → Enter» (`csg-group-mode.ts`, CSG-GROUP-FIX):
//   - обе заданы             → A и B;
//   - задана одна            → вторая — текущее выделение без неё;
//   - ни одной, выбрано ≥ 2  → A — первый выбранный, B — остальные (бинарный случай:
//                              ровно 2 → a op b, как раньше; так считает `csgBoolean` без групп).
// Мёртвые id (объект поглощён, удалён, undo) отбрасываются. Нечего считать → null.
// ============================================================

import type { SceneObject } from '../csg/types'

/** Группы A/B для subtract/intersect (режим `csg-group-mode`). */
export interface CsgGroups {
  a: string[]
  b: string[]
}

/** Операнды одной CSG-операции: `ids[0..groupA)` — группа A, остальные — B. */
export interface CsgOperands {
  ids: string[]
  groupA: number
}

/** Id без повторов и без исчезнувших объектов (порядок сохраняется). */
export function uniqueAlive(ids: readonly string[], objects: Record<string, SceneObject>): string[] {
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
