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

/** Таймаут YaGames.init() — зависший init не должен блокировать запуск игры */
export const INIT_TIMEOUT_MS = 10_000

/**
 * Promise.race с гарантированной очисткой таймера.
 *
 * ⚠️ ВАЖНО: голый `Promise.race([promise, timeout])` НЕ отменяет таймер —
 * после победы `promise` setTimeout продолжает тикать и через `ms` печатает
 * ЛОЖНОЕ предупреждение о таймауте (resolve(null) — no-op, но console.warn
 * срабатывает). В продакшн-логе это выглядело как «YaGames.init() timeout»
 * и «getPlayer() timeout» ПОСЛЕ успешного завершения.
 *
 * Эта обёртка вызывает clearTimeout при любом исходе исходного промиса:
 *   - resolve(value) — исходный промис выиграл раньше таймера;
 *   - reject(error)  — исходный промис упал (ошибка пробрасывается наружу);
 *   - resolve(null)  — таймер сработал первым (onTimeout логирует фолбэк).
 */
export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  onTimeout: () => void,
): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | null = null
  return new Promise<T | null>((resolve, reject) => {
    timer = setTimeout(() => {
      timer = null
      onTimeout()
      resolve(null)
    }, ms)
    promise.then(
      (value) => {
        if (timer) clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        if (timer) clearTimeout(timer)
        reject(error)
      },
    )
  })
}

/**
 * Промис инициализации SDK (для связывания GameplayAPI.start() с init).
 * Зарезолвится, когда initSdk() завершится (успех ИЛИ clean-фолбэк null),
 * чтобы старт геймплея не выполнялся ДО завершения инициализации SDK.
 *
 * В новом потоке (U10) initSdk() вызывается в main.tsx ДО рендера App,
 * поэтому к моменту вызова этого геттера _initPromise уже существует
 * (или уже зарезолвлен). Геттер идемпотентен и потокобезопасен:
 * если initSdk() ещё не вызван — сам его инициирует (безопасно).
 */
let _initDonePromise: Promise<void> | null = null

export function getInitDonePromise(): Promise<void> {
  if (_initDonePromise) return _initDonePromise
  _initDonePromise = new Promise<void>((resolve) => {
    const waitFor = (p: Promise<SDK | null>): void => {
      p.then(() => resolve()).catch(() => resolve())
    }
    waitFor(_initPromise ?? initSdk())
  })
  return _initDonePromise
}

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

    // ⚠️ ВАЖНО: откладываем YaGames.init() на 200ms для стабилизации React-дерева.
    // YaGames.init() делает postMessage в iframe Yandex, который React не может
    // обработать до стабилизации. 0ms/rAF недостаточно — нужен реальный таймаут.
    await new Promise((resolve) => setTimeout(resolve, 200))

    try {
      // ⚠️ Защита от зависшего init(): если YaGames.init() не резолвится
      // (postMessage/timing проблемы в iframe Yandex), игра всё равно
      // запустится в clean-режиме через INIT_TIMEOUT_MS.
      // withTimeout гарантирует clearTimeout при успехе — иначе через 10с
      // сработает ЛОЖНОЕ предупреждение о таймауте (см. диагностику).
      const ysdk = await withTimeout<SDK>(
        (window as any).YaGames.init() as Promise<SDK>,
        INIT_TIMEOUT_MS,
        () => console.warn(`[SDK] YaGames.init() timeout (${INIT_TIMEOUT_MS}ms) — continuing without SDK`),
      )
      if (!ysdk) return null
      _ysdk = ysdk
      console.log('[SDK] YaGames.init() OK')
      console.log('[SDK] environment:', JSON.stringify(ysdk?.environment))
      console.log('[SDK] i18n.lang:', ysdk?.environment?.i18n?.lang)

      // ⚠️ LoadingAPI.ready() вызывается из App.tsx (loadingReady()) когда
      // CSG-воркер готов — НЕ здесь и НЕ внутри RAF (§A.1 чек-листа)

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
