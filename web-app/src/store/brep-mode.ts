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
import { isBrepShape, maxBrepSize, type BrepBase, type BrepEdgeLine, type BrepKind, type BrepMesh, type BrepStep } from '../brep/brep-kernel'
import { brepWorkerEdges, brepWorkerFillet } from '../brep/brep-client'
import { notify } from './notifications'
import type { TransformNR } from '../csg/types'

interface BrepModeState {
  active: BrepKind | null
  targetId: string | null
  base: BrepBase | null
  /** FILLET-CHAIN-BREP: предыдущие шаги цепочки (B-Rep результата) */
  steps: BrepStep[]
  transform: TransformNR | null
  edges: BrepEdgeLine[]
  /** Выбранные рёбра (клик по ребру — добавить/убрать, несколько за операцию) */
  selectedEdges: number[]
  hoverEdge: number | null
  size: number
  loading: boolean
  start: (kind: BrepKind, targetId?: string) => Promise<boolean>
  toggleEdge: (index: number) => void
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
  steps: [],
  transform: null,
  edges: [],
  selectedEdges: [],
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
    if (!isBrepShape(obj.shapeType) && !obj.brepChain) {
      notify(i18n.t('brep.unsupported'), 'warning')
      return false
    }
    if (get().active === kind && get().targetId === id) {
      get().cancel()
      return false
    }
    // FILLET-CHAIN-BREP: у объекта с цепочкой B-Rep берём исходный примитив и шаги
    const base: BrepBase = obj.brepChain
      ? { shapeType: obj.brepChain.base.shapeType, params: { ...obj.brepChain.base.params } }
      : { shapeType: obj.shapeType, params: { ...obj.params } }
    const steps: BrepStep[] = obj.brepChain ? obj.brepChain.steps.map((s) => ({ ...s, edgeIndexes: [...s.edgeIndexes] })) : []
    const max = maxBrepSize(base)
    const size = Math.min(2, Number((max * 0.4).toFixed(2)))
    set({
      active: kind, targetId: id, base, steps, transform: { ...obj.transform },
      edges: [], selectedEdges: [], hoverEdge: null, size, loading: true,
    })
    try {
      const edges = await brepWorkerEdges(base, steps)
      if (get().active !== kind || get().targetId !== id) return false
      set({ edges, loading: false })
      return true
    } catch (e) {
      if (get().active === kind) get().cancel()
      notify(i18n.t('brep.error', { message: errorText(e) }), 'error')
      return false
    }
  },

  toggleEdge: (index) => set((st) => ({
    selectedEdges: st.selectedEdges.includes(index)
      ? st.selectedEdges.filter((i) => i !== index)
      : [...st.selectedEdges, index].sort((a, b) => a - b),
  })),
  hover: (index) => set({ hoverEdge: index }),
  setSize: (size) => set({ size }),

  cancel: () => set({
    active: null, targetId: null, base: null, steps: [], transform: null,
    edges: [], selectedEdges: [], hoverEdge: null, loading: false,
  }),

  apply: async () => {
    const { active, targetId, base, steps, size, selectedEdges, transform } = get()
    if (!active || !targetId || !base || !transform) return false
    if (selectedEdges.length === 0) {
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
      const mesh: BrepMesh = await brepWorkerFillet(base, steps, active, size, selectedEdges)
      const ok = await doc.applyBrepFillet({
        targetId, kind: active, size, edgeIndexes: selectedEdges, base, steps, transform, mesh,
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
