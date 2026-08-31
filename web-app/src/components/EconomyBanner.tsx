// src/components/EconomyBanner.tsx — Рекламный баннер (§6.3 ECONOMY.md v2.0)
// Компактная кнопка [📺 1 / 💎 50 — скрыть на 24 ч]
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useEconomyStore } from '../store/economy-store'

export default function EconomyBanner() {
  const { t } = useTranslation()
  const tokens = useEconomyStore((s) => s.tokens)
  const buyRental = useEconomyStore((s) => s.buyRental)
  const watchAdForBanner = useEconomyStore((s) => s.watchAdForBanner)
  const setBannerVisible = useEconomyStore((s) => s.setBannerVisible)
  const bannerVisible = useEconomyStore((s) => s.bannerVisible)

  const [busy, setBusy] = useState<string | null>(null)

  // Проверка: баннер скрыт подпиской или арендой
  const hasActiveSub = useEconomyStore.getState().hasActiveSubscription()
  const hasRentalDisable = useEconomyStore.getState().hasRental('disableBanner')

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
      <span style={{ fontWeight: 'bold' }}>
        📢 {t('economy.triggers.bannerOff', { defaultValue: 'Нет баннера на 24 ч' })}
      </span>

      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        {/* Кнопка токенами */}
        <button
          className="btn btn-compact btn-sm"
          disabled={tokens < 50 || busy !== null}
          onClick={handleBuyRental}
          style={{ fontSize: '12px', padding: '4px 10px', display: 'flex', alignItems: 'center', gap: '4px' }}
        >
          💎 50
        </button>

        {/* Кнопка рекламы */}
        <button
          className="btn btn-compact btn-sm"
          disabled={busy !== null}
          onClick={handleWatchAd}
          style={{ fontSize: '12px', padding: '4px 10px', display: 'flex', alignItems: 'center', gap: '4px' }}
        >
          📺 1
        </button>
      </div>
    </div>
  )
}
