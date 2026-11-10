// ============================================================
// useDimensionMode — клавиши и согласованность режима «Размер» и выделения размера (DIMENSIONS)
// ============================================================
// Слушатель на window в фазе capture, раньше общего обработчика App:
//   Esc в режиме «Размер» — выход (событие гасится: выделение не снимается);
//   Delete / Backspace при выделенном размере — удалить размер (а не объекты);
//   Esc при выделенном размере — снять его выделение (дальше — как обычно).
// Ввод в поле и открытая модалка — клавиши идут как обычно.
// Вход в «Выровнять», CSG A → B, размещение или линейку — выход из режима «Размер».
// Выделили объект (сцена, список) — выделение размера снимается (выделение одно).

import { useEffect, useRef } from 'react'
import { useDimensionModeStore, deleteDimension } from '../store/dimension-mode'
import { useDimensionsStore } from '../store/dimensions-store'
import { useAlignModeStore } from '../store/align-mode'
import { useCsgGroupModeStore } from '../store/csg-group-mode'
import { usePlacementModeStore } from '../store/placement-mode'
import { useUiStore } from '../store/ui-store'
import { useDocumentStore } from '../store/document-store'
import { isTextEntry } from '../hotkeys'

export function useDimensionMode(modalOpen: boolean): void {
  const modalRef = useRef(modalOpen)
  modalRef.current = modalOpen

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (modalRef.current || isTextEntry(e.target as Element | null)) return
      const isEsc = e.key === 'Escape' || e.code === 'Escape'
      const isDelete = e.code === 'Delete' || e.code === 'Backspace'
      const mode = useDimensionModeStore.getState()
      if (isEsc && mode.dimensionMode) {
        e.preventDefault()
        e.stopImmediatePropagation()
        mode.exitDimensionMode()
        return
      }
      const selected = useDimensionsStore.getState().selectedDimensionId
      if (!selected) return
      if (isDelete) {
        e.preventDefault()
        e.stopImmediatePropagation()
        deleteDimension(selected)
      } else if (isEsc) {
        useDimensionsStore.getState().selectDimension(null)
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])

  const alignActive = useAlignModeStore((s) => s.alignMode !== null)
  const csgActive = useCsgGroupModeStore((s) => s.csgGroupMode !== null)
  const placing = usePlacementModeStore((s) => s.placementMode !== null)
  const rulerActive = useUiStore((s) => s.rulerActive)
  useEffect(() => {
    if (alignActive || csgActive || placing || rulerActive) useDimensionModeStore.getState().exitDimensionMode()
  }, [alignActive, csgActive, placing, rulerActive])

  const hasObjectSelection = useDocumentStore((s) => s.selectedIds.length > 0)
  useEffect(() => {
    if (hasObjectSelection) useDimensionsStore.getState().selectDimension(null)
  }, [hasObjectSelection])

  // размер выделен, а его объектов уже нет (CSG, удаление, undo) — выделение снимается
  const objects = useDocumentStore((s) => s.objects)
  const dims = useDimensionsStore((s) => s.dimensions)
  const selectedId = useDimensionsStore((s) => s.selectedDimensionId)
  useEffect(() => {
    if (!selectedId) return
    const d = dims.find((x) => x.id === selectedId)
    if (!d || !objects[d.objectIdA] || !objects[d.objectIdB]) useDimensionsStore.getState().selectDimension(null)
  }, [selectedId, dims, objects])
}
