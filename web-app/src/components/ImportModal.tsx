// src/components/ImportModal.tsx — Модалка выбора способа оплаты импорта STL
// §3.1 ECONOMY.md v2.0: Импорт STL — 100 TC ИЛИ 2 просмотра рекламы
import { useCallback, useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useEconomyStore } from '../store/economy-store'
import { ECONOMY_COSTS } from '../store/economy-config'
import { ImportIcon, TokenIcon, AdFilmIcon } from './icons'

export default function ImportModal({
  onClose,
  onImport,
}: {
  onClose: () => void
  onImport: () => void
}) {
  const { t } = useTranslation()
  const tokens = useEconomyStore((s) => s.tokens)
  const todayAdsWatched = useEconomyStore((s) => s.todayAdsWatched)
  const watchAdForTokens = useEconomyStore((s) => s.watchAdForTokens)
  const hasActiveSub = useEconomyStore((s) => s.hasActiveSubscription())
  const spendTokens = useEconomyStore((s) => s.spendTokens)
  const [busy, setBusy] = useState(false)

  const importCost = ECONOMY_COSTS.importSTL
  const adCost = 2

  // Если есть подписка — импорт сразу
  if (hasActiveSub) {
    onImport()
    return null
  }

  const handlePayTokens = useCallback(async () => {
    if (busy) return
    setBusy(true)
    const ok = spendTokens(importCost)
    if (ok) {
      onClose()
      onImport()
    }
    setBusy(false)
  }, [importCost, busy, onClose, onImport, spendTokens])

  const handleWatchAd = useCallback(async () => {
    if (busy) return
    setBusy(true)
    // Показываем рекламу 2 раза
    const rewarded1 = await watchAdForTokens()
    if (!rewarded1) {
      setBusy(false)
      return
    }
    const rewarded2 = await watchAdForTokens()
    if (!rewarded2) {
      setBusy(false)
      return
    }
    onClose()
    onImport()
    setBusy(false)
  }, [busy, watchAdForTokens, onClose, onImport])

  return (
    <div className="text-modal-backdrop" onClick={onClose}>
      <div
        className="text-modal-box"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-modal-title"
      >
        <div className="text-modal-title" id="import-modal-title">
          <ImportIcon size={48} /> {t('import.title')}
        </div>

        <div style={{ padding: '16px 0', fontSize: '16px', lineHeight: 1.6 }}>
          <p style={{ margin: '0 0 12px' }}>
            {t('import.description')}
          </p>
        </div>

        <div className="text-modal-actions" style={{ flexDirection: 'column', gap: '12px' }}>
          {/* Вариант 1: оплатить токенами */}
          <button
            className="btn primary flex-1"
            disabled={tokens < importCost || busy}
            onClick={handlePayTokens}
            style={{ justifyContent: 'center', padding: '16px 24px', fontSize: '20px' }}
          >
            <TokenIcon size={32} /> {t('import.payTokens', { cost: importCost })}
          </button>
          {tokens < importCost && (
            <div className="modal-hint" style={{ textAlign: 'center', fontSize: '12px', color: 'var(--text-muted)' }}>
              {t('economy.notEnoughTokens', { n: importCost - tokens })}
            </div>
          )}

          {/* Вариант 2: посмотреть рекламу 2 раза */}
          <button
            className="btn btn-compact flex-1"
            disabled={todayAdsWatched + adCost > 3 || busy}
            onClick={handleWatchAd}
            style={{ justifyContent: 'center', padding: '16px 24px', fontSize: '20px' }}
          >
            <AdFilmIcon size={32} /> {t('import.watchAd', { count: todayAdsWatched, max: 3, adsNeeded: adCost })}
          </button>
          {todayAdsWatched + adCost > 3 && (
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
