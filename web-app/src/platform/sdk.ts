// src/platform/sdk.ts — Единая точка инициализации Yandex SDK
// YaGames.init() вызывается ОДИН РАЗ, результат кэшируется.
// Все компоненты (i18n, platform, game-store) используют getSdk().

import type { SDK } from 'ysdk'

let _ysdk: SDK | null = null
let _initPromise: Promise<SDK | null> | null = null

/**
 * Инициализировать SDK один раз.
 * Возвращает ysdk или null (если SDK недоступен).
 */
export function initSdk(): Promise<SDK | null> {
  if (_ysdk) return Promise.resolve(_ysdk)
  if (_initPromise) return _initPromise

  _initPromise = (async () => {
    if (typeof window === 'undefined' || !(window as any).YaGames) {
      console.warn('[SDK] YaGames not available (clean/local mode)')
      return null
    }

    try {
      const ysdk = await (window as any).YaGames.init()
      _ysdk = ysdk
      console.log('[SDK] YaGames.init() OK, lang =', ysdk?.environment?.i18n?.lang)

      // LoadingAPI.ready() — обязательно для модерации
      if (ysdk?.features?.LoadingAPI?.ready) {
        ysdk.features.LoadingAPI.ready()
      }

      return ysdk
    } catch (e) {
      console.error('[SDK] YaGames.init() failed:', e)
      return null
    }
  })()

  return _initPromise
}

/**
 * Получить уже инициализированный SDK (без повторного init).
 * Возвращает null, если initSdk() ещё не вызывался или завершился ошибкой.
 */
export function getSdk(): SDK | null {
  return _ysdk
}
