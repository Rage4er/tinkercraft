// src/components/EconomyMiniHUD.tsx — Мини-HUD баланса при выделенном объекте (§6.1)
// UB2-3b: иконки 14→16px (часы 10→12px) — читаемость.
// UB2-5: расширенные двухуровневые тултипы (баланс/бонус/реклама) с локализацией.
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useEconomyStore } from '../store/economy-store'
import { ECONOMY_UI } from '../store/economy-ui-config'
import { TokenIcon, GiftIcon, AdFilmIcon, ClockIcon } from './icons'
import { LIMITS, isDayPassed } from '../store/economy-config'
import { useAdCooldown } from '../platform/ad-timers'
import Tooltip from './Tooltip'

export default function EconomyMiniHUD() {
  const { t } = useTranslation()
  const tokens = useEconomyStore((s) => s.tokens)
  // U1/U9: HUD показывает состояние вида `tokens` (реклама за токены)
  const adRewardsTokens = useEconomyStore((s) => s.adRewards.tokens)
  const lastDailyBonus = useEconomyStore((s) => s.lastDailyBonus)

  // ── U2: живой посекундный отсчёт кулдауна рекламы (вид `tokens`).
  // Тикает по локальным часам с поправкой на серверное смещение —
  // «м:сс» убывает плавно, а не стоит на месте до обновления кэша 30с.
  const { remainingMs: cooldownMs, formatted: cooldownLabel } = useAdCooldown('tokens')

  // U1/U9: кулдаун/лимит вида `tokens` (свой у каждого вида награды)
  const tokensAd = adRewardsTokens ?? { lastTimestamp: null, countToday: 0 }
  const canWatchAd = tokensAd.countToday < LIMITS.adsPerDay && cooldownMs === 0

  // Бонус доступен (день сменился по серверной дате)
  const [bonusAvailable, setBonusAvailable] = useState(true)
  useEffect(() => {
    let mounted = true
    const check = async () => {
      const ok = await isDayPassed(lastDailyBonus)
      if (mounted) setBonusAvailable(ok)
    }
    void check()
    return () => { mounted = false }
  }, [lastDailyBonus])

  // EC17: показываем состояние вместо скрытия
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
      {/* Баланс — UB2-5: расширенный тултип */}
      <Tooltip
        tooltip={{
          labelKey: 'economy.tokensLabel',
          descriptionKey: 'economy.tooltip.tokensDesc',
        }}
        position="bottom"
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <TokenIcon width={16} height={16} />
          <strong>{tokens}</strong>
        </div>
      </Tooltip>

      {/* Бонус — всегда показываем состояние. UB2-5: расширенный тултип */}
      {ECONOMY_UI.showDailyBonus && (
        <Tooltip
          tooltip={{
            labelKey: 'economy.tooltip.bonusTitle',
            descriptionKey: 'economy.tooltip.bonusDesc',
          }}
          position="bottom"
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <GiftIcon width={16} height={16} />
            {bonusAvailable ? (
              <span style={{ color: 'var(--success)' }}>+50</span>
            ) : (
              <span style={{ color: 'var(--text-muted)' }}>—</span>
            )}
          </div>
        </Tooltip>
      )}

      {/* Реклама — всегда показываем состояние. UB2-5: расширенный тултип */}
      {ECONOMY_UI.showAdButton && (
        <Tooltip
          tooltip={{
            labelKey: 'economy.tooltip.adTitle',
            descriptionKey: 'economy.tooltip.adDesc',
          }}
          position="bottom"
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <AdFilmIcon width={16} height={16} />
            {canWatchAd ? (
              <span>{tokensAd.countToday}/3</span>
            ) : cooldownMs > 0 ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: '2px', color: 'var(--text-muted)' }}>
                <ClockIcon width={12} height={12} /> {cooldownLabel}
              </span>
            ) : (
              <span style={{ color: 'var(--text-muted)' }}>—</span>
            )}
          </div>
        </Tooltip>
      )}
    </div>
  )
}
