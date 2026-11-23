// ============================================================
// BrepPanel.tsx — FILLET-CHAMFER-BREP: панель режима выбора ребра
// ============================================================
// Показывается вместо PropertiesPanel/StepPanel, пока режим активен:
// подсказка, число рёбер, выбранное ребро, размер (радиус / фаска),
// «Применить» и «Отмена». Esc выходит из режима (useBrepModeKeys).

import { useTranslation } from 'react-i18next'
import NumInput from './NumInput'
import { useBrepModeStore } from '../store/brep-mode'

export default function BrepPanel() {
  const { t } = useTranslation()
  const active = useBrepModeStore((s) => s.active)
  const edges = useBrepModeStore((s) => s.edges)
  const selectedEdges = useBrepModeStore((s) => s.selectedEdges)
  const hoverEdge = useBrepModeStore((s) => s.hoverEdge)
  const size = useBrepModeStore((s) => s.size)
  const loading = useBrepModeStore((s) => s.loading)
  const setSize = useBrepModeStore((s) => s.setSize)
  const cancel = useBrepModeStore((s) => s.cancel)
  const apply = useBrepModeStore((s) => s.apply)
  if (!active) return null
  const shownEdge = selectedEdges.length > 0 ? selectedEdges : hoverEdge !== null ? [hoverEdge] : []
  return (
    <div data-testid="brep-panel" data-brep-kind={active}>
      <div className="props-section-title">{t(active === 'fillet' ? 'brep.fillet' : 'brep.chamfer')}</div>
      <div className="text-sm text-muted-xs" style={{ padding: '2px 12px 8px' }} data-testid="brep-hint">
        {t('brep.hint')}
      </div>
      <div className="props-row">
        <span className="props-label">{t('brep.edge')}</span>
        <span className="props-value" data-testid="brep-edge">
          {loading ? t('brep.loading')
            : shownEdge.length === 0 ? t('brep.edges', { count: edges.length })
              : t('brep.selectedMany', { count: shownEdge.length, list: shownEdge.map((i) => i + 1).join(', ') })}
        </span>
      </div>
      <NumInput
        label={t(active === 'fillet' ? 'brep.size' : 'brep.sizeChamfer')}
        step={0.1}
        value={size}
        disabled={loading}
        onChange={setSize}
      />
      <div className="props-row" style={{ gap: 6, padding: '8px 12px' }}>
        <button className="btn primary" data-testid="brep-apply" disabled={loading || selectedEdges.length === 0} onClick={() => void apply()}>
          {t('brep.apply')}
        </button>
        <button className="btn" data-testid="brep-cancel" onClick={cancel}>{t('brep.cancel')}</button>
      </div>
    </div>
  )
}
