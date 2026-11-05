// ============================================================
// ChildPropertiesPanel — свойства выбранного ребёнка CSG (Фаза 9.2)
// ============================================================
// Показывается вместо PropertiesPanel, когда в дереве компонентов выбран
// ребёнок CSG (ui-store.selectedChild). Правка params примитива пересобирает
// CSG-результат (document-store.editChildParams → операция edit_child_params).

import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import NumInput from './NumInput'
import { useDocumentStore } from '../store/document-store'
import { useUiStore } from '../store/ui-store'
import { getTreeView, findViewNode, type TreeViewNode } from '../csg/tree-view'
import { getParamFields, clampFieldValue, type ParamField } from '../csg/child-params'
import type { ShapeParams } from '../csg/types'

export default function ChildPropertiesPanel() {
  const { t } = useTranslation()
  const selectedChild = useUiStore((s) => s.selectedChild)
  const setSelectedChild = useUiStore((s) => s.setSelectedChild)
  const objects = useDocumentStore((s) => s.objects)
  const busy = useDocumentStore((s) => s.busy)
  const editChildParams = useDocumentStore((s) => s.editChildParams)

  // Дерево не реактивно — снимок пересчитывается при смене objects (правка меняет объект корня).
  const node: TreeViewNode | null = useMemo(() => {
    if (!selectedChild) return null
    const view = getTreeView(selectedChild.rootId)
    return view ? findViewNode(view, selectedChild.nodeId) : null
  }, [selectedChild, objects])

  if (!selectedChild || !node) return null
  const root = objects[selectedChild.rootId]
  const rootName = root?.name ?? t('csg.result')

  const fields = node.editable ? getParamFields(node.shapeType) : []

  const commit = (field: ParamField, v: number) => {
    const value = clampFieldValue(field, v)
    const current = node.params?.[field.key] ?? field.fallback
    if (Math.abs(value - current) < 1e-9) return // blur без изменения — не пишем в историю
    void editChildParams(selectedChild.rootId, selectedChild.nodeId, { [field.key]: value } as ShapeParams)
  }

  const readonlyKey =
    node.notEditableReason === 'boolean' ? 'childProps.readonlyBoolean'
    : node.notEditableReason === 'mirrored' ? 'childProps.readonlyMirrored'
    : node.notEditableReason === 'baked' ? 'childProps.readonlyBaked'
    : null

  return (
    <div data-testid="child-props">
      <div className="props-row">
        <button className="btn btn-compact" onClick={() => setSelectedChild(null)}>
          ← {t('childProps.back')}
        </button>
      </div>
      <div className="props-section-title">{t('childProps.title')}</div>
      <div className="props-row">
        <span className="props-label">{t('childProps.type')}</span>
        <span className="props-value">
          {node.type === 'boolean'
            ? `${t('componentTree.nestedCsg')} · ${t(`csg.${node.operation ?? 'union'}`)}`
            : node.shapeType ? t(`shapes.${node.shapeType}`) : t('componentTree.import')}
        </span>
      </div>
      <div className="text-sm text-muted-xs" style={{ padding: '2px 12px 6px' }}>
        {t('childProps.rootHint', { root: rootName })}
      </div>

      {readonlyKey && (
        <div className="text-sm text-muted-xs" style={{ padding: '6px 12px' }}>{t(readonlyKey)}</div>
      )}

      {fields.length > 0 && (
        <div className="csg-group">
          <div className="csg-group-title">{t('properties.dimensions')}</div>
          {fields.map((f) => (
            <NumInput
              key={`${selectedChild.nodeId}:${f.key}`}
              label={t(f.labelKey)}
              unit={f.integer ? '' : undefined}
              min={f.min}
              value={node.params?.[f.key] ?? f.fallback}
              disabled={busy}
              onChange={(v) => commit(f, v)}
            />
          ))}
          <div className="text-sm text-muted-xs" style={{ padding: '4px 12px' }}>{t('childProps.apply')}</div>
        </div>
      )}
    </div>
  )
}
