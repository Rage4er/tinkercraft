// ============================================================
// Tooltip — двухуровневая подсказка с задержкой
// ============================================================
// Уровень 1 (мгновенно): название + горячая клавиша
// Уровень 2 (через 1.5 сек): описание + пример использования
//
// Профессиональный стандарт UX (AutoCAD, Fusion 360, Blender):
// - Новички получают объяснение
// - Профессионалы видят горячие клавиши
// - Не отвлекает, если не задерживаться

import React, { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'

export interface TooltipData {
  /** i18n key for the label (shown instantly) */
  labelKey: string
  /** Hotkey (optional) */
  shortcut?: string
  /** i18n key for the extended description (shown after delay) */
  descriptionKey?: string
}

export type TooltipPosition = 'top' | 'bottom' | 'left' | 'right'

export interface TooltipProps {
  /** Данные подсказки */
  tooltip: TooltipData
  /** Задержка перед расширенной подсказкой (мс) */
  delay?: number
  /** Позиция подсказки */
  position?: TooltipPosition
  children: React.ReactNode
}

export default function Tooltip({
  tooltip,
  delay = 1500,
  position = 'bottom',
  children,
}: TooltipProps): React.ReactElement {
  const { t } = useTranslation()
  const [isVisible, setIsVisible] = useState(false)
  const [showExtended, setShowExtended] = useState(false)
  const timerRef = useRef<number | null>(null)
  const [coords, setCoords] = useState({ x: 0, y: 0 })

  const handleMouseEnter = (e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setCoords({
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height,
    })
    setIsVisible(true)
    setShowExtended(false)
    // Запускаем таймер для расширенной подсказки
    timerRef.current = window.setTimeout(() => {
      setShowExtended(true)
    }, delay)
  }

  const handleMouseLeave = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    setIsVisible(false)
    setShowExtended(false)
  }

  // Очистка при размонтировании
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }
    }
  }, [])

  // Позиционирование
  const getPositionStyle = (): React.CSSProperties => {
    const base: React.CSSProperties = {
      position: 'fixed',
      zIndex: 9999,
      pointerEvents: 'none' as const,
    }
    const offset = 8

    switch (position) {
      case 'bottom':
        return {
          ...base,
          top: coords.y + offset,
          left: coords.x,
          transform: 'translateX(-50%)',
        }
      case 'top':
        return {
          ...base,
          top: coords.y - offset,
          left: coords.x,
          transform: 'translateX(-50%) translateY(-100%)',
        }
      case 'left':
        return {
          ...base,
          top: coords.y,
          left: coords.x - offset,
          transform: 'translateX(-100%) translateY(-50%)',
        }
      case 'right':
        return {
          ...base,
          top: coords.y,
          left: coords.x + offset,
          transform: 'translateY(-50%)',
        }
      default:
        return {
          ...base,
          top: coords.y + offset,
          left: coords.x,
          transform: 'translateX(-50%)',
        }
    }
  }

  return (
    <div
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={{ display: 'inline-block' }}
    >
      {children}
      {isVisible && (
        <div
          style={getPositionStyle()}
          className="tk-tooltip"
        >
          {/* Уровень 1: Быстрая подсказка */}
          <div className="tk-tooltip-header">
            <span className="tk-tooltip-label">{t(tooltip.labelKey)}</span>
            {tooltip.shortcut && (
              <span className="tk-tooltip-shortcut">{tooltip.shortcut}</span>
            )}
          </div>
          {/* Уровень 2: Расширенная подсказка */}
          {showExtended && tooltip.descriptionKey && (
            <div className="tk-tooltip-description">
              {t(tooltip.descriptionKey)}
            </div>
          )}
          {/* Стрелка */}
          <div className="tk-tooltip-arrow" />
        </div>
      )}
    </div>
  )
}
