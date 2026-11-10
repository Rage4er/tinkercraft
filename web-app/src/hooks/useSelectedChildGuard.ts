// src/hooks/useSelectedChildGuard.ts — сброс устаревшего выбора ребёнка CSG (Фаза 9.1)
//
// selectedChild ссылается на узел Build Tree, а не на объект сцены. После undo/redo,
// удаления, перестройки истории узел может исчезнуть, а выделение уйти на другой объект —
// тогда выбор ребёнка сбрасывается.
import { useEffect } from 'react'
import { useDocumentStore } from '../store/document-store'
import { useUiStore } from '../store/ui-store'
import { getTreeView, findViewNode } from '../csg/tree-view'

export function useSelectedChildGuard(): void {
  const objects = useDocumentStore((s) => s.objects)
  const selectedIds = useDocumentStore((s) => s.selectedIds)
  const selectedChild = useUiStore((s) => s.selectedChild)
  const setSelectedChild = useUiStore((s) => s.setSelectedChild)

  useEffect(() => {
    if (!selectedChild) return
    const { rootId, nodeId } = selectedChild
    const rootAlive = !!objects[rootId] && selectedIds.includes(rootId)
    const view = rootAlive ? getTreeView(rootId) : null
    if (!view || !findViewNode(view, nodeId)) setSelectedChild(null)
  }, [objects, selectedIds, selectedChild, setSelectedChild])
}
