// src/components/ExportModal.tsx — Модалка выбора способа экспорта STL
// §6.5 ECONOMY.md v2.0: разбивка кэшбэка и фактическая стоимость
import { useCallback, useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useEconomyStore, scanForCashback } from '../store/economy-store'
import { ECONOMY_COSTS } from '../store/economy-config'
import { ExportIcon, TokenIcon, AdFilmIcon } from './icons'

export default function ExportModal({
  objects,
  operations,
  onClose,
  onExport,
}: {
  objects: Record<string, { shapeType: string; transform?: { scaleX: number; scaleY: number; scaleZ: number }; color?: string }>
  operations: Array<{ type: string; ids?: string[] }>
  onClose: () => void
  onExport: (method: 'tokens' | 'ad') => void
}) {
  const { t } = useTranslation()
  const tokens = useEconomyStore((s) => s.tokens)
  const todayAdsWatched = useEconomyStore((s) => s.todayAdsWatched)
  const watchAdForTokens = useEconomyStore((s) => s.watchAdForTokens)
  const [busy, setBusy] = useState(false)

  const exportCost = ECONOMY_COSTS.exportSTL

  // Посчитать объекты (не импортированные)
  const objectCount = useMemo(
    () => Object.values(objects).filter((o) => o.shapeType !== 'import_mesh' && o.shapeType !== 'text3d').length,
    [objects],
  )

  // Посчитать CSG операции
  const csgOps = useMemo(
    () => operations.filter((op) => op.type === 'group').length,
    [operations],
  )

  // Сканер для кэшбэка
  const cashbackScan = useMemo(() => {
    return scanForCashback(
      objects as Record<string, { shapeType: string; color: string; transform: { scaleX: number; scaleY: number; scaleZ: number } }>,
      operations
    )
  }, [objects, operations])

  // Разбивка кэшбэка
  const cashbackBreakdown = useMemo(() => {
    const base = 1
    const scale = Math.min(6, Math.floor(objectCount / 5))
    const shapeDiv = Math.min(6, cashbackScan.uniqueShapeTypes > 1 ? cashbackScan.uniqueShapeTypes - 1 : 0)
    const toolCount = Math.min(6, cashbackScan.toolsCount)
    const toolDiv = [0, 0, 2, 4, 6][Math.min(4, cashbackScan.toolCategories)] || 0
    const total = Math.min(25, base + scale + shapeDiv + toolCount + toolDiv)
    return { base, scale, shapeDiv, toolCount, toolDiv, total }
  }, [objectCount, cashbackScan])

  const netCost = Math.max(0, exportCost - cashbackBreakdown.total)

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
          <ExportIcon size={48} /> {t('export.title')}
        </div>

        <div style={{ padding: '16px 0', fontSize: '16px', lineHeight: 1.6 }}>
          <p style={{ margin: '0 0 12px' }}>
            {t('export.description')}
          </p>

          {/* Разбивка кэшбэка */}
          {cashbackBreakdown.total > 0 && (
            <div style={{
              background: 'var(--bg-secondary)',
              borderRadius: '6px',
              padding: '12px',
              marginBottom: '16px',
              fontSize: '13px',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ color: 'var(--text-muted)' }}>{t('export.cashbackBreakdown.base', { base: cashbackBreakdown.base })}</span>
                <span>+{cashbackBreakdown.base}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ color: 'var(--text-muted)' }}>{t('export.cashbackBreakdown.scale', { scale: cashbackBreakdown.scale })}</span>
                <span>+{cashbackBreakdown.scale}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ color: 'var(--text-muted)' }}>{t('export.cashbackBreakdown.shapeDiv', { shapeDiv: cashbackBreakdown.shapeDiv })}</span>
                <span>+{cashbackBreakdown.shapeDiv}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ color: 'var(--text-muted)' }}>{t('export.cashbackBreakdown.toolCount', { toolCount: cashbackBreakdown.toolCount })}</span>
                <span>+{cashbackBreakdown.toolCount}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ color: 'var(--text-muted)' }}>{t('export.cashbackBreakdown.toolDiv', { toolDiv: cashbackBreakdown.toolDiv })}</span>
                <span>+{cashbackBreakdown.toolDiv}</span>
              </div>
              <div style={{
                display: 'flex', justifyContent: 'space-between',
                paddingTop: '8px', borderTop: '1px solid var(--border)',
                fontWeight: 'bold', marginTop: '4px',
              }}>
                <span>{t('export.cashbackBreakdown.total', { total: cashbackBreakdown.total })}</span>
                <span style={{ color: 'var(--success)' }}>+{cashbackBreakdown.total}</span>
              </div>
              <div style={{
                display: 'flex', justifyContent: 'space-between',
                marginTop: '8px', fontSize: '14px',
              }}>
                <span>{t('export.cashbackInfo', { cashback: cashbackBreakdown.total, netCost })}</span>
              </div>
            </div>
          )}
        </div>

        <div className="text-modal-actions" style={{ flexDirection: 'column', gap: '12px' }}>
          {/* Вариант 1: оплатить токенами */}
          <button
            className="btn primary flex-1"
            disabled={tokens < netCost || busy}
            onClick={handlePayTokens}
            style={{ justifyContent: 'center', padding: '16px 24px', fontSize: '20px' }}
          >
            <TokenIcon size={32} /> {t('export.payTokens', { cost: netCost })}
          </button>
          {tokens < netCost && (
            <div className="modal-hint" style={{ textAlign: 'center', fontSize: '12px', color: 'var(--text-muted)' }}>
              {t('economy.notEnoughTokens', { n: netCost - tokens })}
            </div>
          )}

          {/* Вариант 2: посмотреть рекламу */}
          <button
            className="btn btn-compact flex-1"
            disabled={todayAdsWatched >= 3 || busy}
            onClick={handleWatchAd}
            style={{ justifyContent: 'center', padding: '16px 24px', fontSize: '20px' }}
          >
            <AdFilmIcon size={32} /> {t('export.watchAd', { count: todayAdsWatched, max: 3 })}
          </button>
          {todayAdsWatched >= 3 && (
            <div className="modal-hint" style={{ textAlign: 'center', fontSize: '12px', color: 'var(--text-muted)' }}>
              {t('economy.adLimit')}
            </div>
          )}

          <button className="btn" onClick={onClose}>
            {t('textModal.cancel')}
          </button>
        </div>
      </div>
    </div>
  )
}
