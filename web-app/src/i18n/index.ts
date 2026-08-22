// ============================================================
// i18n initialization — i18next + react-i18next
// Supports English (en) and Russian (ru) with browser language detection.
// ============================================================

import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import YandexLanguageDetector from './YandexLanguageDetector'
import enTranslation from './locales/en/translation.json'
import ruTranslation from './locales/ru/translation.json'

i18n
  .use(YandexLanguageDetector)    // ✅ 1. Yandex SDK (п. 2.14 требований)
  .use(LanguageDetector)           // 2. Браузер/локальный кеш (fallback)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: enTranslation },
      ru: { translation: ruTranslation },
    },
    fallbackLng: 'en',
    debug: import.meta.env.DEV,
    interpolation: {
      escapeValue: false,
    },
    detection: {
      // Yandex SDK — асинхронный, идёт первым в order
      order: ['querystring', 'localStorage', 'navigator'],
      lookupLocalStorage: 'i18nextLng',
      caches: ['localStorage'],
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
