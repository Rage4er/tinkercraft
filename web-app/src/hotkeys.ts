// ============================================================
// hotkeys — клавиша → действие (UX-AUDIT-5)
// ============================================================
//
// Подсказки тулбара (`TOOLTIP_DATA[*].shortcut`) обещали Tab, L, M/N/B, U/X/I, а обработчик
// App знал только G/R/S/F/H/Esc/Del и Ctrl+…. Теперь соответствие клавиш действиям — здесь,
// одной чистой функцией; App исполняет действие. Тест `hotkeys.test.ts` сверяет каждое
// сочетание из подсказок с этим списком — подсказка без обработчика не пройдёт CI.
//
// `e.code` — физическая клавиша: работает в любой раскладке (ru/en).

export type HotkeyAction =
  | 'delete' | 'undo' | 'redo' | 'selectAll' | 'save' | 'open' | 'copy' | 'paste'
  | 'fitView' | 'homeView' | 'toggleCamera'
  | 'gizmoTranslate' | 'gizmoRotate' | 'gizmoScale' | 'escape'
  | 'ruler' | 'mirrorYZ' | 'mirrorXZ' | 'mirrorXY'
  | 'union' | 'subtract' | 'intersect'
  | 'dimension'

export interface KeyLike {
  code: string
  ctrlKey?: boolean
  metaKey?: boolean
  shiftKey?: boolean
  altKey?: boolean
}

/** Ctrl (Cmd на macOS) + клавиша */
const CTRL_KEYS: Record<string, HotkeyAction> = {
  KeyA: 'selectAll', KeyS: 'save', KeyO: 'open', KeyC: 'copy', KeyV: 'paste', KeyY: 'redo',
}

/** Одиночные клавиши без Ctrl/Alt */
const PLAIN_KEYS: Record<string, HotkeyAction> = {
  KeyF: 'fitView', KeyH: 'homeView',
  KeyG: 'gizmoTranslate', KeyR: 'gizmoRotate', KeyS: 'gizmoScale',
  KeyL: 'ruler',
  KeyD: 'dimension',
  KeyM: 'mirrorYZ', KeyN: 'mirrorXZ', KeyB: 'mirrorXY',
  KeyU: 'union', KeyX: 'subtract', KeyI: 'intersect',
  Tab: 'toggleCamera',
}

/** Действия-переключатели и операции: автоповтор зажатой клавиши их не повторяет. */
export const NO_REPEAT: ReadonlySet<HotkeyAction> = new Set<HotkeyAction>([
  'toggleCamera', 'gizmoTranslate', 'gizmoRotate', 'gizmoScale', 'ruler',
  'mirrorYZ', 'mirrorXZ', 'mirrorXY', 'union', 'subtract', 'intersect',
  'save', 'open', 'copy', 'paste', 'fitView', 'homeView', 'dimension',
])

export function resolveHotkey(e: KeyLike): HotkeyAction | null {
  const ctrl = !!(e.ctrlKey || e.metaKey)
  if (e.code === 'Backspace' || e.code === 'Delete') return 'delete'
  if (e.code === 'Escape') return 'escape'
  if (ctrl) {
    if (e.code === 'KeyZ') return e.shiftKey ? 'redo' : 'undo'
    return CTRL_KEYS[e.code] ?? null
  }
  if (e.altKey) return null
  if (e.code === 'Tab' && e.shiftKey) return null          // Shift+Tab — обычная навигация фокусом
  return PLAIN_KEYS[e.code] ?? null
}

/** Плоскость зеркала по действию (M — YZ, N — XZ, B — XY, как кнопки тулбара). */
export function mirrorPlaneOf(a: HotkeyAction): 'YZ' | 'XZ' | 'XY' | null {
  return a === 'mirrorYZ' ? 'YZ' : a === 'mirrorXZ' ? 'XZ' : a === 'mirrorXY' ? 'XY' : null
}

/** CSG-операция по действию (U — union, X — subtract, I — intersect). */
export function csgOpOf(a: HotkeyAction): 'union' | 'subtract' | 'intersect' | null {
  return a === 'union' || a === 'subtract' || a === 'intersect' ? a : null
}

/** Ввод текста — сочетания не перехватываются (поле, textarea, select, contentEditable). */
export function isTextEntry(el: Element | null): boolean {
  if (!el) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (el as HTMLElement).isContentEditable === true
}

/**
 * Tab переключает камеру, только когда фокус не на элементе управления (body или вьюпорт) —
 * иначе Tab остаётся навигацией с клавиатуры по кнопкам (доступность).
 */
export function tabTogglesCamera(active: Element | null): boolean {
  if (!active || active === document.body || active === document.documentElement) return true
  return active.closest('.viewport') !== null
}
