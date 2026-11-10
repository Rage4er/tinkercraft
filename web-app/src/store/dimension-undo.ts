// ============================================================
// dimension-undo.ts — отмена действий с размерами (DIMENSION-UNDO)
// ============================================================
// Размеры — слой аннотаций, не шаги истории документа (в «Историю» не попадают), но Ctrl+Z / Ctrl+Y и
// кнопки «Отменить» / «Повторить» отменяют и возвращают их в общем порядке действий:
//  • каждое действие с размером (создание, удаление, стиль / отступ) — запись в `undoStack` слоя
//    размеров с позицией истории документа `at`, на которой оно сделано (`recordDimensionChange`);
//  • Ctrl+Z: последняя запись размеров сделана на текущей позиции документа (после неё шагов
//    документа не было) — отменяется она; иначе — шаг документа (`undoWithDimensions`);
//  • Ctrl+Y: первая отменённая запись размеров — на текущей позиции документа — возвращается она;
//    иначе — шаг документа (`redoWithDimensions`). Так «удалил размер → сдвинул куб → Ctrl+Z, Ctrl+Z»
//    отменяет сначала сдвиг, потом удаление, а Ctrl+Y — в обратном порядке;
//  • новое действие с размером — redo размеров пуст; новый шаг документа — redo размеров пуст, записи
//    «из будущего» (позиция за точкой ветвления) — отброшены; другой документ (открытие файла / проекта,
//    очистка сцены, её отмена) — стек размеров пуст (`setDimensions` — тоже).

import { useDimensionsStore, type DimensionHistoryEntry } from './dimensions-store'
import { useDocumentStore } from './document-store'
import type { Dimension } from './dimensions'

const docIndex = () => useDocumentStore.getState().historyIndex

/** Записать действие с размером (вызывают `createDimension` / `deleteDimension` / `restyleDimension`). */
export function recordDimensionChange(kind: DimensionHistoryEntry['kind'], before: Dimension | null, after: Dimension | null, index: number): void {
  const s = useDimensionsStore.getState()
  s.setDimensionHistory([...s.undoStack, { kind, at: docIndex(), index, before, after }], [])
}

/** Ctrl+Z отменит действие с размером (а не шаг документа) — последняя запись на текущей позиции документа. */
export function canUndoDimension(undoStack: readonly DimensionHistoryEntry[], historyIndex: number): boolean {
  const top = undoStack[undoStack.length - 1]
  return top !== undefined && top.at === historyIndex
}

/** Ctrl+Y вернёт действие с размером — последняя отменённая запись на текущей позиции документа. */
export function canRedoDimension(redoStack: readonly DimensionHistoryEntry[], historyIndex: number): boolean {
  const top = redoStack[redoStack.length - 1]
  return top !== undefined && top.at === historyIndex
}

/** Слой размеров в состояние `target` для записи (null — размера нет). */
function applyDimensionState(id: string, target: Dimension | null, index: number, kind: DimensionHistoryEntry['kind']): void {
  const s = useDimensionsStore.getState()
  const list = s.dimensions
  const at = list.findIndex((d) => d.id === id)
  if (target === null) {
    if (at >= 0) s.removeDimension(id)
    return
  }
  if (at < 0) {
    const next = [...list]
    next.splice(Math.min(index, next.length), 0, target)
    useDimensionsStore.setState({ dimensions: next })
    return
  }
  // стиль: возвращаются стиль и отступ (точки могли перепривязаться позже — их не трогаем)
  const merged: Dimension = kind === 'restyle' ? { ...list[at], style: { ...target.style }, offset: target.offset } : target
  useDimensionsStore.setState({ dimensions: list.map((d, i) => (i === at ? merged : d)) })
}

function markModified(): void {
  if (!useDocumentStore.getState().modified) useDocumentStore.setState({ modified: true })
}

/** Отменить последнее действие с размером. false — отменять нечего (на этой позиции документа). */
export function undoDimensionChange(): boolean {
  const s = useDimensionsStore.getState()
  if (!canUndoDimension(s.undoStack, docIndex())) return false
  const e = s.undoStack[s.undoStack.length - 1]
  const id = (e.before ?? e.after)!.id
  applyDimensionState(id, e.before, e.index, e.kind)
  const t = useDimensionsStore.getState()
  t.setDimensionHistory(t.undoStack.slice(0, -1), [...t.redoStack, e])
  markModified()
  return true
}

/** Вернуть последнее отменённое действие с размером. false — возвращать нечего. */
export function redoDimensionChange(): boolean {
  const s = useDimensionsStore.getState()
  if (!canRedoDimension(s.redoStack, docIndex())) return false
  const e = s.redoStack[s.redoStack.length - 1]
  const id = (e.after ?? e.before)!.id
  applyDimensionState(id, e.after, e.index, e.kind)
  const t = useDimensionsStore.getState()
  t.setDimensionHistory([...t.undoStack, e], t.redoStack.slice(0, -1))
  markModified()
  return true
}

/** Ctrl+Z / «Отменить»: действие с размером на текущей позиции документа — его, иначе шаг документа. */
export async function undoWithDimensions(): Promise<void> {
  if (useDocumentStore.getState().busy) return
  if (undoDimensionChange()) return
  await useDocumentStore.getState().undo()
}

/** Ctrl+Y / «Повторить»: отменённое действие с размером на текущей позиции — его, иначе шаг документа. */
export async function redoWithDimensions(): Promise<void> {
  if (useDocumentStore.getState().busy) return
  if (redoDimensionChange()) return
  await useDocumentStore.getState().redo()
}

// Новый шаг документа — redo размеров пуст, записи за точкой ветвления отброшены; другой документ
// (открыт файл / проект, сцена очищена или очистка отменена) — стек размеров пуст.
useDocumentStore.subscribe((s, prev) => {
  if (s.operations === prev.operations) return
  const d = useDimensionsStore.getState()
  if (d.undoStack.length === 0 && d.redoStack.length === 0) return
  const sameDocument = s.operations.length > 0 && prev.operations.length > 0 && s.operations[0] === prev.operations[0]
  if (!sameDocument) { d.setDimensionHistory([], []); return }
  d.setDimensionHistory(d.undoStack.filter((e) => e.at <= prev.historyIndex), [])
})
