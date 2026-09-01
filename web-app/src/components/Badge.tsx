// src/components/Badge.tsx — Бейджи на кнопках экономики (§6.4 ECONOMY.md v2.0)
// 💰 слева-внизу / 📺 справа-внизу — когда нет доступа
// ⏱/👑 слева-вверху — когда активен
import type { ReactNode } from 'react'
import { MoneyIcon, AdFilmIcon, ClockIcon, CrownIcon } from './icons'

export type BadgeType = 'tokens' | 'ad' | 'cooldown' | 'pro'

interface BadgeProps {
  type: BadgeType
  value?: string // количество рекламы (1, 2, 3) или время кулдауна
  isActive?: boolean // true если доступ активен (показываем ⏱/👑)
}

export default function Badge({ type, value, isActive }: BadgeProps) {
  if (!type) return null

  // Определяем позицию и содержимое с улучшенной видимостью
  let style: React.CSSProperties = {
    position: 'absolute',
    pointerEvents: 'none' as const,
    fontSize: '10px',
    fontWeight: 700,
    borderRadius: '4px',
    padding: '2px 5px',
    display: 'flex',
    alignItems: 'center',
    gap: '2px',
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.3)',
    minWidth: '18px',
    minHeight: '14px',
    justifyContent: 'center',
  }

  let content: ReactNode = null

  switch (type) {
    case 'tokens':
      if (isActive) {
        // Активен — 👑 слева-вверху (золотой)
        style = { ...style, top: '-2px', left: '-2px', background: '#f59e0b', color: '#ffffff', fontSize: '11px' }
        content = <CrownIcon width={10} height={10} />
      } else {
        // Нет доступа — 💰 слева-внизу (жёлтый)
        style = { ...style, bottom: '-2px', left: '-2px', background: '#fbbf24', color: '#78350f', fontSize: '11px' }
        content = <><MoneyIcon width={10} height={10} style={{ fill: '#78350f' }} />{value && <span style={{ fontSize: '9px' }}>{value}</span>}</>
      }
      break

    case 'ad':
      if (isActive) {
        // Активен — ⏱ слева-вверху (зелёный)
        style = { ...style, top: '-2px', left: '-2px', background: '#10b981', color: '#ffffff', fontSize: '11px' }
        content = <ClockIcon width={10} height={10} />
      } else {
        // Нет доступа — 📺 справа-внизу (фиолетовый)
        style = { ...style, bottom: '-2px', right: '-2px', background: '#8b5cf6', color: '#ffffff', fontSize: '11px' }
        content = <AdFilmIcon width={10} height={10} />
      }
      break

    case 'cooldown':
      // ⏱ слева-вверху (зелёный)
      style = { ...style, top: '-2px', left: '-2px', background: '#10b981', color: '#ffffff', fontSize: '11px' }
      content = <ClockIcon width={10} height={10} />
      break

    case 'pro':
      // 👑 слева-вверху (зелёный — подписка активна)
      style = { ...style, top: '-2px', left: '-2px', background: '#10b981', color: '#ffffff', fontSize: '11px' }
      content = <CrownIcon width={10} height={10} />
      break
  }

  return (
    <span style={style}>
      {content}
    </span>
  )
}
