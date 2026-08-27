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
 * Получить язык из Yandex SDK (п. 2.14).
 * SDK инициализирован в main.tsx ДО i18n.
 * Язык берётся из ysdk.environment.i18n.lang.
 * Возвращает undefined в clean-версии → i18next использует fallback.
 */
function getLanguageFromSdk(): string | undefined {
  const ysdk = getSdk()
  if (ysdk?.environment?.i18n?.lang) {
    const lang = ysdk.environment.i18n.lang
    console.log('[i18n] Yandex SDK language:', lang)
    return lang
  }
  console.log('[i18n] Yandex SDK not available, using navigator fallback')
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
