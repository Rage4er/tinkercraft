// ============================================================
// useCsgGroupMode — клавиши и согласованность режима A → B → Enter (CSG-GROUP-FIX)
// ============================================================
// Клавиши — слушатель на window в фазе capture, раньше общего обработчика App (как у
// режима «Выровнять»), только пока режим активен:
//   Enter — «ОК» (A op B), Esc — отмена (выделение снова A). Событие гасится: Esc не снимает
//   выделение и гизмо, Enter не «нажимает» кнопку в фокусе (иначе — второе подтверждение).
//   Ввод в поле (NumInput, название) и открытая модалка — клавиши идут как обычно.
// Объекты A исчезли (undo, удаление) — отбрасываются, A пуста — выход; вход в режим
// «Выровнять» выходит из этого режима (выделение не трогается).

import { useEffect, useRef } from 'react'
import { useCsgGroupModeStore } from '../store/csg-group-mode'
import { useDocumentStore } from '../store/document-store'
import { useAlignModeStore } from '../store/align-mode'
import { isTextEntry } from '../hotkeys'

export function useCsgGroupMode(modalOpen: boolean): void {
  const modalRef = useRef(modalOpen)
  modalRef.current = modalOpen

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const isEnter = e.key === 'Enter' || e.code === 'Enter' || e.code === 'NumpadEnter'
      const isEsc = e.key === 'Escape' || e.code === 'Escape'
      if (!isEnter && !isEsc) return
      const s = useCsgGroupModeStore.getState()
      if (!s.csgGroupMode || modalRef.current) return
      if (isTextEntry(e.target as Element | null)) return
      e.preventDefault()
      e.stopImmediatePropagation()
      if (isEsc) s.cancelCsgGroup()
      else if (!e.repeat) void s.confirmCsgGroup()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])

  const objects = useDocumentStore((s) => s.objects)
  useEffect(() => {
    useCsgGroupModeStore.getState().pruneCsgGroup(objects)
  }, [objects])

  const alignActive = useAlignModeStore((s) => s.alignMode !== null)
  useEffect(() => {
    if (alignActive) useCsgGroupModeStore.getState().cancelCsgGroup(false)
  }, [alignActive])
}
