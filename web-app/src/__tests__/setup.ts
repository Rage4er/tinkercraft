// ============================================================
// Test setup — инициализирует i18n для всех тестов.
// Поскольку i18n больше не инициализируется автоматически,
// каждый тест, использующий i18n.t(), нуждается в этом setup.
// ============================================================

import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import enTranslation from '../i18n/locales/en/translation.json'
import ruTranslation from '../i18n/locales/ru/translation.json'

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: enTranslation },
    ru: { translation: ruTranslation },
  },
  lng: 'en',
  fallbackLng: 'en',
  debug: false,
  interpolation: {
    escapeValue: false,
  },
})
