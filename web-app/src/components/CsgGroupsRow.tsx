// ============================================================
// CsgGroupsRow — группы A/B для вычитания и пересечения (N-ARY-CSG)
// ============================================================
// Под кнопками CSG в панели свойств: «Группа A» / «Группа B» назначают текущее
// выделение группой (число — сколько в ней объектов), «×» — сбросить. Вычитание и
// пересечение считают union(A) op union(B) — ОДИН CSG; заданная одна группа — вторая
// берётся из выделения. Без групп: первый выбранный против остальных.

import React from 'react'
import { useTranslation } from 'react-i18next'
import { useUiStore } from '../store/ui-store'
import { useDocumentStore } from '../store/document-store'
import { aliveGroups, assignCsgGroup, EMPTY_CSG_GROUPS } from '../store/csg-operands'

export default function CsgGroupsRow({ disabled }: { disabled: boolean }): React.ReactElement {
  const { t } = useTranslation()
  const groups = useUiStore((s) => s.csgGroups)
  const setGroups = useUiStore((s) => s.setCsgGroups)
  const selectedIds = useDocumentStore((s) => s.selectedIds)
  const objects = useDocumentStore((s) => s.objects)
  const { a, b } = aliveGroups(groups, objects)
  const any = a.length + b.length > 0
  const assign = (which: 'a' | 'b') => setGroups(assignCsgGroup(aliveGroups(groups, objects), which, selectedIds))

  const btn = (which: 'a' | 'b', count: number) => {
    const label = t(which === 'a' ? 'csg.groupA' : 'csg.groupB')
    return (
      <button
        type="button"
        className={`btn btn-compact${count > 0 ? ' active' : ''}`}
        data-testid={`csg-group-${which}`}
        aria-label={label}
        title={t(which === 'a' ? 'csg.groupATip' : 'csg.groupBTip')}
        disabled={disabled || selectedIds.length === 0}
        onClick={() => assign(which)}
      >
        {count > 0 ? `${label} · ${count}` : label}
      </button>
    )
  }

  return (
    <div data-testid="csg-groups">
      <div className="props-row" style={{ gap: 4, marginTop: 4 }}>
        {btn('a', a.length)}
        {btn('b', b.length)}
        {any && (
          <button
            type="button"
            className="btn btn-compact"
            data-testid="csg-groups-clear"
            aria-label={t('csg.groupsClear')}
            title={t('csg.groupsClear')}
            disabled={disabled}
            onClick={() => setGroups(EMPTY_CSG_GROUPS)}
          >
            ×
          </button>
        )}
      </div>
      <div className="text-sm text-muted-xs" data-testid="csg-groups-hint" style={{ padding: '2px 0 0' }}>
        {t(any ? 'csg.groupsHintActive' : 'csg.groupsHint')}
      </div>
    </div>
  )
}
