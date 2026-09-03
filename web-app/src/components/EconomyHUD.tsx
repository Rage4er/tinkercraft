// src/components/EconomyHUD.tsx — HUD экономики (токены + ежедневный бонус)
// §6.1 ECONOMY.md v2.0: [240 tokens] [+50 bonus] [+50 ad 2/3]
// §5 Серверное время для защиты от накруток
import { useState, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useEconomyStore } from '../store/economy-store'
import { ECONOMY_UI } from '../store/economy-ui-config'
import { TokenIcon, GiftIcon, AdFilmIcon, ClockIcon } from './icons'

/** Рассчитать оставшееся время кулдауна рекламы (мс) — использует серверное время */
async function getAdCooldownRemaining(): Promise<number> {
  const { lastAdTimestamp } = useEconomyStore.getState()
  if (!lastAdTimestamp) return 0
  const AD_COOLDOWN_MS = 5 * 60 * 1000
  const { getServerTime } = await import('../platform/server-time')
  const serverTime = await getServerTime()
  const elapsed = serverTime - lastAdTimestamp
  return Math.max(0, AD_COOLDOWN_MS - elapsed)
}

/** Форматировать ms → "5:00" */
function formatCooldown(ms: number): string {
  const totalSec = Math.ceil(ms / 1000)
  const min = Math.floor(totalSec / 60)
  const sec = totalSec % 60
  return `${min}:${sec.toString().padStart(2, '0')}`
}

/** Проверить, прошёл ли день с последнего бонуса (§5 серверное время) */
async function checkBonusAvailable(lastDailyBonus: number | null): Promise<boolean> {
  if (!lastDailyBonus) return true
  const { isDayPassed } = await import('../store/economy-config')
  return await isDayPassed(lastDailyBonus)
}

export default function EconomyHUD() {
  const { t } = useTranslation()
  const tokens = useEconomyStore((s) => s.tokens)
  const claimDailyBonus = useEconomyStore((s) => s.claimDailyBonus)
  const watchAdForTokens = useEconomyStore((s) => s.watchAdForTokens)
  const todayAdsWatched = useEconomyStore((s) => s.todayAdsWatched)
  const lastDailyBonus = useEconomyStore((s) => s.lastDailyBonus)

  // Локальный стейт для таймеров (обновление каждую секунду)
  const [cooldownMs, setCooldownMs] = useState(0)
  const [canClaimBonus, setCanClaimBonus] = useState(true)

  // Загружаем состояние при монтировании и обновляем каждую секунду
  useEffect(() => {
    const update = async () => {
      const cd = await getAdCooldownRemaining()
      setCooldownMs(cd)
      const bonus = await checkBonusAvailable(lastDailyBonus)
      setCanClaimBonus(bonus)
    }
    void update()
    const iv = setInterval(() => {
      void update()
    }, 1000)
    return () => clearInterval(iv)
  }, [lastDailyBonus])

  // Реклама доступна?
  const canWatchAd = todayAdsWatched < 3 && cooldownMs === 0

  // Метка рекламы: "+50 · 2/3" или "ждём 4:32" или "лимит дня"
  const adStateLabel = useMemo(() => {
    if (cooldownMs > 0) {
      return t('economy.cooldown', { time: formatCooldown(cooldownMs) })
    }
    if (todayAdsWatched >= 3) {
      return t('economy.tooltip.adLimit')
    }
    return `${todayAdsWatched}/3`
  }, [cooldownMs, todayAdsWatched, t])

  // Метка бонуса: "+50" или "уже получено"
  const bonusStateLabel = useMemo(() => {
    if (!canClaimBonus) {
      return t('economy.bonusClaimed')
    }
    return t('economy.bonusLabel')
  }, [canClaimBonus, t])

  return (
    <div className="economy-hud" style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '10px 14px', flexWrap: 'wrap' }}>
      {/* Tokens */}
      <div className="economy-tokens" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <TokenIcon width={40} height={40} />
        <span className="economy-value" style={{ fontWeight: 'bold', fontSize: '22px' }}>
          {tokens}
        </span>
      </div>

      {/* Daily bonus */}
      {ECONOMY_UI.showDailyBonus && (
        <button
          className="btn btn-compact btn-sm economy-bonus-btn"
          onClick={claimDailyBonus}
          disabled={!canClaimBonus}
          style={{ fontSize: '18px', padding: '12px 24px', display: 'flex', alignItems: 'center', gap: '10px' }}
          title={t('economy.tooltip.bonus')}
        >
          <GiftIcon width={28} height={28} />
          {bonusStateLabel}
        </button>
      )}

      {/* Ad for tokens */}
      {ECONOMY_UI.showAdButton && (
        <>
          {canWatchAd && (
            <button
              className="btn btn-compact btn-sm economy-ad-btn"
              onClick={watchAdForTokens}
              style={{ fontSize: '18px', padding: '12px 24px', display: 'flex', alignItems: 'center', gap: '10px' }}
              title={t('economy.tooltip.ad')}
            >
              <AdFilmIcon width={28} height={28} />
              {t('economy.adLabel')} · {adStateLabel}
            </button>
          )}

          {/* Таймер кулдауна рекламы */}
          {todayAdsWatched < 3 && cooldownMs > 0 && (
            <div style={{ fontSize: '16px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <ClockIcon width={16} height={16} /> {formatCooldown(cooldownMs)}
            </div>
          )}

          {/* Лимит рекламы — показываем всегда, даже когда лимит достигнут */}
          {todayAdsWatched >= 3 && (
            <div style={{ fontSize: '14px', color: 'var(--text-muted)' }}>
              {t('economy.tooltip.adLimit')}
            </div>
          )}
        </>
      )}
    </div>
  )
}
