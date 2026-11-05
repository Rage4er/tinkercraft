// ============================================================
// legacy-fillet — миграция старых проектов со скруглением куба
// ============================================================
//
// Скругление куба (`fillet`, `params.filletRadius`) удалено из приложения до появления
// нормального инструмента (выбор рёбер, B-Rep). Старые `.3dtc`/`.doodle`/автосейвы/проекты
// IndexedDB должны открываться без падения:
//   - шаги `fillet` ВЫРЕЗАЮТСЯ из истории (иначе в Timeline был бы невидимый шаг, на котором
//     Ctrl+Z «ничего не делает»);
//   - `filletRadius` снимается из params операций (add_shape — paste скруглённого куба,
//     resize_dims, edit_child_params) и объектов — скрытых параметров не остаётся;
//   - `edit_step` (Фаза 9.5) перенумеровываются под новые индексы.
// Кубы становятся острыми; объекты нужно пересобрать из истории (`changed`). CSG-меши в
// `group` не трогаются: до удаления CSG и так строил куб без скругления (FILLET-LOST-IN-CSG).
// Чистая функция: вход не мутируется.
// ============================================================

import type { TinkerCraftOperation, SceneObject, ShapeParams } from '../csg/types'

export interface LegacyFilletMigration {
  operations: TinkerCraftOperation[]
  /** Объекты без filletRadius (если были переданы) — вершины прежние, их надо пересобрать */
  objects?: Record<string, SceneObject>
  /** Найдено ли скругление (шаг fillet или filletRadius в params) */
  changed: boolean
  /** Число вырезанных шагов fillet */
  removedSteps: number
  /** Новый индекс истории для старого `historyIndex` (сколько шагов осталось до него) */
  remapIndex: (oldIndex: number) => number
}

function stripParams(p: ShapeParams | undefined): { params: ShapeParams | undefined; had: boolean } {
  if (!p || !('filletRadius' in p)) return { params: p, had: false }
  const { filletRadius: _drop, ...rest } = p as ShapeParams & { filletRadius?: number }
  return { params: rest, had: true }
}

export function migrateLegacyFillet(
  ops: TinkerCraftOperation[],
  objects?: Record<string, SceneObject>,
): LegacyFilletMigration {
  // Найдено ли скругление вообще — без него история возвращается как есть (тот же массив)
  let changed = ops.some((op) => op.type === 'fillet' ||
    ((op.type === 'add_shape' || op.type === 'resize_dims' || op.type === 'edit_child_params') && !!op.params && 'filletRadius' in op.params))

  // Один проход вперёд: edit_step ссылается только на шаги ДО себя — их итоговые индексы уже известны
  const finalIndex: number[] = []        // старый индекс → итоговый (−1 — вырезан)
  const operations: TinkerCraftOperation[] = []
  let removedSteps = 0
  for (const op of ops) {
    if (!changed) break
    if (op.type === 'fillet') { finalIndex.push(-1); removedSteps++; continue }
    let out: TinkerCraftOperation | null = op
    if (op.type === 'add_shape' || op.type === 'resize_dims' || op.type === 'edit_child_params') {
      const s = stripParams(op.params)
      if (s.had) out = { ...op, params: s.params ?? {} }
    } else if (op.type === 'edit_step') {
      const step = finalIndex[op.stepIndex] ?? -1
      const repl = op.replacements.map((r) => ({ ...r, stepIndex: finalIndex[r.stepIndex] ?? -1 }))
      // Правка/замена вырезанного шага теряет смысл — правка выбрасывается
      out = step < 0 || repl.some((r) => r.stepIndex < 0) ? null : { ...op, stepIndex: step, replacements: repl }
    }
    if (out) { finalIndex.push(operations.length); operations.push(out) } else finalIndex.push(-1)
  }

  let outObjects: Record<string, SceneObject> | undefined
  if (objects) {
    outObjects = {}
    for (const [id, o] of Object.entries(objects)) {
      const s = stripParams(o.params)
      if (s.had) changed = true
      outObjects[id] = s.had ? { ...o, params: s.params ?? {} } : o
    }
  }

  const resultOps = operations.length || removedSteps ? operations : ops
  const remapIndex = (oldIndex: number): number => {
    if (resultOps === ops) return Math.min(oldIndex, ops.length)
    let n = 0
    for (let i = 0; i < Math.min(oldIndex, ops.length); i++) if (finalIndex[i] >= 0) n++
    return n
  }
  return { operations: resultOps, objects: outObjects, changed, removedSteps, remapIndex }
}
