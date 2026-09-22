// src/components/ImportModal.tsx — Модалка выбора способа оплаты импорта STL
// §3.1 ECONOMY.md v2.0: Импорт STL — 100 TC ИЛИ 2 просмотра рекламы
// U12 (P2): реклама ОПЛАЧИВАЕТ импорт (НЕ начисляет токены). Диалог выбора
// файла открывается ДО показа рекламы (в момент клика — user activation),
// т.к. браузер блокирует file chooser после `await` рекламы.
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useEconomyStore } from '../store/economy-store'
import { isEconomyAvailable } from '../platform'
import { ECONOMY_COSTS } from '../store/economy-config'
import { notify } from '../store/notifications'
import { openStlFilePicker } from '../io/stl-import'
import { ImportIcon, TokenIcon, AdFilmIcon } from './icons'

export default function ImportModal({
  onClose,
  onImport,
}: {
  onClose: () => void
  // U12: onImport может получить заранее выбранный файл (путь с рекламой/токенами —
  // файл выбирается в момент клика, user activation). Без файла (подписка/clean-bypass)
  // импорт сам откроет диалог выбора (поведение как раньше).
  onImport: (file?: File) => Promise<void> | void
}) {
  const { t } = useTranslation()
  const tokens = useEconomyStore((s) => s.tokens)
  // U1/U9: импорт оплачивается серией вида `import` (свой счётчик/лимит)
  const importAdCount = useEconomyStore((s) => s.adRewards.import?.countToday ?? 0)
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
      // U12: файл выбираем в момент клика (user activation) — после списания
      // токенов диалог мог бы быть заблокирован так же, как после рекламы.
      const file = await openStlFilePicker()
      if (!file) return
      const ok = spendTokens(importCost)
      if (ok) {
        onClose()
        await onImport(file)
      }
    } finally {
      setBusy(false)
    }
  }, [importCost, busy, onClose, onImport, spendTokens])

  // UB2-2: живой прогресс серии рекламы (0 → 1 → 2). Сбрасывается при новом
  // запуске серии; после завершения (успех/провал) — снова 0.
  const [seriesWatched, setSeriesWatched] = useState(0)

  const handleWatchAd = useCallback(async () => {
    if (busy) return
    setBusy(true)
    setSeriesWatched(0)
    try {
      // U12 (P2): открываем диалог выбора файла ДО показа рекламы — в момент
      // клика (user activation). После `await` рекламы браузер блокирует
      // file chooser («can only be shown with a user activation»).
      const file = await openStlFilePicker()
      if (!file) return // отмена выбора — реклама НЕ показывается
      // EC2/U12: серия из 2 роликов подряд ОПЛАЧИВАЕТ импорт (без начисления токенов)
      const rewarded = await watchAdsForImport(2, (watched) => setSeriesWatched(watched))
      if (!rewarded) {
        notify(t('import.adFailed'), 'error')
        return
      }
      onClose()
      await onImport(file)
    } finally {
      setSeriesWatched(0)
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

          {/* Вариант 2: посмотреть рекламу 2 раза (вид import — свой лимит U9) */}
          {/* UB2-2: подпись «Посмотреть 2 рекламы 0/2 (0/3)» — цена серии,
              прогресс текущей серии и дневной лимит вида import */}
          <button
            className="btn btn-compact flex-1"
            disabled={importAdCount + adCost > 3 || busy}
            onClick={handleWatchAd}
            style={{ justifyContent: 'center', padding: '16px 24px', fontSize: '20px' }}
          >
            <AdFilmIcon size={32} />{' '}
            {t('import.watchAd', {
              count: adCost,
              adsNeeded: adCost,
              series: seriesWatched,
              done: importAdCount,
              max: 3,
            })}
          </button>
          {importAdCount + adCost > 3 && (
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
