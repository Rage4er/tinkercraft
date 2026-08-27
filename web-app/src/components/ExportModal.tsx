// src/components/ExportModal.tsx — Модалка выбора способа экспорта STL
import { useCallback, useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useEconomyStore } from '../store/economy-store'
import { ECONOMY_COSTS, calculateCashback } from '../store/economy-config'
import { ExportIcon } from './icons'

export default function ExportModal({
  objects,
  operations,
  onClose,
  onExport,
}: {
  objects: Record<string, { shapeType: string }>
  operations: Array<{ type: string }>
  onClose: () => void
  onExport: (method: 'tokens' | 'ad' | 'free') => void
}) {
  const { t } = useTranslation()
  const tokens = useEconomyStore((s) => s.tokens)
  const todayAdsWatched = useEconomyStore((s) => s.todayAdsWatched)
  const watchAdForTokens = useEconomyStore((s) => s.watchAdForTokens)
  const [busy, setBusy] = useState(false)

  const exportCost = ECONOMY_COSTS.exportSTL

  // Посчитать объекты (не импортированные)
  const objectCount = useMemo(
    () => Object.values(objects).filter((o) => o.shapeType !== 'import_mesh').length,
    [objects],
  )

  // Посчитать CSG операции
  const csgOps = useMemo(
    () => operations.filter((op) => op.type === 'group').length,
    [operations],
  )

  // Прогноз кэшбэка (не начисляем — только показываем)
  const estimatedCashback = useMemo(
    () => calculateCashback(objectCount, csgOps),
    [objectCount, csgOps],
  )
  const netCost = Math.max(0, exportCost - estimatedCashback)

  const handlePayTokens = useCallback(async () => {
    if (busy) return
    setBusy(true)
    const ok = useEconomyStore.getState().spendTokens(netCost)
    if (ok) {
      onClose()
      onExport('tokens')
    }
    setBusy(false)
  }, [netCost, busy, onClose, onExport])

  const handleWatchAd = useCallback(async () => {
    if (busy) return
    setBusy(true)
    const rewarded = await watchAdForTokens()
    if (rewarded) {
      onClose()
      onExport('ad')
    }
    setBusy(false)
  }, [busy, watchAdForTokens, onClose, onExport])

  return (
    <div className="text-modal-backdrop" onClick={onClose}>
      <div
        className="text-modal-box"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-modal-title"
      >
        <div className="text-modal-title" id="export-modal-title">
          <ExportIcon size={32} /> {t('export.title')}
        </div>

        <div style={{ padding: '12px 0', fontSize: '14px', lineHeight: 1.6 }}>
          <p style={{ margin: '0 0 8px' }}>
            {t('export.description')}
          </p>
          {estimatedCashback > 0 && (
            <p style={{ margin: '0 0 12px', fontSize: '13px', color: 'var(--text-muted)' }}>
              {t('export.cashbackInfo', { cashback: estimatedCashback, netCost })}
            </p>
          )}
        </div>

        <div className="text-modal-actions" style={{ flexDirection: 'column', gap: '8px' }}>
          {/* Вариант 1: оплатить токенами */}
          <button
            className="btn primary flex-1"
            disabled={tokens < netCost || busy}
            onClick={handlePayTokens}
            style={{ justifyContent: 'center' }}
          >
            💰 {t('export.payTokens', { cost: netCost })}
          </button>

          {/* Вариант 2: посмотреть рекламу */}
          <button
            className="btn btn-compact flex-1"
            disabled={todayAdsWatched >= 3 || busy}
            onClick={handleWatchAd}
            style={{ justifyContent: 'center' }}
          >
            📺 {t('export.watchAd', { count: todayAdsWatched, max: 3 })}
          </button>

          {/* Вариант 3: бесплатная реклама */}
          <button
            className="btn btn-compact flex-1"
            disabled={busy}
            onClick={() => { onClose(); onExport('free') }}
            style={{ justifyContent: 'center' }}
          >
            🆓 {t('export.free')}
          </button>

          <button className="btn" onClick={onClose}>
            {t('textModal.cancel')}
          </button>
        </div>
      </div>
    </div>
  )
}
