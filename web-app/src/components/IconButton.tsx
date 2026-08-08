// ============================================================
// IconButton — универсальная кнопка с иконкой, тултипом и темой
// ============================================================
// Используется во всех местах: Toolbar, PropertiesPanel, LeftPanel и т.д.
// Поддерживает два варианта: compact (только иконка + tooltip) и full (иконка + текст).

import React from 'react'
import Tooltip, { type TooltipData } from './Tooltip'

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
}: IconButtonProps): React.ReactElement {
  const btnClass = `btn${variant === 'compact' ? ' btn-compact' : ''}${buttonVariant !== 'default' ? ` ${buttonVariant}` : ''}${className ? ` ${className}` : ''}`

  const content = (
    <button
      className={btnClass}
      onClick={onClick}
      disabled={disabled}
      title={title ?? ariaLabel}
      aria-label={ariaLabel ?? title ?? ''}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <span className="icon">{icon}</span>
      {variant === 'full' && label && <span className="label">{label}</span>}
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
