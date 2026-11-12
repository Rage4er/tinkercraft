// ============================================================
// ChildPropertiesPanel — свойства выбранного ребёнка CSG (Фаза 9.2)
// ============================================================
// Показывается вместо PropertiesPanel, когда в дереве компонентов выбран
// ребёнок CSG (ui-store.selectedChild). Правка params примитива пересобирает
// CSG-результат (document-store.editChildParams → операция edit_child_params).

import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSettingsStore } from '../store/settings'
import { unitLabelKey } from '../store/units'
import NumInput from './NumInput'
import { useDocumentStore } from '../store/document-store'
import { useUiStore } from '../store/ui-store'
import { getTreeView, findViewNode, reasonFromRootFailure, type TreeViewNode, type NotEditableReason } from '../csg/tree-view'
import { getParamFields, clampFieldValue, type ParamField } from '../csg/child-params'
import { checkChildEditable, editFailureKey, type EditChildFailure } from '../store/edit-child'
import type { ShapeParams } from '../csg/types'

export default function ChildPropertiesPanel() {
  const { t } = useTranslation()
  const lengthUnit = useSettingsStore((s) => s.units)   // APP-SETTINGS: «Размеры (см)»
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

  // Фаза 9.9: заранее проверяем, что дерево воспроизводит меш (иначе правка будет отклонена).
  // undefined — проверка идёт; null — править можно; иначе причина. Повторяется после
  // каждой правки/перемотки (меняется objects/operations).
  const operations = useDocumentStore((s) => s.operations)
  const historyIndex = useDocumentStore((s) => s.historyIndex)
  const [check, setCheck] = useState<EditChildFailure | null | undefined>(undefined)
  const canCheck = !!selectedChild && !!node && node.editable
  useEffect(() => {
    if (!selectedChild || !canCheck) { setCheck(undefined); return }
    let cancelled = false
    setCheck(undefined)
    void checkChildEditable({
      rootId: selectedChild.rootId, nodeId: selectedChild.nodeId, objects, operations, historyIndex,
    }).then((r) => { if (!cancelled) setCheck(r) })
    return () => { cancelled = true }
  }, [selectedChild, canCheck, objects, operations, historyIndex])

  if (!selectedChild || !node) return null
  const root = objects[selectedChild.rootId]
  const rootName = root?.name ?? t('csg.result')

  // Причина недоступности: статическая (тип узла) либо свойство корня (проверка выше).
  const reason: NotEditableReason = node.notEditableReason ?? reasonFromRootFailure(check)
  // Прочие сбои проверки (корень исчез, ошибка воркера) — общее сообщение
  const otherFailure = reason === null && node.editable && check ? check : null
  const fields = reason === null && !otherFailure ? getParamFields(node.shapeType) : []

  const commit = (field: ParamField, v: number) => {
    const value = clampFieldValue(field, v)
    const current = node.params?.[field.key] ?? field.fallback
    if (Math.abs(value - current) < 1e-9) return // blur без изменения — не пишем в историю
    void editChildParams(selectedChild.rootId, selectedChild.nodeId, { [field.key]: value } as ShapeParams)
  }

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

      {/* 9.9: недоступная правка — сообщение с причиной вместо формы */}
      {reason !== null && (
        <div className="csg-group" data-testid="child-not-editable" data-reason={reason}>
          <div className="csg-group-title">{t('properties.not_editable_title')}</div>
          <div className="text-sm text-warning" style={{ padding: '4px 12px 8px' }}>
            {t('properties.not_editable_body', { reason: t(`tree.reason.${reason}`) })}
          </div>
        </div>
      )}
      {otherFailure && (
        <div className="text-sm text-warning" data-testid="child-unavailable" style={{ padding: '6px 12px' }}>
          {t(`errors.editChild.${editFailureKey(otherFailure)}`)}
        </div>
      )}

      {reason === null && node.editable && check === undefined && !busy && (
        <div className="text-sm text-muted-xs" data-testid="child-check" style={{ padding: '6px 12px' }}>{t('childProps.checking')}</div>
      )}
      {busy && (
        <div className="text-sm text-muted-xs" data-testid="child-busy" style={{ padding: '6px 12px' }}>{t('childProps.recomputing')}</div>
      )}

      {fields.length > 0 && (
        <div className="csg-group" data-testid="child-form">
          <div className="csg-group-title">{t('properties.dimensions', { unit: t(unitLabelKey(lengthUnit)) })}</div>
          {fields.map((f) => (
            <NumInput
              key={`${selectedChild.nodeId}:${f.key}`}
              label={t(f.labelKey)}
              unit={f.integer || f.unitless ? '' : undefined}
              integer={f.integer}
              min={f.min}
              value={node.params?.[f.key] ?? f.fallback}
              disabled={busy || check !== null}
              onChange={(v) => commit(f, v)}
            />
          ))}
          <div className="text-sm text-muted-xs" style={{ padding: '4px 12px' }}>{t('childProps.apply')}</div>
        </div>
      )}
    </div>
  )
}
