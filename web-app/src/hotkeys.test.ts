// UX-AUDIT-5: сочетания из подсказок тулбара (TOOLTIP_DATA) должны работать —
// каждое разбирается в действие ровно того инструмента, у которого подсказка.
import { describe, it, expect } from 'vitest'
import { TOOLTIP_DATA } from './constants'
import { resolveHotkey, mirrorPlaneOf, csgOpOf, isTextEntry, tabTogglesCamera, NO_REPEAT, type HotkeyAction, type KeyLike } from './hotkeys'

/** «Ctrl+Z», «Del», «Esc», «Tab», «M» → событие клавиши (e.code). */
function keyOf(shortcut: string): KeyLike {
  const parts = shortcut.split('+')
  const key = parts.at(-1)!
  const code = key === 'Del' ? 'Delete' : key === 'Esc' ? 'Escape' : key === 'Tab' ? 'Tab' : `Key${key.toUpperCase()}`
  return { code, ctrlKey: parts.includes('Ctrl'), shiftKey: parts.includes('Shift'), altKey: parts.includes('Alt') }
}

/** Подсказка → действие, которое обещает её сочетание. */
const EXPECTED: Record<string, HotkeyAction> = {
  open: 'open', save: 'save', undo: 'undo', redo: 'redo', copy: 'copy', paste: 'paste', delete: 'delete',
  fit_view: 'fitView', home_view: 'homeView', toggle_camera: 'toggleCamera',
  gizmo_translate: 'gizmoTranslate', gizmo_rotate: 'gizmoRotate', gizmo_scale: 'gizmoScale', gizmo_exit: 'escape',
  ruler: 'ruler', mirror_yz: 'mirrorYZ', mirror_xz: 'mirrorXZ', mirror_xy: 'mirrorXY',
  csg_union: 'union', csg_subtract: 'subtract', csg_intersect: 'intersect',
}

describe('resolveHotkey — UX-AUDIT-5', () => {
  const withShortcut = Object.entries(TOOLTIP_DATA).filter(([, d]) => d.shortcut)

  it('каждое сочетание из подсказок тулбара разбирается в действие своего инструмента', () => {
    expect(withShortcut.length).toBeGreaterThanOrEqual(21)
    for (const [key, d] of withShortcut) {
      expect(EXPECTED[key], `подсказка ${key} (${d.shortcut}) — нет в EXPECTED`).toBeDefined()
      expect(resolveHotkey(keyOf(d.shortcut!)), `${key}: ${d.shortcut}`).toBe(EXPECTED[key])
    }
  })

  it('Tab, L, M/N/B, U/X/I — обещанные подсказками (раньше не работали)', () => {
    expect(resolveHotkey({ code: 'Tab' })).toBe('toggleCamera')
    expect(resolveHotkey({ code: 'KeyL' })).toBe('ruler')
    expect([resolveHotkey({ code: 'KeyM' }), resolveHotkey({ code: 'KeyN' }), resolveHotkey({ code: 'KeyB' })].map((a) => mirrorPlaneOf(a!)))
      .toEqual(['YZ', 'XZ', 'XY'])
    expect([resolveHotkey({ code: 'KeyU' }), resolveHotkey({ code: 'KeyX' }), resolveHotkey({ code: 'KeyI' })].map((a) => csgOpOf(a!)))
      .toEqual(['union', 'subtract', 'intersect'])
  })

  it('модификаторы: Ctrl+S — сохранить, S — масштаб; Ctrl+Shift+Z — повтор; Alt+буква и Shift+Tab — не сочетания', () => {
    expect(resolveHotkey({ code: 'KeyS', ctrlKey: true })).toBe('save')
    expect(resolveHotkey({ code: 'KeyS', metaKey: true })).toBe('save')
    expect(resolveHotkey({ code: 'KeyS' })).toBe('gizmoScale')
    expect(resolveHotkey({ code: 'KeyZ', ctrlKey: true, shiftKey: true })).toBe('redo')
    expect(resolveHotkey({ code: 'KeyU', altKey: true })).toBeNull()
    expect(resolveHotkey({ code: 'KeyX', ctrlKey: true })).toBeNull()      // Ctrl+X — не вычитание
    expect(resolveHotkey({ code: 'Tab', shiftKey: true })).toBeNull()
    expect(resolveHotkey({ code: 'KeyQ' })).toBeNull()
  })

  it('зажатая клавиша не повторяет переключатели и операции (зеркало, CSG), а undo — повторяет', () => {
    for (const a of ['mirrorYZ', 'union', 'ruler', 'toggleCamera'] as const) expect(NO_REPEAT.has(a)).toBe(true)
    for (const a of ['undo', 'redo', 'delete'] as const) expect(NO_REPEAT.has(a)).toBe(false)
  })

  it('поля ввода не перехватываются; Tab — камера только вне элементов управления', () => {
    const input = document.createElement('input'), area = document.createElement('textarea')
    const btn = document.createElement('button'), vp = document.createElement('div'), canvas = document.createElement('canvas')
    vp.className = 'viewport'; vp.appendChild(canvas)
    document.body.append(input, area, btn, vp)
    expect(isTextEntry(input)).toBe(true)
    expect(isTextEntry(area)).toBe(true)
    expect(isTextEntry(btn)).toBe(false)
    expect(tabTogglesCamera(document.body)).toBe(true)
    expect(tabTogglesCamera(canvas)).toBe(true)
    expect(tabTogglesCamera(btn)).toBe(false)                // Tab по кнопкам — навигация
    input.remove(); area.remove(); btn.remove(); vp.remove()
  })
})
