// ============================================================
// useBrepModeKeys.ts — FILLET-CHAMFER-BREP: Esc выходит из режима
// ============================================================
// Capture-фаза, раньше общих сочетаний App (как align/размер): Esc в режиме
// выбора ребра не снимает выделение и не закрывает модалки, а отменяет режим.

import { useEffect } from 'react'
import { useBrepModeStore } from '../store/brep-mode'

export function useBrepModeKeys(modalOpen: boolean): void {
  useEffect(() => {
    if (modalOpen) return
    const onKey = (e: KeyboardEvent) => {
      const st = useBrepModeStore.getState()
      if (!st.active || e.key !== 'Escape') return
      if (e.target instanceof HTMLElement && (e.target.isContentEditable || e.target.closest('input, textarea, select'))) return
      e.preventDefault()
      e.stopPropagation()
      st.cancel()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [modalOpen])
}
