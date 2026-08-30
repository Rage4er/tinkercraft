// src/components/EconomyHUD.tsx — HUD экономики (токены + ежедневный бонус)
// §6.1 ECONOMY.md v2.0: [💎 240] [🎁 +50] [📺 +50·2/3]
// §5 Серверное время для защиты от накруток
import { useState, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useEconomyStore } from '../store/economy-store'
import { ECONOMY_UI } from '../store/economy-ui-config'

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
      return `ждём ${formatCooldown(cooldownMs)}`
    }
    if (todayAdsWatched >= 3) {
      return t('economy.tooltip.adLimit')
    }
    return `${todayAdsWatched}/3`
  }, [cooldownMs, todayAdsWatched, t])

  // Метка бонуса: "+50" или "уже получено"
  const bonusStateLabel = useMemo(() => {
    if (!canClaimBonus) {
      return 'уже получено'
    }
    return t('economy.bonusLabel')
  }, [canClaimBonus, t])

  return (
    <div className="economy-hud" style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '10px 14px', flexWrap: 'wrap' }}>
      {/* 💎 Токены */}
      <div className="economy-tokens" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <svg width="40" height="40" viewBox="0 0 64 64" fill="none" className="economy-icon">
          <path d="M32 12 50 21l-18 9-18-9Z" fill="rgba(251, 191, 36, 0.95)" />
          <path d="M14 21l18 9v22l-18-9Z" fill="rgba(251, 191, 36, 0.7)" />
          <path d="M50 21l-18 9v22l18-9Z" fill="rgba(251, 191, 36, 0.45)" />
        </svg>
        <span className="economy-value" style={{ fontWeight: 'bold', fontSize: '22px' }}>
          {tokens}
        </span>
      </div>

      {/* 🎁 Ежедневный бонус */}
      {ECONOMY_UI.showDailyBonus && (
        <button
          className="btn btn-compact btn-sm economy-bonus-btn"
          onClick={claimDailyBonus}
          disabled={!canClaimBonus}
          style={{ fontSize: '18px', padding: '12px 24px', display: 'flex', alignItems: 'center', gap: '10px' }}
          title={t('economy.tooltip.bonus')}
        >
          <svg width="28" height="28" viewBox="0 0 64 64" fill="none">
            <path d="M16 28h32v24H16Z" fill="currentColor" fillOpacity="0.25" />
            <path d="M16 28h32M18 28v-6h28v6M32 28v24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M32 22c-4 0-10-6-8-10 1.6-3 6.4-2 8 4 1.6-6 6.4-7 8-4 2 4-4 10-8 10Z" fill="currentColor" fillOpacity="0.4" />
          </svg>
          {bonusStateLabel}
        </button>
      )}

      {/* 📺 Реклама за токены */}
      {ECONOMY_UI.showAdButton && canWatchAd && (
        <button
          className="btn btn-compact btn-sm economy-ad-btn"
          onClick={watchAdForTokens}
          style={{ fontSize: '18px', padding: '12px 24px', display: 'flex', alignItems: 'center', gap: '10px' }}
          title={t('economy.tooltip.ad')}
        >
          <svg width="28" height="28" viewBox="0 0 64 64" fill="none">
            <rect x="10" y="16" width="44" height="32" rx="4" fill="none" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" />
            <rect x="14.5" y="20" width="4" height="5" rx="1" fill="currentColor" />
            <rect x="14.5" y="29.5" width="4" height="5" rx="1" fill="currentColor" />
            <rect x="14.5" y="39" width="4" height="5" rx="1" fill="currentColor" />
            <rect x="45.5" y="20" width="4" height="5" rx="1" fill="currentColor" />
            <rect x="45.5" y="29.5" width="4" height="5" rx="1" fill="currentColor" />
            <rect x="45.5" y="39" width="4" height="5" rx="1" fill="currentColor" />
            <path d="M28 24v16l14-8Z" fill="currentColor" />
          </svg>
          {t('economy.adLabel')} · {adStateLabel}
        </button>
      )}

      {/* Таймер кулдауна рекламы */}
      {ECONOMY_UI.showAdButton && todayAdsWatched < 3 && cooldownMs > 0 && (
        <div style={{ fontSize: '16px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
          ⏱ {formatCooldown(cooldownMs)}
        </div>
      )}

      {/* Лимит рекламы */}
      {ECONOMY_UI.showAdButton && todayAdsWatched >= 3 && (
        <div style={{ fontSize: '14px', color: 'var(--text-muted)' }}>
          {t('economy.tooltip.adLimit')}
        </div>
      )}
    </div>
  )
}
