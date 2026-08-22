// ============================================================
// i18next detector for Yandex Games SDK
// Priority: Yandex SDK > localStorage > navigator
// ============================================================
import type { LanguageDetectorAsyncModule } from 'i18next'

// Расширяем window — тип определяется в platform/yandex.ts
// здесь только для совместимости с i18next

const YandexLanguageDetector: LanguageDetectorAsyncModule = {
  type: 'languageDetector',
  async: true, // асинхронный детектор
  detect: (callback) => {
    // Проверяем, доступен ли YaGames
    if (typeof window !== 'undefined' && (window as any).YaGames) {
      (window as any).YaGames.init()
        .then((ysdk: any) => {
          // ✅ Получаем язык из SDK (п. 2.14 требований)
          const lang = ysdk?.environment?.i18n?.lang
          console.log('[i18n] Yandex SDK language:', lang)
          callback(lang)
        })
        .catch(() => {
          // Если SDK не загрузился — fallback на navigator
          callback(undefined)
        })
    } else {
      // SDK недоступен — вызываем callback с undefined
      // (i18next перейдёт к следующему детектору)
      callback(undefined)
    }
  },
  // i18next не будет кэшировать результат в localStorage
  cacheUserLanguage: () => { },
}

export default YandexLanguageDetector
