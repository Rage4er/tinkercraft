// src/components/EconomyMiniHUD.tsx — Мини-HUD баланса при выделенном объекте (§6.1)
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useEconomyStore } from '../store/economy-store'
import { ECONOMY_UI } from '../store/economy-ui-config'
import { TokenIcon, GiftIcon, AdFilmIcon, ClockIcon } from './icons'
import { AD_COOLDOWN_MS, LIMITS, isDayPassed } from '../store/economy-config'
import { getCachedServerTime } from '../platform/server-time'

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

  // ── P1-8: единый источник времени — серверное (§5 ECONOMY.md).
  // Синхронизируем с PropertiesPanel: кулдаун/бонус считаем от getServerTime()
  // (кэш ~30с в platform/server-time), обновляем раз в секунду.
  const [serverNow, setServerNow] = useState<number | null>(getCachedServerTime())

  useEffect(() => {
    let mounted = true
    const update = async () => {
      const { getServerTime } = await import('../platform/server-time')
      const t = await getServerTime()
      if (mounted) setServerNow(t)
    }
    void update()
    const iv = setInterval(() => { void update() }, 1000)
    return () => { mounted = false; clearInterval(iv) }
  }, [])

  const now = serverNow ?? Date.now() // fallback до первого ответа сервера

  // Кулдаун рекламы (по серверному времени)
  let cooldownMs = 0
  if (lastAdTimestamp) {
    cooldownMs = Math.max(0, AD_COOLDOWN_MS - (now - lastAdTimestamp))
  }
  const canWatchAd = todayAdsWatched < LIMITS.adsPerDay && cooldownMs === 0

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
      {/* Баланс */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        <TokenIcon width={14} height={14} />
        <strong>{tokens}</strong>
      </div>

      {/* Бонус — всегда показываем состояние */}
      {ECONOMY_UI.showDailyBonus && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <GiftIcon width={14} height={14} />
          {bonusAvailable ? (
            <span style={{ color: 'var(--success)' }}>+50</span>
          ) : (
            <span style={{ color: 'var(--text-muted)' }}>—</span>
          )}
        </div>
      )}

      {/* Реклама — всегда показываем состояние */}
      {ECONOMY_UI.showAdButton && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <AdFilmIcon width={14} height={14} />
          {canWatchAd ? (
            <span>{todayAdsWatched}/3</span>
          ) : cooldownMs > 0 ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: '2px', color: 'var(--text-muted)' }}>
              <ClockIcon width={10} height={10} /> {formatCooldown(cooldownMs)}
            </span>
          ) : (
            <span style={{ color: 'var(--text-muted)' }}>—</span>
          )}
        </div>
      )}
    </div>
  )
}
