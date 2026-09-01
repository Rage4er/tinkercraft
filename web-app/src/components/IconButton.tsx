// ============================================================
// IconButton — универсальная кнопка с иконкой, тултипом и темой
// ============================================================
// Используется во всех местах: Toolbar, PropertiesPanel, LeftPanel и т.д.
// Поддерживает два варианта: compact (только иконка + tooltip) и full (иконка + текст).

import React from 'react'
import Tooltip, { type TooltipData } from './Tooltip'
import IconBadge, { type BadgeType } from './IconBadge'

export type IconButtonVariant = 'compact' | 'full'
export type ButtonVariant = 'default' | 'primary' | 'danger' | 'active'

export interface IconButtonProps {
  /** Иконка (компонент SVG) */
  icon: React.ReactNode
  /** Текст под иконкой (для variant="full") */
  label?: string
  /** Обработчик клика */
  onClick?: () => void
  /** Вариант отображения */
  variant?: IconButtonVariant
  /** Стилевой вариант кнопки */
  buttonVariant?: ButtonVariant
  /** Отключена ли кнопка */
  disabled?: boolean
  /** Тултип (показывается при наведении, для compact всегда, для full — опционально) */
  title?: string
  /** Данные расширенного тултипа (двухуровневый) */
  tooltip?: TooltipData
  /** Дополнительный CSS-класс */
  className?: string
  /** ARIA-label для доступности */
  ariaLabel?: string
  /** Обработчики мыши (для preview mirror) */
  onMouseEnter?: () => void
  onMouseLeave?: () => void
  /** Бейдж цены (например, 75 токенов) */
  priceBadge?: number
  /** Бейдж рекламы (просмотр рекламы) */
  adBadge?: boolean
  /** Бейдж таймера (осталось времени) */
  timerBadge?: string
  /** Бейдж PRO (корона) */
  proBadge?: boolean
}

export default function IconButton({
  icon,
  label,
  onClick,
  variant = 'compact',
  buttonVariant = 'default',
  disabled = false,
  title,
  tooltip,
  className = '',
  ariaLabel,
  onMouseEnter,
  onMouseLeave,
  priceBadge,
  adBadge,
  timerBadge,
  proBadge,
}: IconButtonProps): React.ReactElement {
  const btnClass = `btn${variant === 'compact' ? ' btn-compact' : ''}${buttonVariant !== 'default' ? ` ${buttonVariant}` : ''}${className ? ` ${className}` : ''}`

  // Собираем бейджи
  const badges: React.ReactNode[] = []
  if (priceBadge !== undefined) {
    badges.push(
      <IconBadge
        key="price"
        type="tokens"
        label={`${priceBadge}`}
      />
    )
  }
  if (adBadge) {
    badges.push(
      <IconBadge
        key="ad"
        type="ad"
      />
    )
  }
  if (timerBadge) {
    badges.push(
      <IconBadge
        key="timer"
        type="timer"
        label={timerBadge}
      />
    )
  }
  if (proBadge) {
    badges.push(
      <IconBadge
        key="pro"
        type="crown"
      />
    )
  }

  const content = (
    <button
      className={btnClass}
      onClick={onClick}
      disabled={disabled}
      title={title ?? ariaLabel}
      aria-label={ariaLabel ?? title ?? ''}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={badges.length > 0 ? { position: 'relative' } : undefined}
    >
      <span className="icon">{icon}</span>
      {variant === 'full' && label && <span className="label">{label}</span>}
      {badges.map((badge, i) => (
        <div
          key={`badge-${i}`}
          style={{
            position: 'absolute',
            ...(i === 0 && badges.length === 1 ? { bottom: 0, left: 0 } : {}),
            ...(badges.length === 2 && i === 0 ? { bottom: 0, left: 0 } : {}),
            ...(badges.length === 2 && i === 1 ? { bottom: 0, right: 0 } : {}),
            ...(badges.length >= 3 && i === 0 ? { top: 0, left: 0 } : {}),
            ...(badges.length >= 3 && i === 1 ? { top: 0, right: 0 } : {}),
            ...(badges.length >= 3 && i === 2 ? { bottom: 0, left: 0 } : {}),
          }}
        >
          {badge}
        </div>
      ))}
    </button>
  )

  // Если есть расширенный тултип — оборачиваем в Tooltip
  if (tooltip) {
    return (
      <Tooltip tooltip={tooltip}>{content}</Tooltip>
    )
  }

  return content
}
