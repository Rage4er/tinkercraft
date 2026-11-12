// ============================================================
// themes.test.tsx — THEME-ENGINE: темы из JSON, новая тема — новый файл, применение, выбор
// ============================================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import darkJson from '../themes/dark.json?raw'
import lightJson from '../themes/light.json?raw'
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import i18n from '../i18n'
import { THEMES, THEME_VARS, themeById, themeName, parseTheme, buildThemes, applyTheme } from '../themes'
import SettingsModal from '../components/SettingsModal'
import { useSettingsStore, SETTINGS_STORAGE_KEY } from '../store/settings'

let root: Root | null = null
let host: HTMLDivElement
afterEach(() => { if (root) act(() => root!.unmount()); root = null; host?.remove() })
beforeEach(async () => { localStorage.clear(); useSettingsStore.getState().reset(); await i18n.changeLanguage('ru') })

describe('THEMES — из src/themes/*.json', () => {
  it('три темы по порядку: тёмная, светлая, высокий контраст; у каждой — все переменные и цвета сцены', () => {
    expect(THEMES.map((t) => t.id)).toEqual(['dark', 'light', 'high-contrast'])
    expect(THEMES.map((t) => themeName(t, 'ru'))).toEqual(['Тёмная', 'Светлая', 'Высокий контраст'])
    expect(themeName(themeById('high-contrast'), 'en')).toBe('High contrast')
    for (const t of THEMES) {
      expect(Object.keys(t.vars).sort()).toEqual([...THEME_VARS].sort())
      for (const c of [...Object.values(t.vars), t.scene.background, t.scene.gridMinor, t.scene.gridMajor]) expect(c).toMatch(/^#[0-9a-f]{6}$/i)
    }
    expect(themeById('high-contrast').base).toBe('dark')
    expect(themeById('нет такой').id).toBe('dark')
  })

  it('высокий контраст: текст на фоне панели — контраст ≥ 7:1 (WCAG AAA)', () => {
    const lum = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
      return 0.2126 * r + 0.7152 * g + 0.0722 * b
    }
    const t = themeById('high-contrast')
    const ratio = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }
    expect(ratio(t.vars['--text-primary'], t.vars['--bg-panel'])).toBeGreaterThanOrEqual(7)
    expect(ratio(t.vars['--text-muted'], t.vars['--bg-panel'])).toBeGreaterThanOrEqual(7)
  })
})

describe('Новая тема — новый JSON', () => {
  it('файл «sepia.json» → тема в списке (по order), недостающие переменные — из темы базы', () => {
    const dark = { default: JSON.parse(darkJson) }
    const light = { default: JSON.parse(lightJson) }
    const sepia = { default: { id: 'sepia', order: 1.5, name: { ru: 'Сепия', en: 'Sepia' }, base: 'light', vars: { '--bg-panel': '#f4ecd8', '--accent': 'не цвет' }, scene: { background: '#efe4c8' } } }
    const list = buildThemes({ './dark.json': dark, './sepia.json': sepia, './light.json': light })
    expect(list.map((t) => t.id)).toEqual(['dark', 'light', 'sepia'])
    const s = list[2]
    expect(s.vars['--bg-panel']).toBe('#f4ecd8')
    expect(s.vars['--accent']).toBe(list[1].vars['--accent'])            // не цвет → из светлой
    expect(s.vars['--text-primary']).toBe(list[1].vars['--text-primary'])
    expect(s.scene.background).toBe('#efe4c8')
    expect(s.scene.gridMinor).toBe(list[1].scene.gridMinor)
  })

  it('без id / с неизвестной базой / с недопустимым id — не тема', () => {
    expect(parseTheme({ base: 'dark' })).toBeNull()
    expect(parseTheme({ id: 'x', base: 'purple' })).toBeNull()
    expect(parseTheme({ id: 'Bad Id', base: 'dark' })).toBeNull()
  })
})

describe('applyTheme и выбор в настройках', () => {
  it('applyTheme: переменные на <html>, data-theme — база, data-theme-id', () => {
    const el = document.createElement('div')
    applyTheme(themeById('high-contrast'), el)
    expect(el.style.getPropertyValue('--bg-panel')).toBe('#000000')
    expect(el.style.getPropertyValue('--accent')).toBe('#ffd400')
    expect(el.getAttribute('data-theme')).toBe('dark')
    expect(el.getAttribute('data-theme-id')).toBe('high-contrast')
    applyTheme(themeById('light'), el)
    expect(el.getAttribute('data-theme')).toBe('light')
  })

  it('«Настройки → Тема»: три темы, выбор «Высокий контраст» — в настройки и localStorage', () => {
    host = document.body.appendChild(document.createElement('div'))
    root = createRoot(host)
    act(() => root!.render(<SettingsModal onClose={() => { }} />))
    const sel = host.querySelector<HTMLSelectElement>('[data-testid=settings-theme]')!
    expect([...sel.options].map((o) => o.textContent)).toEqual(['Тёмная', 'Светлая', 'Высокий контраст'])
    act(() => { sel.value = 'high-contrast'; sel.dispatchEvent(new Event('change', { bubbles: true })) })
    expect(useSettingsStore.getState().theme).toBe('high-contrast')
    expect(JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY)!).theme).toBe('high-contrast')
  })
})
