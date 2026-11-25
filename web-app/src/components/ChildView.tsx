// ============================================================
// ChildView.tsx — CSG-CHILD-VIEW: маленькое окно выбранного ребёнка CSG
// ============================================================
// Открывается при выборе ребёнка в дереве (ui-store.selectedChild + childViewOpen):
// показывает только ребёнка заливкой, остальной CSG — каркасом; камера вписана
// в ребёнка. Меш ребёнка пересобирается из Build Tree при правке параметров
// (root CSG меняет вершины). Закрытие — ×; выбор ребёнка снова открывает окно.

import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useUiStore } from '../store/ui-store'
import { useDocumentStore } from '../store/document-store'
import { getNode, rebuildNodeForView } from '../csg/history-tree'
import { formatParams, formatThreadParams } from '../csg/tree-view'
import ChildViewScene from './ChildViewScene'
import type { ExtractedMesh } from '../csg/types'

export default function ChildView() {
  const { t } = useTranslation()
  const selectedChild = useUiStore((s) => s.selectedChild)
  const childViewOpen = useUiStore((s) => s.childViewOpen)
  const setChildViewOpen = useUiStore((s) => s.setChildViewOpen)
  const root = useDocumentStore((s) => (selectedChild ? s.objects[selectedChild.rootId] : undefined))
  const [mesh, setMesh] = useState<ExtractedMesh | null>(null)
  const [error, setError] = useState<string | null>(null)

  const nodeId = selectedChild?.nodeId ?? null
  const verts = root?.vertices
  const inds = root?.indices

  // Меш ребёнка — из Build Tree (без кэша узла); пересобирается при правке CSG
  useEffect(() => {
    if (!nodeId) { setMesh(null); return }
    let alive = true
    setError(null)
    rebuildNodeForView(nodeId)
      .then((m) => { if (alive) setMesh(m) })
      .catch((e) => { if (alive) { setMesh(null); setError(e instanceof Error ? e.message : String(e)) } })
    return () => { alive = false }
  }, [nodeId, verts, inds])

  const info = useMemo(() => {
    if (!nodeId) return null
    const node = getNode(nodeId)
    if (!node) return null
    const kind = node.type === 'thread'
      ? t('threadModal.title')
      : node.type === 'boolean'
        ? t('componentTree.nestedCsg')
        : node.shapeType
          ? t(`shapes.${node.shapeType}`)
          : t('componentTree.import')
    const summary = node.type === 'thread'
      ? formatThreadParams(node.threadParams)
      : node.params ? formatParams(node.params, node.shapeType) : ''
    return { kind, summary }
  }, [nodeId, t, verts, inds])

  if (!selectedChild || !childViewOpen || !root) return null

  return (
    <div className="child-view" data-testid="child-view" data-node-id={selectedChild.nodeId}>
      <div className="child-view-header">
        <span className="child-view-title" title={t('childView.title')}>
          {t('childView.title')}{info ? ` · ${info.kind}` : ''}
          {info?.summary ? <span className="child-view-summary"> {info.summary}</span> : null}
        </span>
        <button
          type="button"
          className="child-view-close"
          data-testid="child-view-close"
          aria-label={t('childView.close')}
          title={t('childView.close')}
          onClick={() => setChildViewOpen(false)}
        >
          ×
        </button>
      </div>
      {error
        ? <div className="child-view-state" data-testid="child-view-error">{t('childView.error')}</div>
        : mesh
          ? <ChildViewScene child={mesh} root={{ vertices: root.vertices, indices: root.indices }} color={root.color} />
          : <div className="child-view-state" data-testid="child-view-loading">{t('childView.loading')}</div>}
    </div>
  )
}
