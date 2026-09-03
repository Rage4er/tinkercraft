// src/components/EconomyBanner.tsx — Рекламный баннер (§6.3 ECONOMY.md v2.0)
// Компактная кнопка [📺 1 / 50 токенов — скрыть на 24 ч]
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useEconomyStore } from '../store/economy-store'
import { TokenIcon, AdFilmIcon, SpeakerIcon } from './icons'

export default function EconomyBanner() {
  const { t } = useTranslation()
  const tokens = useEconomyStore((s) => s.tokens)
  const buyRental = useEconomyStore((s) => s.buyRental)
  const watchAdForBanner = useEconomyStore((s) => s.watchAdForBanner)
  const setBannerVisible = useEconomyStore((s) => s.setBannerVisible)
  const bannerVisible = useEconomyStore((s) => s.bannerVisible)
  const hasActiveSub = useEconomyStore((s) => s.hasActiveSubscription())
  const hasRentalDisable = useEconomyStore((s) => s.hasRental('disableBanner'))

  const [busy, setBusy] = useState<string | null>(null)

  // Если баннер уже скрыт — не показываем
  if (!bannerVisible) return null
  if (hasActiveSub) return null
  if (hasRentalDisable) return null

  const handleBuyRental = async () => {
    if (busy || tokens < 50) return
    setBusy('tokens')
    const result = await buyRental('disableBanner')
    setBusy(null)
    if (result.ok) {
      setBannerVisible(false)
    }
  }

  const handleWatchAd = async () => {
    if (busy) return
    setBusy('ad')
    const result = await watchAdForBanner()
    if (result.ok) {
      // После показа рекламы — скрываем баннер
      setBannerVisible(false)
    }
    setBusy(null)
  }

  return (
    <div className="economy-banner" style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '8px 16px',
      background: 'var(--bg-tertiary)',
      border: '1px solid var(--border)',
      borderRadius: '6px',
      fontSize: '13px',
      gap: '12px',
    }}>
      <span style={{ fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}>
        <SpeakerIcon width={16} height={16} />
        {t('economy.triggers.bannerOff', { defaultValue: 'Нет баннера на 24 ч' })}
      </span>

      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        {/* Кнопка токенами */}
        <button
          className="btn btn-compact btn-sm"
          disabled={tokens < 50 || busy !== null}
          onClick={handleBuyRental}
          style={{ fontSize: '12px', padding: '4px 10px', display: 'flex', alignItems: 'center', gap: '4px', position: 'relative' }}
        >
          <TokenIcon width={14} height={14} /> 50
          {/* Y3.16: бейдж 💰50 (§6.4) */}
          <span style={{
            position: 'absolute', bottom: '-2px', left: '-2px',
            background: '#fbbf24', color: '#78350f', fontSize: '11px',
            fontWeight: 700, borderRadius: '4px', padding: '2px 5px',
            display: 'flex', alignItems: 'center', gap: '2px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
            minWidth: '18px', minHeight: '14px', justifyContent: 'center',
            pointerEvents: 'none',
          }}>
            💎 50
          </span>
        </button>

        {/* Кнопка рекламы */}
        <button
          className="btn btn-compact btn-sm"
          disabled={busy !== null}
          onClick={handleWatchAd}
          style={{ fontSize: '12px', padding: '4px 10px', display: 'flex', alignItems: 'center', gap: '4px', position: 'relative' }}
        >
          <AdFilmIcon width={14} height={14} /> 1
          {/* Y3.16: бейдж 📺1 (§6.4) */}
          <span style={{
            position: 'absolute', bottom: '-2px', right: '-2px',
            background: '#8b5cf6', color: '#ffffff', fontSize: '11px',
            fontWeight: 700, borderRadius: '4px', padding: '2px 5px',
            display: 'flex', alignItems: 'center', gap: '2px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
            minWidth: '18px', minHeight: '14px', justifyContent: 'center',
            pointerEvents: 'none',
          }}>
            📺 1
          </span>
        </button>
      </div>
    </div>
  )
}
