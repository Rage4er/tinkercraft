// src/components/ExportModal.tsx — Модалка выбора способа экспорта STL
// §6.5 ECONOMY.md v2.0: разбивка кэшбэка и фактическая стоимость
import { useCallback, useState, useMemo, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useEconomyStore, scanForCashback } from '../store/economy-store'
import { isEconomyAvailable } from '../platform'
import { useAdCooldown } from '../platform/ad-timers'
import { ECONOMY_COSTS, calculateCashbackBreakdown, adShowsLimit } from '../store/economy-config'
import { ExportIcon, TokenIcon, AdFilmIcon, ClockIcon } from './icons'

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
  // U12: экспорт оплачивается рекламой вида `export` (свой счётчик/лимит,
  // НЕ пересекается с видом `tokens` за токены в HUD)
  const exportAdCount = useEconomyStore((s) => s.adRewards.export?.countToday ?? 0)
  const todayCashbacks = useEconomyStore((s) => s.todayCashbacks)
  const watchAdForExport = useEconomyStore((s) => s.watchAdForExport)
  // P1-4: RO-селектор — без мутации state в render-фазе
  const hasActiveSub = useEconomyStore((s) => s.hasActiveSubscriptionRO())
  const [busy, setBusy] = useState(false)

  // FIX (UB-3): таймер «отката» реварда. У рекламы вида `export` свой кулдаун
  // (AD_COOLDOWN_MS) — без него кнопка выглядела залоченной без объяснений:
  // счётчик просмотров (3/день) и кулдаун (пауза между просмотрами) — разные
  // ограничения. Хук тикает посекундно.
  const adCooldown = useAdCooldown('export')

  // P0-6: clean-режим (нет Yandex SDK) — экономика отключена, экспорт свободен
  const economyActive = isEconomyAvailable()

  // EC3: bypass подписки — через useEffect, НЕ в render-фазе
  const subBypassDone = useRef(false)
  useEffect(() => {
    if (!economyActive) {
      // P0-6: без SDK не показываем модалку оплаты — сразу экспортируем
      subBypassDone.current = true
      onClose()
      onExport('tokens')
      return
    }
    if (hasActiveSub && !subBypassDone.current) {
      subBypassDone.current = true
      onClose()
      onExport('ad') // метод не важен — подписка даёт безлимит
    }
  }, [economyActive, hasActiveSub])

  // Подписка активна — модалка не нужна. Clean-режим — экономика отключена (P0-6).
  if (!economyActive || hasActiveSub) return null

  const exportCost = ECONOMY_COSTS.exportSTL

  // EC5: общий сканер — scanForCashback из store
  const cashbackScan = useMemo(() => {
    return scanForCashback(
      objects as Record<string, { shapeType: string; color: string; transform: { scaleX: number; scaleY: number; scaleZ: number } }>,
      operations
    )
  }, [objects, operations])

  // EC5: единая разбивка из config — не дублирует формулу
  const cashbackBreakdown = useMemo(() => {
    const bd = calculateCashbackBreakdown(cashbackScan)
    // EC5: если дневной лимит кэшбэка исчерпан — preview показывает 0
    if (todayCashbacks >= 3) return { ...bd, total: 0 }
    return bd
  }, [cashbackScan, todayCashbacks])

  // EC5: netCost не может быть отрицательным
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
    // U12: реклама вида `export` — ОПЛАЧИВАЕТ экспорт (НЕ начисляет токены).
    // Реальный экспорт (exportStl) выполняется ТОЛЬКО после успешного onRewarded.
    const rewarded = await watchAdForExport()
    if (rewarded) {
      onClose()
      onExport('ad')
    }
    setBusy(false)
  }, [busy, watchAdForExport, onClose, onExport])

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

          {/* Вариант 2: посмотреть рекламу (вид export — свой лимит U12) */}
          {/* UB-7: лимит берём из конфига (adShowsLimit), а не хардкод 3 */}
          <button
            className="btn btn-compact flex-1"
            disabled={exportAdCount >= adShowsLimit('export') || adCooldown.active || busy}
            onClick={handleWatchAd}
            style={{ justifyContent: 'center', padding: '16px 24px', fontSize: '20px' }}
          >
            <AdFilmIcon size={32} /> {t('export.watchAd', { count: exportAdCount, max: adShowsLimit('export') })}
          </button>
          {exportAdCount >= adShowsLimit('export') ? (
            <div className="modal-hint" style={{ textAlign: 'center', fontSize: '12px', color: 'var(--text-muted)' }}>
              {t('economy.adLimit')}
            </div>
          ) : adCooldown.active ? (
            <div
              className="modal-hint"
              style={{ textAlign: 'center', fontSize: '12px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
            >
              <ClockIcon width={14} height={14} /> {t('export.adCooldown', { time: adCooldown.formatted })}
            </div>
          ) : null}

          <button className="btn" onClick={onClose}>
            {t('textModal.cancel')}
          </button>
        </div>
      </div>
    </div>
  )
}
