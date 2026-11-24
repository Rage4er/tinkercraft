// ============================================================
// ViewModeMenu.tsx — VIEW-MODES: меню режимов отображения у ViewCube
// ============================================================
// Маленькая кнопка слева от видового куба → меню из трёх пунктов:
// «Реалистичный» (заливка, тени), «Каркас» (только рёбра), «Скрытые линии»
// (непрозрачная заливка цветом фона + рёбра, задние скрыты). Выбор применяется сразу.

import { useEffect, useLayoutEffect, useRef, useState, type ReactElement } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { useUiStore, type ViewMode } from '../store/ui-store'
import { ViewRealisticIcon, ViewWireframeIcon, ViewHiddenLineIcon } from './icons'

const ITEMS: Array<{ mode: ViewMode; labelKey: string; icon: (p: { size?: number }) => ReactElement }> = [
  { mode: 'realistic', labelKey: 'viewMode.realistic', icon: ViewRealisticIcon },
  { mode: 'wireframe', labelKey: 'viewMode.wireframe', icon: ViewWireframeIcon },
  { mode: 'hidden-line', labelKey: 'viewMode.hiddenLine', icon: ViewHiddenLineIcon },
]

function ActiveIcon({ mode, size }: { mode: ViewMode; size: number }) {
  const Icon = ITEMS.find((i) => i.mode === mode)?.icon ?? ViewRealisticIcon
  return <Icon size={size} />
}

export default function ViewModeMenu() {
  const { t } = useTranslation()
  const viewMode = useUiStore((s) => s.viewMode)
  const setViewMode = useUiStore((s) => s.setViewMode)
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (!open || !wrapRef.current) return
    const r = wrapRef.current.getBoundingClientRect()
    setPos({ left: Math.max(4, Math.min(r.left, window.innerWidth - 230)), top: Math.max(4, r.top - 8 - 3 * 34) })
  }, [open])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (menuRef.current?.contains(target) || wrapRef.current?.contains(target)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopImmediatePropagation()
      setOpen(false)
    }
    document.addEventListener('mousedown', onDown, true)
    window.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('mousedown', onDown, true)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [open])

  const pick = (mode: ViewMode) => () => {
    setViewMode(mode)
    setOpen(false)
  }

  return (
    <div className="view-mode-menu" ref={wrapRef}>
      <button
        type="button"
        className={`view-mode-btn${open ? ' active' : ''}`}
        data-testid="view-mode-button"
        aria-label={t('viewMode.menu')}
        title={t('viewMode.menu')}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <ActiveIcon mode={viewMode} size={26} />
      </button>
      {open && pos && createPortal(
        <div
          ref={menuRef}
          className="tb-menu view-mode-popup"
          role="menu"
          aria-label={t('viewMode.menu')}
          data-testid="view-mode-menu"
          style={{ left: pos.left, top: pos.top }}
        >
          {ITEMS.map(({ mode, labelKey, icon: Icon }) => (
            <button
              key={mode}
              type="button"
              role="menuitemradio"
              aria-checked={viewMode === mode}
              className="tb-menu-item"
              data-testid={`view-mode-${mode}`}
              onClick={pick(mode)}
            >
              <span className="tb-menu-check">{viewMode === mode ? '✓' : ''}</span>
              <span className="tb-menu-icon"><Icon size={26} /></span>
              <span className="tb-menu-label">{t(labelKey)}</span>
            </button>
          ))}
        </div>,
        document.body,
      )}
    </div>
  )
}
