// ============================================================
// i18next detector for Yandex Games SDK (п. 2.14 требований)
// Использует уже инициализированный SDK из sdk.ts (getSdk)
// НЕ вызывает YaGames.init() повторно
// ============================================================
import type { LanguageDetectorAsyncModule } from 'i18next'
import { initSdk } from '../platform/sdk'

const YandexLanguageDetector: LanguageDetectorAsyncModule = {
  type: 'languageDetector',
  async: true,
  detect: (callback) => {
    // ✅ Используем централизованный init (один на всё приложение)
    initSdk().then((ysdk) => {
      if (ysdk) {
        // ✅ Читаем язык из SDK (п. 2.14)
        const lang = ysdk.environment?.i18n?.lang
        console.log('[i18n] Yandex SDK language:', lang)
        callback(lang)
      } else {
        // SDK недоступен — i18next перейдёт к navigator/localStorage
        callback(undefined)
      }
    })
  },
  cacheUserLanguage: () => { },
}

export default YandexLanguageDetector
