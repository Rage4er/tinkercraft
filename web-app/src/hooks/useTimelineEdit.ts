// src/hooks/useTimelineEdit.ts — Timeline → «править шаг» (Фаза 9.4)
//
// История append-only: правка параметров шага = правка ТЕКУЩЕГО состояния его цели
// (resize_dims для живого объекта, edit_child_params для ребёнка CSG). Хук находит,
// где цель шага живёт сейчас, и выделяет её: объект сцены или ребёнок в дереве
// компонентов (с раскрытием предков) — панель свойств покажет нужную форму.
import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useDocumentStore } from '../store/document-store'
import { useUiStore } from '../store/ui-store'
import { notify } from '../store/notifications'
import { locateNode } from '../csg/tree-view'
import type { TinkerCraftOperation } from '../csg/types'

export function useTimelineEdit(): (op: TinkerCraftOperation) => void {
  const { t } = useTranslation()
  return useCallback((op: TinkerCraftOperation) => {
    const targetId = op.type === 'add_shape' ? op.id : op.type === 'edit_child_params' ? op.nodeId : null
    if (!targetId) return
    const { objects, selectObjects } = useDocumentStore.getState()
    const ui = useUiStore.getState()

    // Живой объект сцены
    if (objects[targetId]) {
      ui.setSelectedChild(null)
      selectObjects([targetId], false)
      return
    }
    // Ребёнок CSG
    const csgIds = Object.keys(objects).filter((id) => objects[id].shapeType === 'csg')
    const loc = locateNode(csgIds, targetId)
    if (!loc) {
      notify(t('timeline.editGone'), 'info')
      return
    }
    selectObjects([loc.rootId], false)
    ui.setSelectedChild({ rootId: loc.rootId, nodeId: targetId })
    for (const id of loc.ancestors) {
      if (!useUiStore.getState().expandedTreeIds[id]) ui.toggleTreeExpanded(id)
    }
    ui.setActiveTab('tree')
  }, [t])
}
