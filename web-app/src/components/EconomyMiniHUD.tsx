// src/components/EconomyMiniHUD.tsx — Мини-HUD баланса при выделенном объекте (§6.1)
// UB2-3b: иконки 14→16px (часы 10→12px) — читаемость.
// UB2-5: расширенные двухуровневые тултипы (баланс/бонус/реклама) с локализацией.
// UB3-5: после получения бонуса — подарок + тикающий «ч:мм:сс» до сброса
// (вместо «—»); источник — useDailyReset (тот же паттерн, что у кулдауна).
import { useEconomyStore } from '../store/economy-store'
import { ECONOMY_UI } from '../store/economy-ui-config'
import { TokenIcon, GiftIcon, AdFilmIcon, ClockIcon } from './icons'
import { adShowsLimit } from '../store/economy-config'
import { useAdCooldown, useDailyReset } from '../platform/ad-timers'
import Tooltip from './Tooltip'

export default function EconomyMiniHUD() {
  const tokens = useEconomyStore((s) => s.tokens)
  // U1/U9: HUD показывает состояние вида `tokens` (реклама за токены)
  const adRewardsTokens = useEconomyStore((s) => s.adRewards.tokens)

  // ── U2: живой посекундный отсчёт кулдауна рекламы (вид `tokens`).
  // Тикает по локальным часам с поправкой на серверное смещение —
  // «м:сс» убывает плавно, а не стоит на месте до обновления кэша 30с.
  const { remainingMs: cooldownMs, formatted: cooldownLabel } = useAdCooldown('tokens')
  // UB3-5: отсчёт до полуночного сброса бонуса (due = бонус доступен)
  const dailyReset = useDailyReset()

  // U1/U9: кулдаун/лимит вида `tokens` (свой у каждого вида награды).
  // UB3-1: дневной бюджет показов — per-kind (adShowsLimit), хардкод `/3` убран.
  const tokensAdLimit = adShowsLimit('tokens')
  const tokensAd = adRewardsTokens ?? { lastTimestamp: null, countToday: 0 }
  const canWatchAd = tokensAd.countToday < tokensAdLimit && cooldownMs === 0

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
            {dailyReset.due ? (
              <span style={{ color: 'var(--success)' }}>+50</span>
            ) : (
              // UB3-5: вместо «—» — тикающий остаток до полуночного сброса
              <span style={{ color: 'var(--text-muted)' }}>{dailyReset.formatted}</span>
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
              /* UB3-1: бюджет показов вида из конфига (без хардкода) */
              <span>{tokensAd.countToday}/{tokensAdLimit}</span>
            ) : cooldownMs > 0 ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: '2px', color: 'var(--text-muted)' }}>
                <ClockIcon width={12} height={12} /> {cooldownLabel}
              </span>
            ) : (
              <span style={{ color: 'var(--text-muted)' }}>—</span>
            )}
          </div>
        </Tooltip>
      )
      }
    </div >
  )
}
