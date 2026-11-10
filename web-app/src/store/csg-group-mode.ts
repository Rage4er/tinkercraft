// ============================================================
// csg-group-mode.ts — вычитание / пересечение: A → B → Enter (CSG-GROUP-FIX)
// ============================================================
// Одна кнопка на операцию, без кнопок «Группа A» / «Группа B»:
//   «Объединение»               — сразу: N выбранных → ОДИН CSG с N детьми (без режима).
//   «Вычитание» / «Пересечение» — режим: текущее выделение (≥ 1) — группа A, она
//       фиксируется (выделение снимается, A подсвечена во вьюпорте, «A» в списке объектов);
//       пользователь выбирает B (M ≥ 1) → Enter / «ОК» в статус-баре / та же кнопка ещё раз →
//       union(A) − union(B) / union(A) ∩ union(B) — ОДИН CSG, A и B — его дети
//       (`groupA` = |A| — внутри дерева, N-ARY-CSG). Esc / «Отмена» — выход без изменений,
//       выделение снова A; та же кнопка без B — тоже выход (как «Выровнять»). Другая кнопка
//       (вычитание ↔ пересечение) в режиме — смена операции.
// Объекты A исчезли (undo, удаление) — отбрасываются; A пуста — выход (`pruneCsgGroup`).
// Режим не совмещается с режимом «Выровнять»: вход в один выходит из другого.

import { create } from 'zustand'
import type { CsgBooleanOp, SceneObject } from '../csg/types'
import { useDocumentStore } from './document-store'
import { useAlignModeStore } from './align-mode'
import { uniqueAlive as alive } from './csg-operands'

export type CsgGroupOp = 'subtract' | 'intersect'

export interface CsgGroupModeState {
  active: true
  operation: CsgGroupOp
  /** Группа A — выделение при входе в режим (зафиксирована, порядок выделения). */
  groupA: string[]
}

/** Состояние кнопки CSG: недоступна; нажата (операция режима — нажатие подтверждает). */
export interface CsgOpButtonState {
  disabled: boolean
  active: boolean
}
export type CsgOpButtonStates = Record<CsgBooleanOp, CsgOpButtonState>

/** Группа B режима: текущее выделение без A и без исчезнувших объектов. */
export function groupBOf(
  mode: CsgGroupModeState,
  selectedIds: readonly string[],
  objects: Record<string, SceneObject>,
): string[] {
  const inA = new Set(mode.groupA)
  return alive(selectedIds, objects).filter((id) => !inA.has(id))
}

/**
 * Кнопки CSG по выделению и режиму (занятость стора — общий `disabled` тулбара/панели).
 * Вне режима: объединение — от 2 выбранных, вычитание / пересечение — от 1 (вход в режим).
 * В режиме: объединение недоступно; кнопка операции режима нажата (с B — подтверждает, без B —
 * выход, как «Выровнять»); другая — смена операции.
 */
export function csgButtonStates(
  selectedIds: readonly string[],
  objects: Record<string, SceneObject>,
  mode: CsgGroupModeState | null,
): CsgOpButtonStates {
  if (!mode) {
    const n = alive(selectedIds, objects).length
    return {
      union: { disabled: n < 2, active: false },
      subtract: { disabled: n < 1, active: false },
      intersect: { disabled: n < 1, active: false },
    }
  }
  const state = (op: CsgGroupOp): CsgOpButtonState => ({ disabled: false, active: op === mode.operation })
  return { union: { disabled: true, active: false }, subtract: state('subtract'), intersect: state('intersect') }
}

interface CsgGroupModeStore {
  csgGroupMode: CsgGroupModeState | null
  /** Войти в режим: A — текущее выделение. `false` — нечего фиксировать (или стор занят). */
  startCsgGroup: (operation: CsgGroupOp) => boolean
  /** Сменить операцию режима (A остаётся). */
  setCsgGroupOperation: (operation: CsgGroupOp) => void
  /** Enter / «ОК»: A op B → один CSG. `false` — B пуста (режим остаётся) или режима нет. */
  confirmCsgGroup: () => Promise<boolean>
  /** Esc / «Отмена»: выход без изменений; `restoreSelection` — выделение снова A. */
  cancelCsgGroup: (restoreSelection?: boolean) => void
  /** Убрать исчезнувшие объекты из A; A пуста — выход. */
  pruneCsgGroup: (objects: Record<string, SceneObject>) => void
  /** Нажатие кнопки / клавиши операции (U / X / I) с учётом режима (та же без B — выход). */
  pressCsgOperation: (op: CsgBooleanOp) => Promise<void>
}

export const useCsgGroupModeStore = create<CsgGroupModeStore>((set, get) => ({
  csgGroupMode: null,

  startCsgGroup: (operation) => {
    const doc = useDocumentStore.getState()
    if (doc.busy) return false
    const groupA = alive(doc.selectedIds, doc.objects)
    if (groupA.length === 0) return false
    const align = useAlignModeStore.getState()
    if (align.alignMode) align.exitAlignMode()
    set({ csgGroupMode: { active: true, operation, groupA } })
    doc.clearSelection()
    return true
  },

  setCsgGroupOperation: (operation) => {
    const m = get().csgGroupMode
    if (m && m.operation !== operation) set({ csgGroupMode: { ...m, operation } })
  },

  confirmCsgGroup: async () => {
    const m = get().csgGroupMode
    if (!m) return false
    const doc = useDocumentStore.getState()
    if (doc.busy) return false
    const a = alive(m.groupA, doc.objects)
    if (a.length === 0) {
      set({ csgGroupMode: null })
      return false
    }
    const b = groupBOf(m, doc.selectedIds, doc.objects)
    if (b.length === 0) return false
    set({ csgGroupMode: null })
    await doc.csgBoolean(m.operation, { a, b })
    return true
  },

  cancelCsgGroup: (restoreSelection = true) => {
    const m = get().csgGroupMode
    if (!m) return
    set({ csgGroupMode: null })
    if (!restoreSelection) return
    const doc = useDocumentStore.getState()
    const a = alive(m.groupA, doc.objects)
    if (a.length > 0) doc.selectObjects(a, false)
  },

  pruneCsgGroup: (objects) => {
    const m = get().csgGroupMode
    if (!m) return
    const a = alive(m.groupA, objects)
    if (a.length === m.groupA.length) return
    set({ csgGroupMode: a.length > 0 ? { ...m, groupA: a } : null })
  },

  pressCsgOperation: async (op) => {
    const m = get().csgGroupMode
    if (op === 'union') {
      if (!m) await useDocumentStore.getState().csgBoolean('union')
      return
    }
    if (!m) {
      get().startCsgGroup(op)
      return
    }
    if (m.operation !== op) {
      get().setCsgGroupOperation(op)
      return
    }
    const doc = useDocumentStore.getState()
    if (groupBOf(m, doc.selectedIds, doc.objects).length === 0) get().cancelCsgGroup()
    else await get().confirmCsgGroup()
  },
}))
