// ============================================================
// brep-mode.ts — FILLET-CHAMFER-BREP: режим выбора ребра + применение
// ============================================================
// Вход — «Скругление» / «Фаска» в тулбаре при выбранном примитиве (куб, цилиндр,
// конус, сфера). Режим грузит рёбра B-Rep (OCCT-воркер), подсвечивает выбранное,
// после «Применить» пересчитывает меш и пишет шаг `fillet_brep` в историю.
// CSG (manifold) и B-Rep (OCCT) не смешиваются: цель — только примитив.

import { create } from 'zustand'
import i18n from '../i18n'
import { useDocumentStore } from './document-store'
import { isBrepShape, maxBrepSize, type BrepBase, type BrepEdgeLine, type BrepKind, type BrepMesh } from '../brep/brep-kernel'
import { brepWorkerEdges, brepWorkerFillet } from '../brep/brep-client'
import { notify } from './notifications'
import type { TransformNR } from '../csg/types'

interface BrepModeState {
  active: BrepKind | null
  targetId: string | null
  base: BrepBase | null
  transform: TransformNR | null
  edges: BrepEdgeLine[]
  selectedEdge: number | null
  hoverEdge: number | null
  size: number
  loading: boolean
  start: (kind: BrepKind, targetId?: string) => Promise<boolean>
  pick: (index: number | null) => void
  hover: (index: number | null) => void
  setSize: (size: number) => void
  cancel: () => void
  apply: () => Promise<boolean>
}

const errorText = (e: unknown): string => e instanceof Error ? e.message : String(e)

export const useBrepModeStore = create<BrepModeState>((set, get) => ({
  active: null,
  targetId: null,
  base: null,
  transform: null,
  edges: [],
  selectedEdge: null,
  hoverEdge: null,
  size: 2,
  loading: false,

  start: async (kind, targetId) => {
    const doc = useDocumentStore.getState()
    const id = targetId ?? doc.selectedIds[0]
    const obj = id ? doc.objects[id] : undefined
    if (!obj) {
      notify(i18n.t('brep.selectObject'), 'warning')
      return false
    }
    if (obj.locked) {
      notify(i18n.t('lock.cantMove'), 'warning')
      return false
    }
    if (!isBrepShape(obj.shapeType)) {
      notify(i18n.t('brep.unsupported'), 'warning')
      return false
    }
    if (get().active === kind && get().targetId === id) {
      get().cancel()
      return false
    }
    const base: BrepBase = { shapeType: obj.shapeType, params: { ...obj.params } }
    const max = maxBrepSize(base)
    const size = Math.min(2, Number((max * 0.4).toFixed(2)))
    set({
      active: kind, targetId: id, base, transform: { ...obj.transform },
      edges: [], selectedEdge: null, hoverEdge: null, size, loading: true,
    })
    try {
      const edges = await brepWorkerEdges(base)
      if (get().active !== kind || get().targetId !== id) return false
      set({ edges, loading: false })
      return true
    } catch (e) {
      if (get().active === kind) get().cancel()
      notify(i18n.t('brep.error', { message: errorText(e) }), 'error')
      return false
    }
  },

  pick: (index) => set({ selectedEdge: index }),
  hover: (index) => set({ hoverEdge: index }),
  setSize: (size) => set({ size }),

  cancel: () => set({
    active: null, targetId: null, base: null, transform: null,
    edges: [], selectedEdge: null, hoverEdge: null, loading: false,
  }),

  apply: async () => {
    const { active, targetId, base, size, selectedEdge, transform } = get()
    if (!active || !targetId || !base || !transform) return false
    if (selectedEdge === null) {
      notify(i18n.t('brep.selectEdge'), 'warning')
      return false
    }
    const doc = useDocumentStore.getState()
    if (doc.busy) return false
    const obj = doc.objects[targetId]
    if (!obj) { get().cancel(); return false }
    const max = maxBrepSize(base)
    if (!Number.isFinite(size) || size <= 0 || size > max + 1e-9) {
      notify(i18n.t('brep.sizeRange', { max: Number(max.toFixed(2)) }), 'warning')
      return false
    }
    try {
      const mesh: BrepMesh = await brepWorkerFillet(base, active, size, [selectedEdge])
      const ok = await doc.applyBrepFillet({
        targetId, kind: active, size, edgeIndexes: [selectedEdge], base, transform, mesh,
        name: i18n.t(active === 'fillet' ? 'brep.filletName' : 'brep.chamferName', { name: obj.name ?? i18n.t(`shapes.${obj.shapeType}`) }),
      })
      if (ok) get().cancel()
      return ok
    } catch (e) {
      notify(i18n.t('brep.error', { message: errorText(e) }), 'error')
      return false
    }
  },
}))
