// src/components/Badge.tsx — Бейджи на кнопках экономики (§6.4 ECONOMY.md v2.0)
// Токены слева-внизу / реклама справа-внизу — когда нет доступа
// Корона/часы слева-вверху — когда доступ активен. Только SVG-иконки, без эмодзи.
// UB2-3b: иконка 14px ВНУТРИ контейнера (раньше 20px иконка выступала за ×0.75-контейнер
// с overflow:visible и накрывала заметную часть кнопки-родителя). Оффсеты −3px —
// бейдж сильнее выходит ЗА кнопку и меньше перекрывает её содержимое.
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

  // UB2-3b: контейнер вмещает иконку (14px) + число (8px) — без выхода за границы.
  // История размеров: U7 (иконки ×2) → UB-5 (контейнер ×0.75, иконки 20px с
  // overflow) → UB2-3b (иконка 14px внутри контейнера, оффсет −3px наружу).
  let style: React.CSSProperties = {
    position: 'absolute',
    pointerEvents: 'none' as const,
    fontSize: '8px',
    fontWeight: 700,
    borderRadius: '3px',
    padding: '1px 3px',
    display: 'flex',
    alignItems: 'center',
    gap: '2px',
    boxShadow: '0 1px 2px rgba(0, 0, 0, 0.3)',
    minWidth: '14px',
    minHeight: '12px',
    justifyContent: 'center',
    lineHeight: 1,
  }

  let content: ReactNode = null

  switch (type) {
    case 'tokens':
      if (isActive) {
        // Активен — корона слева-вверху (золотая)
        style = { ...style, top: '-3px', left: '-3px', background: '#f59e0b', color: '#ffffff' }
        content = <CrownIcon width={14} height={14} />
      } else {
        // Нет доступа — токены слева-внизу (жёлтые). C2: золотой куб-логотип
        // вместо «монеты» — иконка токена проекта (TokenIcon из icons/index.tsx).
        style = { ...style, bottom: '-3px', left: '-3px', background: '#fbbf24', color: '#78350f' }
        content = <><TokenIcon width={14} height={14} />{value && <span>{value}</span>}</>
      }
      break

    case 'ad':
      if (isActive) {
        // Активен — часы слева-вверху (зелёные)
        style = { ...style, top: '-3px', left: '-3px', background: '#10b981', color: '#ffffff' }
        content = <ClockIcon width={14} height={14} />
      } else {
        // Нет доступа — реклама справа-внизу (фиолетовая)
        style = { ...style, bottom: '-3px', right: '-3px', background: '#8b5cf6', color: '#ffffff' }
        content = <><AdFilmIcon width={14} height={14} />{value && <span>{value}</span>}</>
      }
      break

    case 'cooldown':
      // Часы слева-вверху (зелёные)
      style = { ...style, top: '-3px', left: '-3px', background: '#10b981', color: '#ffffff' }
      content = <><ClockIcon width={14} height={14} />{value && <span>{value}</span>}</>
      break

    case 'pro':
      // Корона слева-вверху (зелёная — подписка активна)
      style = { ...style, top: '-3px', left: '-3px', background: '#10b981', color: '#ffffff' }
      content = <CrownIcon width={14} height={14} />
      break
  }

  return (
    <span style={style}>
      {content}
    </span>
  )
}
