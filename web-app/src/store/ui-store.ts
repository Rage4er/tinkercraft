// ============================================================
// UI Store — Zustand store for UI-only state (Q-R6-1)
// Extracts ~16 useState calls from App.tsx into a single store
// for better maintainability and cross-component sharing.
// ============================================================

import { create } from 'zustand/react'
import type { GizmoMode } from '../components/Viewport3D'
import type { SceneObject } from '../csg/types'
import { DEFAULT_FILTERS } from '../constants'

export interface UiStore {
  // Performance
  fps: number
  setFps: (v: number) => void

  // Worker
  workerOk: boolean
  setWorkerOk: (v: boolean) => void

  // Gizmo
  gizmoMode: GizmoMode
  setGizmoMode: (mode: GizmoMode | ((prev: GizmoMode) => GizmoMode)) => void

  // Snap
  snapValue: number
  setSnapValue: (v: number) => void

  // Theme
  theme: 'dark' | 'light'
  setTheme: (t: 'dark' | 'light') => void

  // Timeline filters
  tlFilters: Record<string, boolean>
  setTlFilter: (key: string, checked: boolean) => void

  // Fillet
  filletRadius: number
  setFilletRadius: (v: number) => void

  // Shape search
  shapeSearch: string
  setShapeSearch: (v: string) => void

  // Ruler
  rulerActive: boolean
  setRulerActive: (v: boolean | ((prev: boolean) => boolean)) => void
  rulerDist: number | null
  setRulerDist: (v: number | null) => void

  // Modals
  showPM: boolean
  setShowPM: (v: boolean) => void
  showTextModal: boolean
  setShowTextModal: (v: boolean) => void

  // Extrude
  extrudeAxis: 'X' | 'Y' | 'Z'
  setExtrudeAxis: (v: 'X' | 'Y' | 'Z') => void
  extrudeDepth: number
  setExtrudeDepth: (v: number) => void

  // Mirror preview (MIRROR-2) — единый preview-объект
  previewObject: (SceneObject & { isMirrorPreview: boolean }) | null
  setPreviewObject: (obj: (SceneObject & { isMirrorPreview: boolean }) | null) => void
  // Mirror plane visualizer (MIRROR-4): which plane to show as 3D indicator
  mirrorPreviewPlane: 'XY' | 'XZ' | 'YZ' | null
  setMirrorPreviewPlane: (plane: 'XY' | 'XZ' | 'YZ' | null) => void

  // Panels
  activeTab: 'objects' | 'tree'
  setActiveTab: (v: 'objects' | 'tree') => void
  cameraMode: 'perspective' | 'orthographic'
  setCameraMode: (v: 'perspective' | 'orthographic' | ((prev: 'perspective' | 'orthographic') => 'perspective' | 'orthographic')) => void
}

export const useUiStore = create<UiStore>((set) => ({
  fps: 0,
  setFps: (v) => set({ fps: v }),

  workerOk: false,
  setWorkerOk: (v) => set({ workerOk: v }),

  gizmoMode: 'none',
  setGizmoMode: (mode) =>
    set((s) => {
      const next = typeof mode === 'function' ? (mode as (prev: GizmoMode) => GizmoMode)(s.gizmoMode) : mode
      // FIX (LOW-18-5): Runtime validation — reject invalid gizmo modes
      const validModes: GizmoMode[] = ['none', 'translate', 'rotate', 'scale']
      if (!validModes.includes(next)) {
        console.warn(`[ui-store] Invalid gizmoMode: "${next}", ignoring`)
        return s
      }
      return { ...s, gizmoMode: next }
    }),

  snapValue: 1,
  setSnapValue: (v) => set({ snapValue: v }),

  theme: 'dark',
  setTheme: (t) => set({ theme: t }),

  tlFilters: DEFAULT_FILTERS,
  setTlFilter: (key, checked) =>
    set((s) => ({ tlFilters: { ...s.tlFilters, [key]: checked } })),

  filletRadius: 2,
  setFilletRadius: (v) => set({ filletRadius: v }),

  shapeSearch: '',
  setShapeSearch: (v) => set({ shapeSearch: v }),

  rulerActive: false,
  setRulerActive: (v) =>
    set((s) => ({ rulerActive: typeof v === 'function' ? v(s.rulerActive) : v })),
  rulerDist: null,
  setRulerDist: (v) => set({ rulerDist: v }),

  showPM: false,
  setShowPM: (v) => set({ showPM: v }),
  showTextModal: false,
  setShowTextModal: (v) => set({ showTextModal: v }),

  extrudeAxis: 'Y',
  setExtrudeAxis: (v) => set({ extrudeAxis: v }),
  extrudeDepth: 10,
  setExtrudeDepth: (v) => set({ extrudeDepth: v }),

  activeTab: 'objects',
  setActiveTab: (v) => set({ activeTab: v }),
  cameraMode: 'perspective',
  setCameraMode: (v) =>
    set((s) => ({ cameraMode: typeof v === 'function' ? v(s.cameraMode) : v })),

  // Mirror preview (MIRROR-2) — единый preview-объект
  previewObject: null,
  setPreviewObject: (obj) => set({ previewObject: obj }),
  // Mirror plane visualizer (MIRROR-4)
  mirrorPreviewPlane: null,
  setMirrorPreviewPlane: (plane) => set({ mirrorPreviewPlane: plane }),
}))
