// ============================================================
// dimensions-store.ts — слой размеров (DIMENSIONS)
// ============================================================
// Размеры — АННОТАЦИИ, а не шаги: живут отдельно от `document-store` (не в `operations` /
// `historyIndex`), undo / redo их не трогает. Объекты, к которым привязан размер, undo может
// убрать и вернуть — размер в это время просто не виден (`isDimensionAlive`), id объектов при
// перестроении из истории сохраняются. В .3dtc, автосохранении и проектах — отдельным полем
// `dimensions`. Стор чистый (не знает про сцену); действия с объектами — `dimension-mode.ts`.

import { create } from 'zustand'
import type { Vec3 } from '../csg/types'
import {
  clampDimensionOffset, clampDimensionSize,
  type Dimension, type DimensionStyle, type LocalBox,
} from './dimensions'

interface DimensionsStore {
  dimensions: Dimension[]
  /** Слой «Размеры» виден (кнопка тулбара «Показать / скрыть размеры»). */
  showDimensions: boolean
  /** Выделенный размер (клик по нему во вьюпорте / в списке) — Delete удаляет его. */
  selectedDimensionId: string | null
  addDimension: (dim: Dimension) => void
  removeDimension: (id: string) => void
  toggleShowDimensions: () => void
  setShowDimensions: (v: boolean) => void
  /** Стиль и / или отступ размера (окно настроек «к выбранному», панель размера). */
  setDimensionStyle: (id: string, patch: Partial<DimensionStyle> & { offset?: number }) => void
  /** Перепривязать концы (точки в системах своих объектов). */
  updateDimensionPoints: (id: string, a: { point: Vec3; box: LocalBox }, b: { point: Vec3; box: LocalBox }) => void
  selectDimension: (id: string | null) => void
  /** Заменить слой целиком (открытие файла / проекта, восстановление сессии). */
  setDimensions: (dims: Dimension[]) => void
}

export const useDimensionsStore = create<DimensionsStore>((set, get) => ({
  dimensions: [],
  showDimensions: true,
  selectedDimensionId: null,

  addDimension: (dim) => set({ dimensions: [...get().dimensions, dim] }),

  removeDimension: (id) => set({
    dimensions: get().dimensions.filter((d) => d.id !== id),
    selectedDimensionId: get().selectedDimensionId === id ? null : get().selectedDimensionId,
  }),

  toggleShowDimensions: () => {
    const show = !get().showDimensions
    set({ showDimensions: show, selectedDimensionId: show ? get().selectedDimensionId : null })
  },

  setShowDimensions: (v) => set({ showDimensions: v, selectedDimensionId: v ? get().selectedDimensionId : null }),

  setDimensionStyle: (id, patch) => set({
    dimensions: get().dimensions.map((d) => {
      if (d.id !== id) return d
      const { offset, ...style } = patch
      const next = { ...d.style, ...style }
      return {
        ...d,
        offset: offset !== undefined ? clampDimensionOffset(offset) : d.offset,
        style: { ...next, size: clampDimensionSize(next.size), units: 'mm' },
      }
    }),
  }),

  updateDimensionPoints: (id, a, b) => set({
    dimensions: get().dimensions.map((d) => (d.id === id ? { ...d, pointA: a.point, boxA: a.box, pointB: b.point, boxB: b.box } : d)),
  }),

  selectDimension: (id) => set({ selectedDimensionId: id }),

  setDimensions: (dims) => set({ dimensions: dims, selectedDimensionId: null }),
}))
