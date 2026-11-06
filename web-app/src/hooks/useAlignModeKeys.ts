// ============================================================
// useAlignModeKeys — Esc выходит из режима выравнивания (ALIGN-UI-REVIT)
// ============================================================
// Слушатель на window в фазе capture срабатывает раньше общего обработчика клавиш
// App и гасит событие: Esc в режиме только выходит из него (выделение, гизмо и
// линейка не трогаются). Вне режима Esc идёт дальше как обычно.

import { useEffect } from 'react'
import { useAlignModeStore } from '../store/align-mode'

export function useAlignModeKeys(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape' && e.code !== 'Escape') return
      const s = useAlignModeStore.getState()
      if (!s.alignMode) return
      e.preventDefault()
      e.stopImmediatePropagation()
      s.exitAlignMode()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])
}
