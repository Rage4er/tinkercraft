// src/components/IconBadge.tsx — Бейджи на кнопках инструментов (§6.4 ECONOMY.md v2.5)
// UB2-3b: иконка 16px, компактный контейнер вмещает её (раньше 20px иконка
// в контейнере minWidth 20/minHeight 16 перекрывала четверть кнопки).
// UB3-4: заливка убрана (background/boxShadow) — цветовой акцент в иконке
// (color → currentColor; TokenIcon остаётся intrinsic-золотым), цифра читается
// за счёт двойной текстовой обводки.
import { TokenIcon, AdFilmIcon, ClockIcon, CrownIcon } from './icons'
import { BADGE_TEXT_HALO } from './Badge'

/** Типы бейджей */
export type BadgeType = 'tokens' | 'ad' | 'timer' | 'crown'

/** Props для бейджа */
export interface BadgeProps {
  type: BadgeType
  /** Текст/число для отображения (например, "14 ч") */
  label?: string
}

/** UB3-4: акцентный цвет иконки/цифры для каждого типа (без подложки) */
const badgeStyles: Record<BadgeType, { accent: string }> = {
  tokens: { accent: '#78350f' }, // тёмно-коричневый (куб TokenIcon — золотой сам по себе)
  ad: { accent: '#8b5cf6' },     // фиолетовый
  timer: { accent: '#10b981' },  // зелёный
  crown: { accent: '#f59e0b' },  // золотой
}

/** Бейдж ¼ кнопки, pointer-events:none, без заливки (UB3-4) */
export default function IconBadge({ type, label }: BadgeProps) {
  // UB2-3b: иконка 16px, контейнер под неё
  const size = 16
  const style = badgeStyles[type]

  // Иконка в зависимости от типа
  const icon = (() => {
    switch (type) {
      case 'tokens':
        return <TokenIcon width={size} height={size} />
      case 'ad':
        return <AdFilmIcon width={size} height={size} style={{ color: style.accent }} />
      case 'timer':
        return <ClockIcon width={size} height={size} style={{ color: style.accent }} />
      case 'crown':
        return <CrownIcon width={size} height={size} style={{ color: style.accent }} />
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
        color: style.accent,
        fontSize: '9px',
        fontWeight: 700,
        borderRadius: 4,
        padding: '1px 3px',
        minWidth: 16,
        minHeight: 12,
        lineHeight: 1,
        textShadow: BADGE_TEXT_HALO,
      }}
    >
      {icon}
      {label && (
        <span style={{ fontSize: '9px', marginLeft: '2px', lineHeight: 1 }}>{label}</span>
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
