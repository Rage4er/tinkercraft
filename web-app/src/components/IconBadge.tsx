// src/components/IconBadge.tsx — Бейджи на кнопках инструментов (§6.4 ECONOMY.md v2.0)
import type { SVGProps } from 'react'
import { TokenIcon, AdFilmIcon, ClockIcon, CrownIcon } from './icons'

/** Типы бейджей */
export type BadgeType = 'tokens' | 'ad' | 'timer' | 'crown'

/** Props для бейджа */
export interface BadgeProps {
  type: BadgeType
  /** Текст/число для отображения (например, "14 ч") */
  label?: string
}

/** Цветовая схема для каждого типа бейджа */
const badgeStyles: Record<BadgeType, { bg: string; color: string }> = {
  tokens: { bg: '#fbbf24', color: '#78350f' },    // жёлтый + тёмно-коричневый
  ad: { bg: '#8b5cf6', color: '#ffffff' },    // фиолетовый + белый
  timer: { bg: '#10b981', color: '#ffffff' },    // зелёный + белый
  crown: { bg: '#f59e0b', color: '#ffffff' },    // золотой + белый
}

/** Бейдж ¼ кнопки, pointer-events:none */
export default function IconBadge({ type, label }: BadgeProps) {
  const size = 16
  const style = badgeStyles[type]

  // Иконка в зависимости от типа
  const icon = (() => {
    switch (type) {
      case 'tokens':
        return <TokenIcon width={size} height={size} style={{ fill: style.color }} />
      case 'ad':
        return <AdFilmIcon width={size} height={size} style={{ fill: style.color }} />
      case 'timer':
        return <ClockIcon width={size} height={size} style={{ fill: style.color }} />
      case 'crown':
        return <CrownIcon width={size} height={size} style={{ fill: style.color }} />
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
        background: style.bg,
        color: style.color,
        fontSize: '11px',
        fontWeight: 700,
        borderRadius: 4,
        padding: '3px 5px',
        minWidth: 20,
        minHeight: 16,
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.3)',
      }}
    >
      {icon}
      {label && (
        <span style={{ fontSize: '9px', marginLeft: '1px', lineHeight: 1 }}>{label}</span>
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
