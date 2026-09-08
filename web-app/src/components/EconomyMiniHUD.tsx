// src/components/EconomyMiniHUD.tsx — Мини-HUD баланса при выделенном объекте (§6.1)
import { useTranslation } from 'react-i18next'
import { useEconomyStore } from '../store/economy-store'
import { ECONOMY_UI, DIFFICULTY_ICON, ICON_REGISTRY } from '../store/economy-ui-config'
import { TokenIcon, GiftIcon, AdFilmIcon, ClockIcon } from './icons'

/** Форматировать ms → "5:00" */
function formatCooldown(ms: number): string {
  const totalSec = Math.ceil(ms / 1000)
  const min = Math.floor(totalSec / 60)
  const sec = totalSec % 60
  return `${min}:${sec.toString().padStart(2, '0')}`
}

export default function EconomyMiniHUD() {
  const { t } = useTranslation()
  const tokens = useEconomyStore((s) => s.tokens)
  const todayAdsWatched = useEconomyStore((s) => s.todayAdsWatched)
  const lastAdTimestamp = useEconomyStore((s) => s.lastAdTimestamp)
  const lastDailyBonus = useEconomyStore((s) => s.lastDailyBonus)

  // Кулдаун рекламы
  let cooldownMs = 0
  if (lastAdTimestamp) {
    const AD_COOLDOWN_MS = 5 * 60 * 1000
    // Используем Date.now как fallback если SDK не доступен
    cooldownMs = Math.max(0, AD_COOLDOWN_MS - (Date.now() - lastAdTimestamp))
  }
  const canWatchAd = todayAdsWatched < 3 && cooldownMs === 0

  // Бонус доступен
  let bonusAvailable = true
  if (lastDailyBonus) {
    // Простая проверка: если больше 24ч назад — доступен
    bonusAvailable = Date.now() - lastDailyBonus > 24 * 60 * 60 * 1000
  }

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      padding: '6px 10px',
      background: 'var(--bg-secondary)',
      borderRadius: '6px',
      fontSize: '12px',
      flexWrap: 'wrap',
    }}>
      {/* Баланс */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        <TokenIcon width={14} height={14} />
        <strong>{tokens}</strong>
      </div>

      {/* Бонус */}
      {ECONOMY_UI.showDailyBonus && bonusAvailable && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <GiftIcon width={14} height={14} />
          <span style={{ color: 'var(--success)' }}>+50</span>
        </div>
      )}

      {/* Реклама */}
      {ECONOMY_UI.showAdButton && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <AdFilmIcon width={14} height={14} />
          <span style={{ color: canWatchAd ? 'var(--text-primary)' : 'var(--text-muted)' }}>
            {todayAdsWatched}/3
          </span>
          {!canWatchAd && cooldownMs > 0 && (
            <span style={{ display: 'flex', alignItems: 'center', gap: '2px', color: 'var(--text-muted)' }}>
              <ClockIcon width={10} height={10} /> {formatCooldown(cooldownMs)}
            </span>
          )}
          {!canWatchAd && cooldownMs === 0 && (
            <span style={{ color: 'var(--text-muted)' }}>—</span>
          )}
        </div>
      )}
    </div>
  )
}
