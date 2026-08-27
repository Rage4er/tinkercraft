// src/components/EconomyHUD.tsx — HUD экономики (токены + ежедневный бонус)
import { useState, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useEconomyStore } from '../store/economy-store'
import { ECONOMY_UI, ICON_REGISTRY } from '../store/economy-ui-config'

/** Рассчитать оставшееся время кулдауна рекламы (мс) */
function getAdCooldownRemaining(): number {
  const { lastAdTimestamp } = useEconomyStore.getState()
  if (!lastAdTimestamp) return 0
  const AD_COOLDOWN_MS = 5 * 60 * 1000
  const elapsed = Date.now() - lastAdTimestamp
  return Math.max(0, AD_COOLDOWN_MS - elapsed)
}

/** Форматировать ms → "5:00" */
function formatCooldown(ms: number): string {
  const totalSec = Math.ceil(ms / 1000)
  const min = Math.floor(totalSec / 60)
  const sec = totalSec % 60
  return `${min}:${sec.toString().padStart(2, '0')}`
}

export default function EconomyHUD() {
  const { t } = useTranslation()
  const tokens = useEconomyStore((s) => s.tokens)
  const claimDailyBonus = useEconomyStore((s) => s.claimDailyBonus)
  const watchAdForTokens = useEconomyStore((s) => s.watchAdForTokens)
  const todayAdsWatched = useEconomyStore((s) => s.todayAdsWatched)
  const lastDailyBonus = useEconomyStore((s) => s.lastDailyBonus)

  // Локальный стейт для таймера кулдауна (обновление каждую секунду)
  const [cooldownMs, setCooldownMs] = useState(getAdCooldownRemaining())

  // Обновляем таймер каждую секунду
  useEffect(() => {
    const iv = setInterval(() => {
      setCooldownMs(getAdCooldownRemaining())
    }, 1000)
    return () => clearInterval(iv)
  }, [])

  const canClaimBonus = lastDailyBonus ? new Date(lastDailyBonus).getDate() !== new Date().getDate() : true
  const canWatchAd = todayAdsWatched < 3 && cooldownMs === 0

  // Переводы для UI
  const adLabel = t('economy.adLabel')
  const bonusLabel = t('economy.bonusLabel')
  const tokenLabel = t('economy.tokensLabel')

  return (
    <div className="economy-hud" style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '10px 14px', flexWrap: 'wrap' }}>
      {/* Токены */}
      <div className="economy-tokens" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        {ICON_REGISTRY.token && (
          <ICON_REGISTRY.token width={40} height={40} className="economy-icon" />
        )}
        <span className="economy-value" style={{ fontWeight: 'bold', fontSize: '22px' }}>
          {tokens}
        </span>
      </div>

      {/* Ежедневный бонус */}
      {ECONOMY_UI.showDailyBonus && canClaimBonus && (
        <button
          className="btn btn-compact btn-sm economy-bonus-btn"
          onClick={claimDailyBonus}
          style={{ fontSize: '18px', padding: '12px 24px', display: 'flex', alignItems: 'center', gap: '10px' }}
        >
          {ICON_REGISTRY.gift && (
            <ICON_REGISTRY.gift width={28} height={28} />
          )}
          {bonusLabel}
        </button>
      )}

      {/* Реклама за токены */}
      {ECONOMY_UI.showAdButton && canWatchAd && (
        <button
          className="btn btn-compact btn-sm economy-ad-btn"
          onClick={watchAdForTokens}
          style={{ fontSize: '18px', padding: '12px 24px', display: 'flex', alignItems: 'center', gap: '10px' }}
        >
          {ICON_REGISTRY.ad && (
            <ICON_REGISTRY.ad width={28} height={28} />
          )}
          {adLabel}
        </button>
      )}

      {/* Таймер кулдауна рекламы */}
      {ECONOMY_UI.showAdButton && todayAdsWatched < 3 && cooldownMs > 0 && (
        <div style={{ fontSize: '16px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
          ⏱ {formatCooldown(cooldownMs)}
        </div>
      )}
    </div>
  )
}
