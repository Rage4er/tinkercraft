// ============================================================
// child-view-source.ts — данные ребёнка для маленького окна (тот же renderer/scene)
// ============================================================
// ChildView (UI) кладёт сюда меш ребёнка и DOM-хост тела окна; Viewport3D
// рисует маленькое окно тем же WebGLRenderer и той же сценой (setViewport +
// временные материалы), без второй сцены/renderer.

import { create } from 'zustand'
import type { ExtractedMesh } from '../csg/types'

interface ChildViewSourceState {
  child: ExtractedMesh | null
  rootId: string | null
  /** Тело окна (div) — область рендера и цель OrbitControls */
  host: HTMLDivElement | null
  setSource: (v: { child: ExtractedMesh | null; rootId: string | null }) => void
  setHost: (host: HTMLDivElement | null) => void
  reset: () => void
}

export const useChildViewSource = create<ChildViewSourceState>((set) => ({
  child: null,
  rootId: null,
  host: null,
  setSource: ({ child, rootId }) => set({ child, rootId }),
  setHost: (host) => set({ host }),
  reset: () => set({ child: null, rootId: null, host: null }),
}))
