// ============================================================
// i18n initialization — i18next + react-i18next
// Поддержка English (en) и Russian (ru).
// Язык определяется ТОЛЬКО через Yandex SDK (п. 2.14) при запуске.
// Для clean-версии — fallback на navigator.
// ⚠️ НЕТ LanguageDetector, НЕТ localStorage — SDK — единственный источник языка.
// ============================================================

import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { getSdk } from '../platform/sdk'
import enTranslation from './locales/en/translation.json'
import ruTranslation from './locales/ru/translation.json'

/**
 * Нормализовать язык: 'ru-RU' → 'ru', 'en-US' → 'en'
 * i18next ресурсы только для 'en' и 'ru'.
 */
function normalizeLang(raw: string | undefined): string | undefined {
  if (!raw) return undefined
  const base = raw.split('-')[0].toLowerCase()
  return base === 'ru' || base === 'en' ? base : undefined
}

/**
 * Получить язык из Yandex SDK (п. 2.14).
 * SDK инициализирован в main.tsx ДО i18n.
 * Язык берётся из ysdk.environment.i18n.lang.
 * Возвращает undefined в clean-версии → i18next использует fallback.
 */
function getLanguageFromSdk(): string | undefined {
  const ysdk = getSdk()
  if (ysdk) {
    // Yandex SDK: ysdk.environment.i18n.lang
    const raw = ysdk.environment?.i18n?.lang
    console.log('[i18n] Yandex SDK environment =', ysdk.environment)
    console.log('[i18n] Yandex SDK raw i18n.lang =', raw)
    const lang = normalizeLang(raw)
    console.log('[i18n] Yandex SDK normalized lang =', lang)
    if (lang) return lang

    // Fallback: ysdk.environment.i18n (может быть объектом)
    const envI18n = ysdk.environment?.i18n
    if (envI18n && typeof envI18n === 'object' && 'lang' in envI18n) {
      console.log('[i18n] Yandex SDK i18n object =', envI18n)
    }

    // Fallback: документ
    const docLang = typeof document !== 'undefined' ? document.documentElement.lang : undefined
    console.log('[i18n] Fallback document.documentElement.lang =', docLang)
    const docLangNorm = normalizeLang(docLang)
    if (docLangNorm) {
      console.log('[i18n] Using document.documentElement.lang:', docLangNorm)
      return docLangNorm
    }
  } else {
    console.log('[i18n] Yandex SDK not available (null)')
  }

  // Fallback: navigator.language
  const navRaw = typeof navigator !== 'undefined' ? navigator.language : undefined
  console.log('[i18n] Fallback navigator.language =', navRaw)
  const navNorm = normalizeLang(navRaw)
  if (navNorm) {
    console.log('[i18n] Using navigator.language:', navNorm)
    return navNorm
  }

  // Fallback: navigator.languages[0] (массив предпочтений)
  if (typeof navigator !== 'undefined' && navigator.languages && navigator.languages.length > 0) {
    const navLangs = navigator.languages[0]
    console.log('[i18n] Fallback navigator.languages[0] =', navLangs)
    const navLangsNorm = normalizeLang(navLangs)
    if (navLangsNorm) {
      console.log('[i18n] Using navigator.languages[0]:', navLangsNorm)
      return navLangsNorm
    }
  }

  console.log('[i18n] No language found, returning undefined (will fallback to en)')
  return undefined
}

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: enTranslation },
      ru: { translation: ruTranslation },
    },
    // Язык из SDK (п. 2.14) — единственный источник.
    // Без LanguageDetector и localStorage — SDK не перезапишется.
    lng: getLanguageFromSdk(),
    fallbackLng: 'en',
    debug: import.meta.env.DEV,
    interpolation: {
      escapeValue: false,
    },
  })

// Update document title with localized app name: "TC — Tinker Craft" / "TC — Творческая студия"
function updateDocumentTitle(): void {
  const name = i18n.t('app.name')
  document.title = `TC — ${name}`
}

i18n.on('languageChanged', updateDocumentTitle)
updateDocumentTitle()

export default i18n
