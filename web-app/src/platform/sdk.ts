// src/platform/sdk.ts — Единая точка инициализации Yandex SDK
// YaGames.init() вызывается ОДИН РАЗ, результат кэшируется.
// Все компоненты (i18n, platform, economy-store) используют getSdk().
//
// ⚠️ SDK загружается синхронно через <script src="/sdk.js"> в index.html
// ⚠️ initSdk() вызывается ПОСЛЕ загрузки SDK в DOM

import type { SDK } from 'ysdk'

let _ysdk: SDK | null = null
let _initPromise: Promise<SDK | null> | null = null
let _waitForSdk: Promise<void> | null = null

/**
 * Дождаться загрузки SDK в DOM (если ещё не загружен).
 * SDK загружается синхронно через <script src="/sdk.js"> в index.html.
 */
function waitForSdkLoaded(): Promise<void> {
  if (_waitForSdk) return _waitForSdk

  _waitForSdk = new Promise((resolve) => {
    // SDK уже загружен
    if ((window as any).YaGames) {
      resolve()
      return
    }

    // Ждём загрузки SDK
    const checkInterval = setInterval(() => {
      if ((window as any).YaGames) {
        clearInterval(checkInterval)
        resolve()
      }
    }, 50)

    // Таймаут 5 секунд
    setTimeout(() => {
      clearInterval(checkInterval)
      console.warn('[SDK] Timeout waiting for YaGames')
      resolve()
    }, 5000)
  })

  return _waitForSdk
}

/**
 * Инициализировать SDK один раз.
 * Возвращает ysdk или null (если SDK недоступен).
 *
 * ВАЖНО: SDK должен быть загружен в DOM ДО вызова этого метода.
 * SDK загружается синхронно через <script src="/sdk.js"> в index.html.
 */
export function initSdk(): Promise<SDK | null> {
  if (_ysdk) return Promise.resolve(_ysdk)
  if (_initPromise) return _initPromise

  _initPromise = (async () => {
    // Ждём загрузки SDK в DOM
    await waitForSdkLoaded()

    if (typeof window === 'undefined' || !(window as any).YaGames) {
      console.warn('[SDK] YaGames not available (clean/local mode)')
      return null
    }

    try {
      const ysdk = await (window as any).YaGames.init()
      _ysdk = ysdk
      console.log('[SDK] YaGames.init() OK')
      console.log('[SDK] environment:', JSON.stringify(ysdk?.environment))
      console.log('[SDK] i18n.lang:', ysdk?.environment?.i18n?.lang)

      // LoadingAPI.ready() — обязательно для модерации
      if (ysdk?.features?.LoadingAPI?.ready) {
        ysdk.features.LoadingAPI.ready()
      }

      // ⚠️ НЕ вызываем GameplayAPI.start() здесь — это ломает React-обёртку
      // платформы Yandex (error #185). Start вызывается в App.tsx через
      // useEffect с пустыми зависимостями — после полной загрузки React.

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
