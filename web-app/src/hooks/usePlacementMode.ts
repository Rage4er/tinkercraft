// ============================================================
// usePlacementMode — клавиши и согласованность режима размещения (PLUG-AND-PLAY)
// ============================================================
// Клавиши — слушатель на window в фазе capture, раньше общего обработчика App (как у режимов
// «Выровнять» и CSG A → B), только пока режим активен:
//   Esc — отмена (фигура не создаётся; выделение и гизмо не трогаются);
//   Enter — поставить (в превью, без превью — рядом с прошлыми);
//   X / Y / Z (без Ctrl / Alt / Cmd) — плоскость оси YZ / XZ / XY, та же ещё раз — снять
//   (X в режиме — не «Вычитание»; Ctrl+Z — отмена действия, как обычно).
// Событие гасится: Enter не «нажимает» кнопку в фокусе (иконку палитры), Esc не снимает
// выделение. Ввод в поле и открытая модалка — клавиши идут как обычно.
// Вход в «Выровнять», режим CSG A → B или линейку — выход из размещения.

import { useEffect, useRef } from 'react'
import { usePlacementModeStore } from '../store/placement-mode'
import { useAlignModeStore } from '../store/align-mode'
import { useCsgGroupModeStore } from '../store/csg-group-mode'
import { useUiStore } from '../store/ui-store'
import { isTextEntry } from '../hotkeys'
import type { PlacementAxis } from '../store/placement'

const AXIS_KEYS: Record<string, PlacementAxis> = { KeyX: 'X', KeyY: 'Y', KeyZ: 'Z' }

export function usePlacementMode(modalOpen: boolean): void {
  const modalRef = useRef(modalOpen)
  modalRef.current = modalOpen

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const s = usePlacementModeStore.getState()
      if (!s.placementMode || modalRef.current) return
      if (isTextEntry(e.target as Element | null)) return
      const isEnter = e.key === 'Enter' || e.code === 'Enter' || e.code === 'NumpadEnter'
      const isEsc = e.key === 'Escape' || e.code === 'Escape'
      const axis = !e.ctrlKey && !e.metaKey && !e.altKey ? AXIS_KEYS[e.code] : undefined
      if (!isEnter && !isEsc && !axis) return
      e.preventDefault()
      e.stopImmediatePropagation()
      if (e.repeat) return
      if (isEsc) s.cancelPlacement()
      else if (isEnter) void s.confirmPlacement()
      else if (axis) s.toggleAxis(axis)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])

  const alignActive = useAlignModeStore((s) => s.alignMode !== null)
  const csgActive = useCsgGroupModeStore((s) => s.csgGroupMode !== null)
  const rulerActive = useUiStore((s) => s.rulerActive)
  useEffect(() => {
    if (alignActive || csgActive || rulerActive) usePlacementModeStore.getState().cancelPlacement()
  }, [alignActive, csgActive, rulerActive])
}
