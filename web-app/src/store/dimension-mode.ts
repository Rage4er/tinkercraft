// ============================================================
// dimension-mode.ts — режим «Размер» и действия с размерами (DIMENSIONS)
// ============================================================
// Кнопка «Размер» (D) → режим: клик по точке объекта (вершина / ребро / грань — привязка как у
// линейки) → A, клик по второй → B → размер создан со стилем из «Настроек размеров» (тип,
// цвет, шрифт, высота текста, отступ). Режим остаётся — следующий клик снова A (несколько
// размеров подряд); Esc / правый клик / «Готово» / кнопка ещё раз — выход. A и B могут быть
// на одном объекте (ребро куба). Клик мимо объектов и повтор той же точки — ничего (без
// уведомлений). Не совмещается с «Выровнять», CSG A → B, размещением и линейкой: вход сюда
// выходит из них, их вход — отсюда (`useDimensionMode`). Слой «Размеры» при входе включается.
//
// Действия, меняющие слой (создать / удалить / стиль), помечают документ несохранённым —
// размеры сохраняются в файл, но не в историю (undo их не трогает).

import { create } from 'zustand'
import type { Vec3 } from '../csg/types'
import { useDocumentStore } from './document-store'
import { useUiStore } from './ui-store'
import { useAlignModeStore } from './align-mode'
import { useCsgGroupModeStore } from './csg-group-mode'
import { usePlacementModeStore } from './placement-mode'
import { useDimensionsStore } from './dimensions-store'
import { anchorOf, newDimensionId, type Dimension, type DimensionStyle } from './dimensions'

/** Точка, выбранная в режиме: объект и мировая точка на нём (с привязкой). */
export interface DimensionPick { objectId: string; point: Vec3 }

/** Точка под курсором в режиме: объект, мировая точка, вид привязки (вершина / ребро / …). */
export interface DimensionHover extends DimensionPick { snap: 'vertex' | 'edge' | 'face' | 'circle' | null }

export interface DimensionModeState {
  active: true
  /** Первая точка (A) или null — ждём A. */
  first: DimensionPick | null
  /** Точка под курсором (превью A → курсор, маркер привязки). */
  hover: DimensionHover | null
  /** Сколько размеров создано в этом входе в режим (подсказка). */
  created: number
}

interface DimensionModeStore {
  dimensionMode: DimensionModeState | null
  startDimensionMode: () => void
  exitDimensionMode: () => void
  toggleDimensionMode: () => void
  setHover: (hover: DimensionHover | null) => void
  /** Клик в режиме: нет A — это A; есть — B, размер создан (id) или null (та же точка / объекта нет). */
  clickPoint: (pick: DimensionPick) => string | null
}

const markModified = () => useDocumentStore.setState({ modified: true })

/** Создать размер A → B со стилем и отступом новых размеров. null — объекта нет или точки совпали. */
export function createDimension(a: DimensionPick, b: DimensionPick): Dimension | null {
  const objects = useDocumentStore.getState().objects
  const A = objects[a.objectId], B = objects[b.objectId]
  if (!A || !B) return null
  if (Math.hypot(a.point.x - b.point.x, a.point.y - b.point.y, a.point.z - b.point.z) < 1e-6) return null
  const { style, offset } = useUiStore.getState().dimensionDefaults
  const ea = anchorOf(A, a.point), eb = anchorOf(B, b.point)
  const dim: Dimension = {
    id: newDimensionId(), type: 'linear',
    objectIdA: A.id, pointA: ea.point, boxA: ea.box,
    objectIdB: B.id, pointB: eb.point, boxB: eb.box,
    offset, style: { ...style },
  }
  useDimensionsStore.getState().addDimension(dim)
  markModified()
  return dim
}

/** Удалить размер (корзина в списке / панели, Delete при выделенном размере). */
export function deleteDimension(id: string): void {
  if (!useDimensionsStore.getState().dimensions.some((d) => d.id === id)) return
  useDimensionsStore.getState().removeDimension(id)
  markModified()
}

/** Стиль / отступ размера (панель размера, «Применить к выбранному»). */
export function restyleDimension(id: string, patch: Partial<DimensionStyle> & { offset?: number }): void {
  if (!useDimensionsStore.getState().dimensions.some((d) => d.id === id)) return
  useDimensionsStore.getState().setDimensionStyle(id, patch)
  markModified()
}

export const useDimensionModeStore = create<DimensionModeStore>((set, get) => ({
  dimensionMode: null,

  startDimensionMode: () => {
    useAlignModeStore.getState().exitAlignMode()
    if (useCsgGroupModeStore.getState().csgGroupMode) useCsgGroupModeStore.getState().cancelCsgGroup()
    usePlacementModeStore.getState().cancelPlacement()
    useUiStore.getState().setRulerActive(false)
    const dims = useDimensionsStore.getState()
    dims.setShowDimensions(true)
    dims.selectDimension(null)
    set({ dimensionMode: { active: true, first: null, hover: null, created: 0 } })
  },

  exitDimensionMode: () => { if (get().dimensionMode) set({ dimensionMode: null }) },

  toggleDimensionMode: () => (get().dimensionMode ? get().exitDimensionMode() : get().startDimensionMode()),

  setHover: (hover) => {
    const m = get().dimensionMode
    if (!m) return
    const h = m.hover
    if (h === hover || (h && hover && h.objectId === hover.objectId && h.snap === hover.snap
      && h.point.x === hover.point.x && h.point.y === hover.point.y && h.point.z === hover.point.z)) return
    set({ dimensionMode: { ...m, hover } })
  },

  clickPoint: (pick) => {
    const m = get().dimensionMode
    if (!m) return null
    if (!useDocumentStore.getState().objects[pick.objectId]) return null
    if (!m.first) {
      set({ dimensionMode: { ...m, first: pick } })
      return null
    }
    const dim = createDimension(m.first, pick)
    if (!dim) return null                                    // та же точка — ждём другую B
    set({ dimensionMode: { ...m, first: null, created: m.created + 1 } })
    return dim.id
  },
}))
