// ============================================================
// align-mode.ts — режим выравнивания как в Revit (ALIGN-UI-REVIT)
// ============================================================
// Одна кнопка «Выровнять» → режим: плоскость A (клик по грани объекта или кнопка
// X/Y/Z) → клик по грани B → B сдвигается вдоль нормали плоскости, его грань ложится
// в плоскость A. «Множественное» — после B режим и плоскость остаются (B2, B3… в ту же
// плоскость). Esc / правый клик / «Готово» — выход.
//
// Геометрия — `helpers.solvePlaneAlignDelta` (реальная геометрия, как у ALIGN-REVIT);
// запись в историю — обычный шаг move (`moveObject`), он воспроизводится и правится ✎.

import { create } from 'zustand'
import type { Vec3 } from '../csg/types'
import { useDocumentStore } from './document-store'
import { useUiStore } from './ui-store'
import { notify } from './notifications'
import { axisPlane, solvePlaneAlignDelta, type WorldPlane } from './helpers'
import i18n from '../i18n'

/** Плоскость режима: грань объекта A (мировая нормаль + точка) или ось X/Y/Z. */
export type AlignModePlane =
  | { normal: Vec3; point: Vec3; objectId: string; triangleIndex?: number }
  | { axis: 'X' | 'Y' | 'Z' }

/** Попадание луча в треугольник (мировые нормаль грани и точка). */
export interface FacePick {
  objectId: string
  triangleIndex: number
  normal: Vec3
  point: Vec3
}

/** Грань под курсором. */
export interface HoveredFace { objectId: string; triangleIndex: number; normal?: Vec3 }

export interface AlignModeState {
  active: true
  plane: AlignModePlane | null
  /** Галочка «Множественное»: после B режим и плоскость остаются. */
  multiple: boolean
  /** Подсвеченная грань под курсором (нормаль — для подсказок/e2e). */
  hoveredFace: HoveredFace | null
  /** Сколько объектов выровнено в этой плоскости (подсказка «Выровнено…»). */
  alignedCount: number
}

interface AlignModeStore {
  alignMode: AlignModeState | null
  startAlignMode: () => void
  setPlane: (plane: AlignModePlane | null) => void
  setHoveredFace: (face: HoveredFace | null) => void
  /** Выровнять объект B по текущей плоскости. `true` — сдвинут (или уже был в плоскости). */
  applyAlignB: (pick: FacePick) => Promise<boolean>
  /** Клик по грани в режиме: нет плоскости → это грань A, есть → это грань B. */
  clickFace: (pick: FacePick) => Promise<void>
  toggleMultiple: () => void
  exitAlignMode: () => void
}

/** Мировая плоскость режима. */
export function resolvePlane(plane: AlignModePlane): WorldPlane {
  return 'axis' in plane ? axisPlane(plane.axis) : { normal: plane.normal, point: plane.point }
}

/** Ключ i18n подсказки по состоянию режима. */
export function alignHintKey(m: AlignModeState): 'alignMode.hintPlane' | 'alignMode.hintFaceB' | 'alignMode.hintAligned' {
  if (!m.plane) return 'alignMode.hintPlane'
  return m.multiple && m.alignedCount > 0 ? 'alignMode.hintAligned' : 'alignMode.hintFaceB'
}

export const useAlignModeStore = create<AlignModeStore>((set, get) => ({
  alignMode: null,

  startAlignMode: () => {
    // режим не совмещается с линейкой и гизмо
    const ui = useUiStore.getState()
    ui.setRulerActive(false)
    ui.setGizmoMode('none')
    set({ alignMode: { active: true, plane: null, multiple: get().alignMode?.multiple ?? false, hoveredFace: null, alignedCount: 0 } })
  },

  setPlane: (plane) => {
    const m = get().alignMode
    if (!m) return
    set({ alignMode: { ...m, plane, alignedCount: 0 } })
  },

  setHoveredFace: (face) => {
    const m = get().alignMode
    if (!m) return
    const h = m.hoveredFace
    if (h === face || (h && face && h.objectId === face.objectId && h.triangleIndex === face.triangleIndex)) return
    set({ alignMode: { ...m, hoveredFace: face } })
  },

  applyAlignB: async (pick) => {
    const m = get().alignMode
    if (!m?.plane) return false
    const doc = useDocumentStore.getState()
    if (doc.busy) return false
    const obj = doc.objects[pick.objectId]
    if (!obj) return false
    if ('objectId' in m.plane && m.plane.objectId === pick.objectId) {
      notify(i18n.t('alignMode.sameObject'), 'info')
      return false
    }
    if (obj.locked) {
      notify(i18n.t('alignMode.locked'), 'warning')
      return false
    }
    const d = solvePlaneAlignDelta(obj, resolvePlane(m.plane), { normal: pick.normal, point: pick.point })
    const t = obj.transform
    // moveObject сам пропускает нулевой сдвиг (объект уже в плоскости)
    await doc.moveObject(pick.objectId, { ...t, x: t.x + d.x, y: t.y + d.y, z: t.z + d.z })
    const after = get().alignMode
    if (!after) return true
    if (after.multiple) set({ alignMode: { ...after, alignedCount: after.alignedCount + 1, hoveredFace: null } })
    else set({ alignMode: null })
    return true
  },

  clickFace: async (pick) => {
    const m = get().alignMode
    if (!m) return
    if (!m.plane) {
      get().setPlane({ normal: pick.normal, point: pick.point, objectId: pick.objectId, triangleIndex: pick.triangleIndex })
      return
    }
    await get().applyAlignB(pick)
  },

  toggleMultiple: () => {
    const m = get().alignMode
    if (!m) return
    set({ alignMode: { ...m, multiple: !m.multiple } })
  },

  exitAlignMode: () => set({ alignMode: null }),
}))
