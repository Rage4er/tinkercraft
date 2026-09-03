// src/components/EconomyShop.tsx — Магазин экономики (аренда + подписки)
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useEconomyStore } from '../store/economy-store'
import Section from './Section'
import { TokenIcon, CrownIcon, ClockIcon, AdFilmIcon, TextIcon, ColorIcon } from './icons'

/** Форматировать оставшееся время аренды */
function formatRentalRemaining(expiresAt: number): string {
  const remaining = expiresAt - Date.now()
  if (remaining <= 0) return 'Истекла'
  const hours = Math.floor(remaining / (1000 * 60 * 60))
  const mins = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60))
  return `${hours}ч ${mins}м`
}

/** Форматировать оставшееся время подписки */
function formatSubRemaining(expiresAt: number): string {
  const remaining = expiresAt - Date.now()
  if (remaining <= 0) return 'Истекла'
  const days = Math.floor(remaining / (1000 * 60 * 60 * 24))
  const hours = Math.floor((remaining % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
  return `${days}д ${hours}ч`
}

export default function EconomyShop() {
  const { t } = useTranslation()
  const tokens = useEconomyStore((s) => s.tokens)
  const rentals = useEconomyStore((s) => s.rentals)
  const activeSubscription = useEconomyStore((s) => s.activeSubscription)
  const subscriptionExpiresAt = useEconomyStore((s) => s.subscriptionExpiresAt)
  const buyRental = useEconomyStore((s) => s.buyRental)
  const buySubscription = useEconomyStore((s) => s.buySubscription)
  const setBannerVisible = useEconomyStore((s) => s.setBannerVisible)

  const [busyRental, setBusyRental] = useState<string | null>(null)
  const [busySub, setBusySub] = useState<string | null>(null)

  // Подписка активна
  const hasActiveSub = useEconomyStore((s) => s.hasActiveSubscription())

  // Обработчики аренды
  const handleBuyRental = async (key: 'text3d' | 'extendedPalette' | 'disableBanner') => {
    if (busyRental) return
    setBusyRental(key)
    const result = await buyRental(key)
    setBusyRental(null)
    if (result.ok && key === 'disableBanner') {
      setBannerVisible(false)
    }
  }

  const handleWatchAdForBanner = async () => {
    if (busyRental) return
    setBusyRental('bannerAd')
    const result = await useEconomyStore.getState().watchAdForBanner()
    setBusyRental(null)
    if (result.ok) {
      setBannerVisible(false)
    }
  }

  // Обработчики подписок
  const handleBuySub = async (type: 'weekly' | 'monthly') => {
    if (busySub) return
    setBusySub(type)
    const result = await buySubscription(type)
    setBusySub(null)
    if (result.ok) {
      setBannerVisible(false)
    }
  }

  // Конфиг аренды с SVG-иконками
  const rentalsConfig = [
    { key: 'text3d' as const, label: '3D-текст', cost: 75, icon: <TextIcon width={18} height={18} />, desc: 'Создание 3D-текста' },
    { key: 'extendedPalette' as const, label: 'Расширенная палитра', cost: 75, icon: <ColorIcon width={18} height={18} />, desc: 'Дополнительные цвета' },
    { key: 'disableBanner' as const, label: 'Отключение баннера', cost: 50, icon: <AdFilmIcon width={18} height={18} />, desc: 'Без рекламы на 24ч' },
  ]

  // Конфиг подписок
  const subsConfig = [
    { key: 'weekly' as const, label: t('economy.subscriptions.weekly'), cost: 700, days: 7, perDay: t('economy.subscriptions.perDay7') },
    { key: 'monthly' as const, label: t('economy.subscriptions.monthly'), cost: 2000, days: 30, perDay: t('economy.subscriptions.perDay30') },
  ]

  return (
    <Section title={t('economy.rentals')}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {/* Аренда */}
        <div>
          <div style={{ fontSize: '13px', fontWeight: 'bold', marginBottom: '8px', color: 'var(--text-muted)' }}>
            <ClockIcon width={16} height={16} style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: '4px' }} />
            Аренда 24ч
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {rentalsConfig.map((r) => {
              const isActive = useEconomyStore.getState().hasRental(r.key)
              const rentalExpires = rentals[r.key]
              const remaining = rentalExpires !== null ? formatRentalRemaining(rentalExpires) : null

              return (
                <div
                  key={r.key}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    background: isActive ? 'var(--bg-secondary)' : 'var(--bg-tertiary)',
                    border: `1px solid ${isActive ? 'var(--border-success)' : 'var(--border)'}`,
                    opacity: isActive ? 0.7 : 1,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ color: 'var(--text-primary)' }}>{r.icon}</div>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 'bold' }}>{r.label}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        {r.desc}
                        {remaining && ` • ${remaining}`}
                      </div>
                    </div>
                  </div>
                  {isActive ? (
                    <span style={{ fontSize: '12px', color: 'var(--success)' }}>Активно</span>
                  ) : (
                    <button
                      className="btn btn-compact btn-sm"
                      disabled={tokens < r.cost || busyRental === r.key}
                      onClick={() => handleBuyRental(r.key)}
                      style={{
                        fontSize: '12px', padding: '4px 10px',
                        display: 'flex', alignItems: 'center', gap: '4px',
                        position: 'relative',
                      }}
                    >
                      <TokenIcon width={14} height={14} /> {r.cost}
                      {/* Y3.16: бейдж 💰 на кнопках аренды (§6.4) */}
                      <span style={{
                        position: 'absolute', bottom: '-2px', left: '-2px',
                        background: '#fbbf24', color: '#78350f', fontSize: '10px',
                        fontWeight: 700, borderRadius: '4px', padding: '2px 5px',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                        minWidth: '18px', minHeight: '14px', justifyContent: 'center',
                        pointerEvents: 'none',
                      }}>
                        💎{r.cost}
                      </span>
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Подписки */}
        <div>
          <div style={{ fontSize: '13px', fontWeight: 'bold', marginBottom: '8px', color: 'var(--text-muted)' }}>
            <CrownIcon width={16} height={16} style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: '4px' }} />
            {t('economy.subscription')}
          </div>
          {hasActiveSub && subscriptionExpiresAt ? (
            <div style={{
              padding: '8px 12px',
              borderRadius: '6px',
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-success)',
              fontSize: '13px',
              color: 'var(--success)',
            }}>
              Pro активна • {formatSubRemaining(subscriptionExpiresAt)}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {subsConfig.map((s) => (
                <div
                  key={s.key}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    background: 'var(--bg-tertiary)',
                    border: '1px solid var(--border)',
                  }}
                >
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 'bold' }}>{s.label}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{s.perDay}</div>
                  </div>
                  <button
                    className="btn btn-compact btn-sm"
                    disabled={tokens < s.cost || busySub === s.key}
                    onClick={() => handleBuySub(s.key)}
                    style={{
                      fontSize: '12px', padding: '4px 10px',
                      display: 'flex', alignItems: 'center', gap: '4px',
                      position: 'relative',
                    }}
                  >
                    <TokenIcon width={14} height={14} /> {s.cost}
                    {/* Y3.16: бейдж 💰 на кнопках подписок (§6.4) */}
                    <span style={{
                      position: 'absolute', bottom: '-2px', left: '-2px',
                      background: '#fbbf24', color: '#78350f', fontSize: '10px',
                      fontWeight: 700, borderRadius: '4px', padding: '2px 5px',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                      minWidth: '18px', minHeight: '14px', justifyContent: 'center',
                      pointerEvents: 'none',
                    }}>
                      💎{s.cost}
                    </span>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Кнопка скрытия баннера — два места (§6.3 ECONOMY.md v2.0) */}
        <div style={{
          padding: '8px 12px',
          borderRadius: '6px',
          background: 'var(--bg-tertiary)',
          border: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 'bold' }}>{t('economy.triggers.bannerOff', { defaultValue: 'Нет баннера на 24 ч' })}</div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{t('economy.tooltip.bannerOff')}</div>
          </div>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              className="btn btn-compact btn-sm"
              disabled={tokens < 50 || busyRental === 'disableBanner'}
              onClick={() => handleBuyRental('disableBanner')}
              style={{
                fontSize: '11px', padding: '4px 8px',
                display: 'flex', alignItems: 'center', gap: '3px',
                position: 'relative',
              }}
            >
              <TokenIcon width={12} height={12} /> 50
              {/* Y3.16: бейдж 💰50 (§6.4) */}
              <span style={{
                position: 'absolute', bottom: '-2px', left: '-2px',
                background: '#fbbf24', color: '#78350f', fontSize: '9px',
                fontWeight: 700, borderRadius: '4px', padding: '2px 5px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                minWidth: '18px', minHeight: '14px', justifyContent: 'center',
                pointerEvents: 'none',
              }}>
                💎50
              </span>
            </button>
            <button
              className="btn btn-compact btn-sm"
              disabled={busyRental === 'bannerAd'}
              onClick={handleWatchAdForBanner}
              style={{
                fontSize: '11px', padding: '4px 8px',
                display: 'flex', alignItems: 'center', gap: '3px',
                position: 'relative',
              }}
            >
              <AdFilmIcon width={12} height={12} /> 1
              {/* Y3.16: бейдж 📺1 (§6.4) */}
              <span style={{
                position: 'absolute', bottom: '-2px', right: '-2px',
                background: '#8b5cf6', color: '#ffffff', fontSize: '9px',
                fontWeight: 700, borderRadius: '4px', padding: '2px 5px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                minWidth: '18px', minHeight: '14px', justifyContent: 'center',
                pointerEvents: 'none',
              }}>
                📺1
              </span>
            </button>
          </div>
        </div>
      </div>
    </Section>
  )
}
