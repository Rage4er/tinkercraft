// ============================================================
// AlignPanel — панель режима выравнивания (ALIGN-UI-REVIT)
// ============================================================
// Показывается справа вместо свойств, пока режим активен (как StepPanel).
// Подсказка по шагу, плоскость по оси X / Y / Z (радиогруппа), текущая плоскость,
// «Выбрать другую плоскость», галочка «Множественное», «Готово (Esc)».

import React from 'react'
import { useTranslation } from 'react-i18next'
import { useAlignModeStore, alignHintKey } from '../store/align-mode'
import { useDocumentStore } from '../store/document-store'
import { displayName } from './ComponentTree'

const AXES = ['X', 'Y', 'Z'] as const
const PLANE_OF: Record<(typeof AXES)[number], string> = { X: 'YZ', Y: 'XZ', Z: 'XY' }

export default function AlignPanel(): React.ReactElement | null {
  const { t } = useTranslation()
  const mode = useAlignModeStore((s) => s.alignMode)
  const setPlane = useAlignModeStore((s) => s.setPlane)
  const toggleMultiple = useAlignModeStore((s) => s.toggleMultiple)
  const exitAlignMode = useAlignModeStore((s) => s.exitAlignMode)
  const objects = useDocumentStore((s) => s.objects)
  if (!mode) return null

  const plane = mode.plane
  const axis = plane && 'axis' in plane ? plane.axis : null
  let planeText = t('alignMode.planeNone')
  if (plane && 'axis' in plane) planeText = t('alignMode.planeAxis', { plane: PLANE_OF[plane.axis], axis: plane.axis })
  else if (plane) {
    const o = objects[plane.objectId]
    planeText = t('alignMode.planeFace', { name: o ? displayName(o, t) : plane.objectId })
  }

  return (
    <div data-testid="align-panel">
      <div className="props-section-title">{t('alignMode.title')}</div>
      <div className="text-sm" data-testid="align-panel-hint" style={{ padding: '4px 12px 8px', color: 'var(--accent, #89b4fa)' }}>
        {t(alignHintKey(mode))}
      </div>

      <div className="csg-group">
        <div className="csg-group-title" id="align-axis-label">{t('alignMode.axisPlanes')}</div>
        <div className="props-row" role="radiogroup" aria-labelledby="align-axis-label" style={{ gap: 4 }}>
          {AXES.map((a) => (
            <button
              key={a}
              type="button"
              role="radio"
              aria-checked={a === axis}
              aria-label={`${a} (${PLANE_OF[a]})`}
              className={`btn btn-compact${a === axis ? ' active' : ''}`}
              data-testid={`align-axis-${a}`}
              onClick={() => setPlane({ axis: a })}
            >
              {a}
            </button>
          ))}
        </div>
        <div className="text-sm text-muted-xs" style={{ padding: '2px 12px 6px' }}>{t('alignMode.axisHint')}</div>
      </div>

      <div className="props-row">
        <span className="props-value" data-testid="align-plane">{planeText}</span>
      </div>
      {plane && (
        <div className="props-row">
          <button type="button" className="btn btn-compact" data-testid="align-reset-plane" onClick={() => setPlane(null)}>
            {t('alignMode.resetPlane')}
          </button>
        </div>
      )}

      <div className="props-row">
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
          <input type="checkbox" data-testid="align-multiple" checked={mode.multiple} onChange={toggleMultiple} />
          {t('alignMode.multiple')}
        </label>
      </div>
      <div className="text-sm text-muted-xs" style={{ padding: '0 12px 6px' }}>{t('alignMode.multipleHint')}</div>

      <div className="props-row">
        <button type="button" className="btn btn-compact" data-testid="align-done" onClick={exitAlignMode}>
          {t('alignMode.done')}
        </button>
      </div>
    </div>
  )
}
