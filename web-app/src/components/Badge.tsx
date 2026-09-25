// src/components/Badge.tsx — Бейджи на кнопках экономики (§6.4 ECONOMY.md v2.5)
// Токены слева-внизу / реклама справа-внизу — когда нет доступа
// Корона/часы слева-вверху — когда доступ активен. Только SVG-иконки, без эмодзи.
// UB2-3b: иконка 14px ВНУТРИ контейнера (раньше 20px иконка выступала за ×0.75-контейнер
// с overflow:visible и накрывала заметную часть кнопки-родителя). Оффсеты −3px —
// бейдж сильнее выходит ЗА кнопку и меньше перекрывает её содержимое.
// UB3-4: ЗАЛИВКА УБРАНА у всех бейджей (background/boxShadow) — бейджи на тулбаре
// перекрывали кнопки. Цветовой акцент остаётся в самой иконке (TokenIcon — золотой
// куб по определению), читаемость цифры обеспечивает двойная текстовая обводка
// (тёмная + светлая), работающая и на тёмной, и на светлой теме.
import type { ReactNode } from 'react'
import { TokenIcon, AdFilmIcon, ClockIcon, CrownIcon } from './icons'

export type BadgeType = 'tokens' | 'ad' | 'cooldown' | 'pro'

interface BadgeProps {
  type: BadgeType
  value?: string // количество рекламы (1, 2, 3) или время кулдауна
  isActive?: boolean // true если доступ активен (показываем ⏱/👑)
}

/**
 * UB3-4: обводка числа на прозрачном фоне. Тёмное гало читается на светлых
 * кнопках, светлое — на тёмных; обе тени применяются одновременно.
 */
export const BADGE_TEXT_HALO = '0 0 2px rgba(0,0,0,0.85), 0 0 2px rgba(255,255,255,0.75)'

export default function Badge({ type, value, isActive }: BadgeProps) {
  if (!type) return null

  // UB2-3b: контейнер вмещает иконку (14px) + число (8px) — без выхода за границы.
  // UB3-4: без background и boxShadow — бейдж полностью прозрачен.
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
    minWidth: '14px',
    minHeight: '12px',
    justifyContent: 'center',
    lineHeight: 1,
    textShadow: BADGE_TEXT_HALO,
  }

  let content: ReactNode = null

  switch (type) {
    case 'tokens':
      if (isActive) {
        // Активен — корона слева-вверху (золотая, без подложки)
        style = { ...style, top: '-3px', left: '-3px', color: '#f59e0b' }
        content = <CrownIcon width={14} height={14} />
      } else {
        // Нет доступа — токены слева-внизу. C2: золотой куб-логотип
        // (TokenIcon имеет intrinsic-золото граней и не наследует color).
        style = { ...style, bottom: '-3px', left: '-3px', color: '#78350f' }
        content = <><TokenIcon width={14} height={14} />{value && <span>{value}</span>}</>
      }
      break

    case 'ad':
      if (isActive) {
        // Активен — часы слева-вверху (зелёные, без подложки)
        style = { ...style, top: '-3px', left: '-3px', color: '#10b981' }
        content = <ClockIcon width={14} height={14} />
      } else {
        // Нет доступа — реклама справа-внизу (фиолетовая, без подложки)
        style = { ...style, bottom: '-3px', right: '-3px', color: '#8b5cf6' }
        content = <><AdFilmIcon width={14} height={14} />{value && <span>{value}</span>}</>
      }
      break

    case 'cooldown':
      // Часы слева-вверху (зелёные, без подложки)
      style = { ...style, top: '-3px', left: '-3px', color: '#10b981' }
      content = <><ClockIcon width={14} height={14} />{value && <span>{value}</span>}</>
      break

    case 'pro':
      // Корона слева-вверху (золотая — подписка активна, без подложки)
      style = { ...style, top: '-3px', left: '-3px', color: '#f59e0b' }
      content = <CrownIcon width={14} height={14} />
      break
  }

  return (
    <span style={style}>
      {content}
    </span>
  )
}
