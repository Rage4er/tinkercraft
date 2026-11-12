// ============================================================
// settings.test.tsx — APP-SETTINGS: окно «Настройки», хранение, единицы длины
// ============================================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import i18n from '../i18n'
import SettingsModal from '../components/SettingsModal'
import NumInput from '../components/NumInput'
import { useSettingsStore, sanitizeSettings, DEFAULT_SETTINGS, SETTINGS_STORAGE_KEY, currentLanguage } from '../store/settings'
import { toUnit, fromUnit, formatLength, lengthLabel } from '../store/units'

let root: Root | null = null
let host: HTMLDivElement
const mount = (el: React.ReactElement) => {
  host = document.body.appendChild(document.createElement('div'))
  root = createRoot(host)
  act(() => root!.render(el))
  return host
}
const select = (sel: string, value: string) => {
  const e = host.querySelector<HTMLSelectElement>(sel)!
  act(() => { e.value = value; e.dispatchEvent(new Event('change', { bubbles: true })) })
}
const saved = () => JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY) ?? 'null')

beforeEach(async () => {
  localStorage.clear()
  useSettingsStore.getState().reset()
  await i18n.changeLanguage('ru')
})
afterEach(() => { if (root) act(() => root!.unmount()); root = null; host?.remove() })

describe('SettingsModal — язык, тема, звуки, единицы, сброс', () => {
  it('пункты окна и значения по умолчанию', () => {
    const h = mount(<SettingsModal onClose={() => { }} />)
    expect(h.querySelector('#settings-title')!.textContent).toBe('Настройки')
    expect(h.querySelector<HTMLSelectElement>('[data-testid=settings-language]')!.value).toBe('ru')
    expect(h.querySelector<HTMLSelectElement>('[data-testid=settings-theme]')!.value).toBe('dark')
    expect(h.querySelector<HTMLInputElement>('[data-testid=settings-sound]')!.checked).toBe(true)
    expect(h.querySelector<HTMLSelectElement>('[data-testid=settings-units]')!.value).toBe('mm')
  })

  it('язык: ru → en — интерфейс и i18nextLng', () => {
    mount(<SettingsModal onClose={() => { }} />)
    select('[data-testid=settings-language]', 'en')
    expect(currentLanguage()).toBe('en')
    expect(localStorage.getItem('i18nextLng')).toBe('en')
    expect(host.querySelector('#settings-title')!.textContent).toBe('Settings')
  })

  it('тема, звук, громкость, единицы — сразу в настройки и в localStorage', () => {
    mount(<SettingsModal onClose={() => { }} />)
    select('[data-testid=settings-theme]', 'light')
    const snd = host.querySelector<HTMLInputElement>('[data-testid=settings-sound]')!
    act(() => { snd.click() })
    select('[data-testid=settings-units]', 'cm')
    const st = useSettingsStore.getState()
    expect(st.theme).toBe('light')
    expect(st.sound.enabled).toBe(false)
    expect(st.units).toBe('cm')
    expect(saved()).toEqual({ theme: 'light', sound: { enabled: false, volume: 0.4 }, units: 'cm' })
    expect(host.querySelector<HTMLInputElement>('[data-testid=settings-volume]')!.disabled).toBe(true)
  })

  it('«Сбросить» — всё по умолчанию, запись удалена', () => {
    useSettingsStore.getState().setUnits('in')
    useSettingsStore.getState().setTheme('light')
    mount(<SettingsModal onClose={() => { }} />)
    act(() => { host.querySelector<HTMLButtonElement>('[data-testid=settings-reset]')!.click() })
    const st = useSettingsStore.getState()
    expect({ theme: st.theme, sound: st.sound, units: st.units }).toEqual(DEFAULT_SETTINGS)
    expect(localStorage.getItem(SETTINGS_STORAGE_KEY)).toBeNull()
  })

  it('Esc и «Закрыть» закрывают окно', () => {
    let closed = 0
    mount(<SettingsModal onClose={() => { closed++ }} />)
    act(() => { host.querySelector('[data-testid=settings-modal]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) })
    act(() => { host.querySelector<HTMLButtonElement>('[data-testid=settings-close]')!.click() })
    expect(closed).toBe(2)
  })
})

describe('sanitizeSettings — сохранённое значение', () => {
  it('мусор и неизвестные значения → по умолчанию; громкость — в 0…1', () => {
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS)
    expect(sanitizeSettings({ theme: 'neon', units: 'ft', sound: { enabled: 'yes', volume: 7 } })).toEqual({ ...DEFAULT_SETTINGS, sound: { enabled: true, volume: 1 } })
    expect(sanitizeSettings({ theme: 'light', units: 'in', sound: { enabled: false, volume: 0.2 } })).toEqual({ theme: 'light', units: 'in', sound: { enabled: false, volume: 0.2 } })
  })
})

describe('Единицы длины — показ и ввод (модель — мм)', () => {
  it('пересчёт и формат', () => {
    expect(toUnit(25.4, 'in')).toBeCloseTo(1, 10)
    expect(fromUnit(2, 'cm')).toBe(20)
    expect(formatLength(20, 'mm', 1)).toBe('20.0')
    expect(formatLength(20, 'cm', 1)).toBe('2.00')
    expect(formatLength(25.4, 'in', 1)).toBe('1.000')
    expect(formatLength(-0.001, 'mm', 1)).toBe('0.0')
    expect(lengthLabel(i18n.t.bind(i18n), 20, 'cm')).toBe('2.00 см')
  })

  it('поле длины в см: показ 2.00 см, ввод 3.5 → onChange(35 мм); угол (unit °) — без пересчёта', () => {
    useSettingsStore.getState().setUnits('cm')
    const got: number[] = []
    const h = mount(<><NumInput id="len" label="L" value={20} onChange={(v) => got.push(v)} /><NumInput id="ang" label="A" unit="°" value={30} onChange={() => { }} /></>)
    const len = h.querySelector<HTMLInputElement>('#len')!
    expect(len.value).toBe('2.00')
    expect(h.querySelectorAll('.num-label')[0].textContent).toBe('см')
    expect(h.querySelector<HTMLInputElement>('#ang')!.value).toBe('30.0')
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    act(() => { len.focus() })
    act(() => { setter.call(len, '3.5'); len.dispatchEvent(new Event('input', { bubbles: true })) })
    act(() => { len.blur() })
    expect(got).toEqual([35])
  })

  it('смена единицы — поле пересчитывается сразу (мм → дюймы)', () => {
    const h = mount(<NumInput id="len" label="L" value={25.4} onChange={() => { }} />)
    expect(h.querySelector<HTMLInputElement>('#len')!.value).toBe('25.4')
    act(() => { useSettingsStore.getState().setUnits('in') })
    expect(h.querySelector<HTMLInputElement>('#len')!.value).toBe('1.000')
    expect(h.querySelector('.num-label')!.textContent).toBe('дюйм')
  })
})
