// src/components/Badge.tsx — Бейджи на кнопках экономики (§6.4 ECONOMY.md v2.0)
// Токены слева-внизу / реклама справа-внизу — когда нет доступа
// Корона/часы слева-вверху — когда доступ активен. Только SVG-иконки, без эмодзи.
// C1: компактный контейнер (шрифт 10px, minWidth 16px), крупные иконки 20px.
import type { ReactNode } from 'react'
import { TokenIcon, AdFilmIcon, ClockIcon, CrownIcon } from './icons'

export type BadgeType = 'tokens' | 'ad' | 'cooldown' | 'pro'

interface BadgeProps {
  type: BadgeType
  value?: string // количество рекламы (1, 2, 3) или время кулдауна
  isActive?: boolean // true если доступ активен (показываем ⏱/👑)
}

export default function Badge({ type, value, isActive }: BadgeProps) {
  if (!type) return null

  // C1: компактный контейнер как было ДО U7 — шрифт 10px, padding 1px 3px,
  // minWidth 16px / minHeight 14px. Увеличены ТОЛЬКО иконки (10 → 20px).
  let style: React.CSSProperties = {
    position: 'absolute',
    pointerEvents: 'none' as const,
    fontSize: '10px',
    fontWeight: 700,
    borderRadius: '4px',
    padding: '1px 3px',
    display: 'flex',
    alignItems: 'center',
    gap: '2px',
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.3)',
    minWidth: '16px',
    minHeight: '14px',
    justifyContent: 'center',
    lineHeight: 1,
  }

  let content: ReactNode = null

  switch (type) {
    case 'tokens':
      if (isActive) {
        // Активен — корона слева-вверху (золотая)
        style = { ...style, top: '-2px', left: '-2px', background: '#f59e0b', color: '#ffffff' }
        content = <CrownIcon width={20} height={20} />
      } else {
        // Нет доступа — токены слева-внизу (жёлтые). C2: золотой куб-логотип
        // вместо «монеты» — иконка токена проекта (TokenIcon из icons/index.tsx).
        style = { ...style, bottom: '-2px', left: '-2px', background: '#fbbf24', color: '#78350f' }
        content = <><TokenIcon width={20} height={20} />{value && <span>{value}</span>}</>
      }
      break

    case 'ad':
      if (isActive) {
        // Активен — часы слева-вверху (зелёные)
        style = { ...style, top: '-2px', left: '-2px', background: '#10b981', color: '#ffffff' }
        content = <ClockIcon width={20} height={20} />
      } else {
        // Нет доступа — реклама справа-внизу (фиолетовая)
        style = { ...style, bottom: '-2px', right: '-2px', background: '#8b5cf6', color: '#ffffff' }
        content = <AdFilmIcon width={20} height={20} />
      }
      break

    case 'cooldown':
      // Часы слева-вверху (зелёные)
      style = { ...style, top: '-2px', left: '-2px', background: '#10b981', color: '#ffffff' }
      content = <ClockIcon width={20} height={20} />
      break

    case 'pro':
      // Корона слева-вверху (зелёная — подписка активна)
      style = { ...style, top: '-2px', left: '-2px', background: '#10b981', color: '#ffffff' }
      content = <CrownIcon width={20} height={20} />
      break
  }

  return (
    <span style={style}>
      {content}
    </span>
  )
}
