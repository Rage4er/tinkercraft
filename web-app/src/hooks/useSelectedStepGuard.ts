// src/hooks/useSelectedStepGuard.ts — сброс устаревшего выбора шага (Фаза 9.5.2)
//
// selectedStep — сырой индекс шага истории. Выбор сбрасывается, если шаг ушёл за
// historyIndex (undo/перемотка до него), перестал быть редактируемым как шаг (другая
// история после загрузки), пользователь выбрал ребёнка CSG или выделил объекты в сцене.
import { useEffect } from 'react'
import { useDocumentStore } from '../store/document-store'
import { useUiStore } from '../store/ui-store'
import { isStepEditable } from '../store/edit-step'

export function useSelectedStepGuard(): void {
  const operations = useDocumentStore((s) => s.operations)
  const historyIndex = useDocumentStore((s) => s.historyIndex)
  const selectedIds = useDocumentStore((s) => s.selectedIds)
  const selectedStep = useUiStore((s) => s.selectedStep)
  const selectedChild = useUiStore((s) => s.selectedChild)
  const setSelectedStep = useUiStore((s) => s.setSelectedStep)

  useEffect(() => {
    if (selectedStep === null) return
    const op = operations[selectedStep]
    if (selectedStep >= historyIndex || !op || !isStepEditable(op) || selectedChild) setSelectedStep(null)
  }, [operations, historyIndex, selectedStep, selectedChild, setSelectedStep])

  // Новое выделение в сцене — пользователь ушёл к свойствам объекта
  useEffect(() => {
    if (selectedIds.length > 0) useUiStore.getState().setSelectedStep(null)
  }, [selectedIds])
}
