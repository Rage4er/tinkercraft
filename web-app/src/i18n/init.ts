// ============================================================
// i18n initialization — вызывается из main.tsx ПОСЛЕ initSdk()
// П. 2.14: Автоопределение языка через SDK ДО запуска игры.
// ============================================================

import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { getSdk } from '../platform/sdk'
import enTranslation from './locales/en/translation.json'
import ruTranslation from './locales/ru/translation.json'

/**
 * Нормализовать язык: 'ru-RU' → 'ru', 'en-US' → 'en'
 */
function normalizeLang(raw: string | undefined): string | undefined {
  if (!raw || typeof raw !== 'string') return undefined
  const base = raw.split('-')[0].toLowerCase()
  return base
}

/**
 * Определить язык из Yandex SDK (п. 2.14).
 * Вызывается ПОСЛЕ initSdk(), когда SDK уже полностью готов.
 */
export function determineLanguage(): string {
  const ysdk = getSdk()

  // 1. Yandex SDK: ysdk.environment.i18n.lang (п. 2.14)
  if (ysdk?.environment?.i18n?.lang) {
    const raw = ysdk.environment.i18n.lang
    const lang = normalizeLang(raw)
    console.log(`[i18n] SDK i18n.lang="${raw}" → normalized="${lang}"`)
    if (lang) return lang
  }

  // 2. document.documentElement.lang
  if (typeof document !== 'undefined') {
    const docLang = document.documentElement.lang
    if (docLang) {
      const lang = normalizeLang(docLang)
      console.log(`[i18n] document.documentElement.lang="${docLang}" → "${lang}"`)
      if (lang) return lang
    }
  }

  // 3. navigator.language
  if (typeof navigator !== 'undefined' && navigator.language) {
    const lang = normalizeLang(navigator.language)
    console.log(`[i18n] navigator.language="${navigator.language}" → "${lang}"`)
    if (lang) return lang
  }

  // 4. navigator.languages[0]
  if (typeof navigator !== 'undefined' && navigator.languages?.[0]) {
    const lang = normalizeLang(navigator.languages[0])
    console.log(`[i18n] navigator.languages[0]="${navigator.languages[0]}" → "${lang}"`)
    if (lang) return lang
  }

  // 5. Fallback
  console.log('[i18n] No language detected, using fallback "en"')
  return 'en'
}

/**
 * Инициализировать i18n с языком из SDK.
 * Вызывается из main.tsx ПОСЛЕ initSdk().
 */
export async function initI18n(): Promise<typeof i18n> {
  const lang = determineLanguage()

  i18n.use(initReactI18next).init({
    resources: {
      en: { translation: enTranslation },
      ru: { translation: ruTranslation },
    },
    lng: lang,
    fallbackLng: 'en',
    debug: import.meta.env.DEV,
    interpolation: {
      escapeValue: false,
    },
  })

  // Обновить title
  const name = i18n.t('app.name')
  document.title = `TC — ${name}`

  console.log(`[i18n] Initialized with lang="${lang}"`)
  return i18n
}
