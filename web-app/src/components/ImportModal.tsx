// src/components/ImportModal.tsx — Модалка выбора способа оплаты импорта STL
// §3.1 ECONOMY.md v2.0: Импорт STL — 100 TC ИЛИ 2 просмотра рекламы
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useEconomyStore } from '../store/economy-store'
import { isEconomyAvailable } from '../platform'
import { ECONOMY_COSTS } from '../store/economy-config'
import { notify } from '../store/notifications'
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
  const watchAdsForImport = useEconomyStore((s) => s.watchAdsForImport)
  // P1-4: RO-селектор — без мутации state в render-фазе
  const hasActiveSub = useEconomyStore((s) => s.hasActiveSubscriptionRO())
  const spendTokens = useEconomyStore((s) => s.spendTokens)
  const [busy, setBusy] = useState(false)

  // P0-6: clean-режим (нет Yandex SDK) — экономика отключена, импорт свободен
  const economyActive = isEconomyAvailable()

  const importCost = ECONOMY_COSTS.importSTL
  const adCost = 2

  // E3: bypass подписки — через useEffect, НЕ в render-фазе
  // (side-effect в теле компонента вызывался дважды в StrictMode)
  const subBypassDone = useRef(false)
  useEffect(() => {
    if (!economyActive) {
      // P0-6: без SDK не показываем модалку оплаты — сразу импортируем
      subBypassDone.current = true
      onClose()
      void onImport()
      return
    }
    if (hasActiveSub && !subBypassDone.current) {
      subBypassDone.current = true
      onClose()
      void onImport()
    }
  }, [economyActive, hasActiveSub])

  // Подписка активна — модалка не нужна (bypass в useEffect). Clean-режим — P0-6.
  if (!economyActive || hasActiveSub) return null

  const handlePayTokens = useCallback(async () => {
    if (busy) return
    setBusy(true)
    try {
      const ok = spendTokens(importCost)
      if (ok) {
        onClose()
        await onImport()
      }
    } finally {
      setBusy(false)
    }
  }, [importCost, busy, onClose, onImport, spendTokens])

  const handleWatchAd = useCallback(async () => {
    if (busy) return
    setBusy(true)
    try {
      // EC2: одна функция — 2 рекламы подряд без кулдауна между ними
      const rewarded = await watchAdsForImport(2)
      if (!rewarded) {
        notify(t('import.adFailed'), 'error')
        return
      }
      onClose()
      await onImport()
    } finally {
      setBusy(false)
    }
  }, [busy, watchAdsForImport, onClose, onImport, t])

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
