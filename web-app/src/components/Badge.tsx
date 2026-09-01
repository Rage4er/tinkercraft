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

  // Определяем позицию и содержимое
  let style: React.CSSProperties = {
    position: 'absolute',
    pointerEvents: 'none' as const,
    fontSize: '10px',
    display: 'flex',
    alignItems: 'center',
    gap: '2px',
    fontWeight: 'bold',
  }

  let content: ReactNode = null

  switch (type) {
    case 'tokens':
      if (isActive) {
        // Активен — 👑 слева-вверху
        style = { ...style, top: '-4px', left: '-4px', background: 'var(--success)', color: 'white', padding: '1px 4px', borderRadius: '4px' }
        content = <CrownIcon width={10} height={10} />
      } else {
        // Нет доступа — 💰 слева-внизу
        style = { ...style, bottom: '-4px', left: '-4px', background: 'var(--warning)', color: 'black', padding: '1px 4px', borderRadius: '4px' }
        content = <MoneyIcon width={10} height={10} />
      }
      break

    case 'ad':
      if (isActive) {
        // Активен — ⏱ слева-вверху
        style = { ...style, top: '-4px', left: '-4px', background: 'var(--primary)', color: 'white', padding: '1px 4px', borderRadius: '4px' }
        content = <ClockIcon width={10} height={10} />
      } else {
        // Нет доступа — 📺 справа-внизу
        style = { ...style, bottom: '-4px', right: '-4px', background: 'var(--text-muted)', color: 'white', padding: '1px 4px', borderRadius: '4px' }
        content = <AdFilmIcon width={10} height={10} />
      }
      break

    case 'cooldown':
      // ⏱ слева-вверху (когда активен и кулдаун)
      style = { ...style, top: '-4px', left: '-4px', background: 'var(--primary)', color: 'white', padding: '1px 4px', borderRadius: '4px' }
      content = <ClockIcon width={10} height={10} />
      break

    case 'pro':
      // 👑 слева-вверху (подписка активна)
      style = { ...style, top: '-4px', left: '-4px', background: 'var(--success)', color: 'white', padding: '1px 4px', borderRadius: '4px' }
      content = <CrownIcon width={10} height={10} />
      break
  }

  return (
    <span style={style}>
      {content}
    </span>
  )
}
