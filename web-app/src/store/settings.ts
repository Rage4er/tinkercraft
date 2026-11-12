// ============================================================
// settings.ts — настройки приложения (APP-SETTINGS)
// ============================================================
// Окно «Настройки» (шестерёнка в статус-баре): язык, тема, звуки (вкл. / громкость), единицы длины,
// «Сбросить». Хранятся в localStorage (`tinkercraft-settings`) — между сессиями; недоступный
// localStorage (приватный режим) не ломает приложение — настройки живут до перезагрузки.
// Язык — в i18next (ключ `i18nextLng`, как переключатель в статус-баре), здесь не дублируется.

import { create } from 'zustand'
import i18n from '../i18n'
import { isLengthUnit, type LengthUnit } from './units'
import { THEMES } from '../themes'

export const SETTINGS_STORAGE_KEY = 'tinkercraft-settings'
export const LANGUAGES = ['ru', 'en'] as const
export type Language = (typeof LANGUAGES)[number]

export interface SoundSettings { enabled: boolean; volume: number }
export interface SettingsData {
  /** id темы (`themes.ts`) */
  theme: string
  sound: SoundSettings
  units: LengthUnit
}
export const DEFAULT_SETTINGS: SettingsData = { theme: 'dark', sound: { enabled: true, volume: 0.4 }, units: 'mm' }

/** Темы, которые знает приложение (`themes.ts`) — проверка сохранённого значения */
const isKnownTheme = (id: unknown): id is string => typeof id === 'string' && THEMES.some((t) => t.id === id)

/** Сохранённые настройки → данные; мусор и неизвестные значения — по умолчанию. */
export function sanitizeSettings(raw: unknown): SettingsData {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const s = (r.sound && typeof r.sound === 'object' ? r.sound : {}) as Record<string, unknown>
  const vol = typeof s.volume === 'number' && Number.isFinite(s.volume) ? Math.min(1, Math.max(0, s.volume)) : DEFAULT_SETTINGS.sound.volume
  return {
    theme: isKnownTheme(r.theme) ? r.theme : DEFAULT_SETTINGS.theme,
    sound: { enabled: typeof s.enabled === 'boolean' ? s.enabled : DEFAULT_SETTINGS.sound.enabled, volume: vol },
    units: isLengthUnit(r.units) ? r.units : DEFAULT_SETTINGS.units,
  }
}

function load(): SettingsData {
  try { return sanitizeSettings(JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY) ?? 'null')) } catch { return { ...DEFAULT_SETTINGS, sound: { ...DEFAULT_SETTINGS.sound } } }
}
function save(d: SettingsData): void {
  try { localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(d)) } catch { /* без localStorage — только на сессию */ }
}

/** Текущий язык интерфейса (ru / en) */
export function currentLanguage(): Language {
  return i18n.language?.startsWith('ru') ? 'ru' : 'en'
}
/** Сменить язык (как переключатель в статус-баре: i18next + `i18nextLng`) */
export function setLanguage(lang: Language): void {
  void i18n.changeLanguage(lang)
  try { localStorage.setItem('i18nextLng', lang) } catch { /* без localStorage — только на сессию */ }
}
/** Язык по умолчанию — язык браузера (ru / en) */
export function defaultLanguage(): Language {
  return typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('ru') ? 'ru' : 'en'
}

interface SettingsStore extends SettingsData {
  setTheme: (id: string) => void
  setSound: (s: Partial<SoundSettings>) => void
  setUnits: (u: LengthUnit) => void
  /** «Сбросить»: тема, звуки, единицы — по умолчанию, язык — язык браузера */
  reset: () => void
}

export const useSettingsStore = create<SettingsStore>((set, get) => {
  const persist = () => { const { theme, sound, units } = get(); save({ theme, sound, units }) }
  return {
    ...load(),
    setTheme: (id) => { if (!isKnownTheme(id)) return; set({ theme: id }); persist() },
    setSound: (s) => {
      const cur = get().sound
      set({ sound: sanitizeSettings({ sound: { ...cur, ...s } }).sound }); persist()
    },
    setUnits: (u) => { if (!isLengthUnit(u)) return; set({ units: u }); persist() },
    reset: () => {
      set({ ...DEFAULT_SETTINGS, sound: { ...DEFAULT_SETTINGS.sound } })
      try { localStorage.removeItem(SETTINGS_STORAGE_KEY) } catch { /* ignore */ }
      setLanguage(defaultLanguage())
    },
  }
})
