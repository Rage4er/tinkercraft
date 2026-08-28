// src/components/IconBadge.tsx — Бейджи на кнопках инструментов (§6.4 ECONOMY.md v2.0)
import type { SVGProps } from 'react'
import { TokenIcon, AdFilmIcon } from './icons'

/** Типы бейджей */
export type BadgeType = 'tokens' | 'ad' | 'timer' | 'crown'

/** Props для бейджа */
export interface BadgeProps {
  type: BadgeType
  /** Текст/число для отображения (например, "14 ч") */
  label?: string
}

/** Бейдж ¼ кнопки, pointer-events:none */
export default function IconBadge({ type, label }: BadgeProps) {
  const size = 16

  // Иконка в зависимости от типа
  const icon = (() => {
    switch (type) {
      case 'tokens':
        return <TokenIcon width={size} height={size} style={{ fill: 'currentColor' }} />
      case 'ad':
        return <AdFilmIcon width={size} height={size} style={{ fill: 'currentColor' }} />
      case 'timer':
        return <span style={{ fontSize: '10px' }}>⏱</span>
      case 'crown':
        return <span style={{ fontSize: '10px' }}>👑</span>
    }
  })()

  return (
    <div
      className="icon-badge"
      style={{
        position: 'absolute',
        width: '25%',
        height: '25%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'none',
        color: 'var(--text-muted)',
        opacity: 0.9,
      }}
    >
      {icon}
      {label && (
        <span style={{ fontSize: '8px', marginLeft: '1px' }}>{label}</span>
      )}
    </div>
  )
}

/** Позиционирование бейджа на кнопке */
export function getBadgePosition(type: BadgeType, corner: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right') {
  const pos = { top: '0', right: '0', bottom: '0', left: '0' }

  switch (corner) {
    case 'top-left':
      return { ...pos, top: '0', left: '0' }
    case 'top-right':
      return { ...pos, top: '0', right: '0' }
    case 'bottom-left':
      return { ...pos, bottom: '0', left: '0' }
    case 'bottom-right':
      return { ...pos, bottom: '0', right: '0' }
  }
}
