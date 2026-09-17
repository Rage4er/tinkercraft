// src/components/RentalModal.tsx — Модалка аренды функции на 24 часа (FIX UB-1)
//
// Проблема: клик по НЕарендованному 3D-тексту / расширенной палитре только
// переключал правую панель в режим экономики — пользователь не получал окна,
// где фича реально арендуется. Теперь клик открывает эту модалку: цена,
// баланс, «Арендовать 24 ч», а после успеха исходное действие продолжается
// автоматически (открывается TextModal / нативный color picker).
//
// Подписка (Pro) даёт безлимит → модалка не показывается, действие выполняется
// сразу. Clean-версия (нет Yandex SDK) — экономика отключена, модалки нет.
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useEconomyStore, type RentalKey } from '../store/economy-store'
import { ECONOMY_RENTALS } from '../store/economy-config'
import { useUiStore } from '../store/ui-store'
import { isEconomyAvailable } from '../platform'
import { notify } from '../store/notifications'
import { TextIcon, ColorIcon, TokenIcon } from './icons'

/** Аренда «по клику на заблокированную фичу» (баннер арендой не открывается — §6.3) */
export type RentalModalKey = Extract<RentalKey, 'text3d' | 'extendedPalette'>

export default function RentalModal() {
  const { t } = useTranslation()
  const rentalKey = useUiStore((s) => s.rentalModalKey)
  const setRentalModalKey = useUiStore((s) => s.setRentalModalKey)
  const setEconomyPanelOpen = useUiStore((s) => s.setEconomyPanelOpen)
  const setShowTextModal = useUiStore((s) => s.setShowTextModal)
  const setPalettePickerRequested = useUiStore((s) => s.setPalettePickerRequested)

  const tokens = useEconomyStore((s) => s.tokens)
  // P1-4: RO-селекторы — без мутаций state в render-фазе
  const hasAccess = useEconomyStore((s) => (rentalKey ? s.hasRentalRO(rentalKey) : false))
  const hasActiveSub = useEconomyStore((s) => s.hasActiveSubscriptionRO())
  const buyRental = useEconomyStore((s) => s.buyRental)
  const [busy, setBusy] = useState(false)

  const close = useCallback(() => setRentalModalKey(null), [setRentalModalKey])

  // Продолжаем действие, ради которого пользователь пришёл в модалку
  const grant = useCallback(
    (key: RentalModalKey) => {
      if (key === 'text3d') setShowTextModal(true)
      else setPalettePickerRequested(true)
    },
    [setShowTextModal, setPalettePickerRequested],
  )

  // Доступ уже есть (подписка/аренда) или экономика отключена — модалка не нужна
  const bypassDone = useCallback(
    (key: RentalModalKey) => {
      setRentalModalKey(null)
      grant(key)
    },
    [setRentalModalKey, grant],
  )

  const economyActive = isEconomyAvailable()

  // E3-паттерн: side-effect в useEffect, НЕ в render-фазе
  useEffect(() => {
    if (!rentalKey) return
    if (!economyActive || hasActiveSub || hasAccess) bypassDone(rentalKey)
  }, [rentalKey, economyActive, hasActiveSub, hasAccess, bypassDone])

  const handleBuy = useCallback(async () => {
    if (!rentalKey || busy) return
    setBusy(true)
    const key = rentalKey
    try {
      const res = await buyRental(key)
      if (res.ok) {
        setRentalModalKey(null)
        notify(t('rentalModal.rented', { label: t(`economy.rentals.${key}.label`) }), 'info')
        grant(key)
      } else if (res.code === 'not_enough') {
        notify(t('economy.notEnoughTokens', { n: ECONOMY_RENTALS[key] - tokens }), 'error')
      }
    } finally {
      setBusy(false)
    }
  }, [rentalKey, busy, buyRental, setRentalModalKey, grant, t, tokens])

  if (!rentalKey || !economyActive) return null

  const cost = ECONOMY_RENTALS[rentalKey]
  const icon =
    rentalKey === 'text3d' ? <TextIcon size={48} /> : <ColorIcon size={48} />

  return (
    <div className="text-modal-backdrop" onClick={close}>
      <div
        className="text-modal-box"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="rental-modal-title"
      >
        <div className="text-modal-title" id="rental-modal-title">
          {icon} {t('rentalModal.title')}
        </div>

        <div style={{ padding: '16px 0', fontSize: '16px', lineHeight: 1.6 }}>
          <p style={{ margin: '0 0 8px' }}>
            <strong>{t(`economy.rentals.${rentalKey}.label`)}</strong>
          </p>
          <p style={{ margin: '0 0 12px', fontSize: '14px', color: 'var(--text-muted)' }}>
            {t('rentalModal.desc', { hours: 24 })}
          </p>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px' }}>
            <span style={{ color: 'var(--text-muted)' }}>{t('rentalModal.balance')}</span>
            <span>
              <TokenIcon width={14} height={14} /> {tokens}
            </span>
          </div>
        </div>

        <div className="text-modal-actions" style={{ flexDirection: 'column', gap: '12px' }}>
          {/* Вариант 1: аренда за токены (единственный для text3d/extendedPalette) */}
          <button
            className="btn primary flex-1"
            disabled={tokens < cost || busy}
            onClick={handleBuy}
            style={{ justifyContent: 'center', padding: '16px 24px', fontSize: '20px' }}
          >
            <TokenIcon size={32} /> {t('rentalModal.buy', { cost, hours: 24 })}
          </button>
          {tokens < cost && (
            <div className="modal-hint" style={{ textAlign: 'center', fontSize: '12px', color: 'var(--text-muted)' }}>
              {t('economy.notEnoughTokens', { n: cost - tokens })}
            </div>
          )}

          {/* Вариант 2: заработать токены — правая панель экономики (бонус/реклама/квесты) */}
          <button
            className="btn btn-compact flex-1"
            onClick={() => {
              close()
              setEconomyPanelOpen(true)
            }}
            style={{ justifyContent: 'center', padding: '12px 24px', fontSize: '16px' }}
          >
            {t('rentalModal.earn')}
          </button>

          <button className="btn" onClick={close}>
            {t('textModal.cancel')}
          </button>
        </div>
      </div>
    </div>
  )
}
