// src/hooks/useYandexInit.ts — SDK-bootstrap Яндекс.Игр + экономика (yandex-only)
//
// Y.2 (рефакторинг yandex-games): вынесено из App.tsx, чтобы merge
// main → yandex-games не конфликтовал в общем файле. Поведение 1:1:
//   1. Инициализация платформы + загрузка экономики из облака (bootstrap).
//   2. LoadingAPI.ready() — когда поднялся CSG-воркер и SDK.
//   3. GameplayAPI start/stop — по состоянию модальных окон.
import { useEffect, useRef } from 'react'
import { useUiStore } from '../store/ui-store'
import { useEconomyStore } from '../store/economy-store'
import { getPlatform, initPlatform } from '../platform'
import { getInitDonePromise } from '../platform/sdk'
import { applyDebugTokensGrant, installEconomyDebugHelper } from '../platform/debug-mode'

export interface YandexInitOptions {
  /** Открыто ли любое модальное окно (текст / проекты / экспорт) — для Gameplay API. */
  anyModalOpen: boolean
}

export function useYandexInit({ anyModalOpen }: YandexInitOptions): void {
  const workerOk = useUiStore((s) => s.workerOk)

  // ── Инициализация платформы + экономика (объединено) ──
  // ⚠️ ВАЖНО: loadFromCloud() вызывается ПОСЛЕ platform.init(),
  // потому что loadFromCloud() → platform.loadData() → ysdk.player.getData()
  // вызывает postMessage, который ломается в iframe Yandex (error #185).
  // RAF в platform.init() завершается только ПОСЛЕ стабилизации React-дерева.
  const economyInitialized = useRef(false)
  // P1-1: cleanup обработчиков смены суток (visibilitychange/focus + setInterval)
  const cleanupRolloverRef = useRef<(() => void) | null>(null)

  // ⚠️ U10/P1-2: GameplayAPI.start() НЕ вызывается до завершения init SDK.
  // Старт выполняется в эффекте модалок ниже (getInitDonePromise → start/stop)
  // — единая точка управления геймплеем, без дублирования.
  useEffect(() => {
    let disposed = false
    let syncInterval: ReturnType<typeof setInterval> | null = null
    const bootstrap = async () => {
      // 1. Инициализируем платформу (включает RAF-вызовы SDK).
      // Уже инициализирована из main.tsx (initSdk()) — initPlatform()
      // вернёт тот же результат без повторной инициализации.
      const ok = await initPlatform().catch((err) => {
        console.error('[App] Platform init failed:', err)
        return false
      })
      if (disposed) return
      if (!ok) {
        console.warn('[App] Platform init returned false — running in clean mode')
      }

      // 2. Только ПОСЛЕ platform.init() загружаем экономику
      if (!economyInitialized.current) {
        economyInitialized.current = true
        try {
          await useEconomyStore.getState().loadFromCloud()
          await useEconomyStore.getState().initDailyQuests()
          useEconomyStore.getState().checkSubscriptionExpiry()
          // UB3-3: debug-хук — выдача 3000 токенов при `?debug-mode`/`?debug-tokens=N`
          // (и referrer/payload-каналах). Строго ПОСЛЕ loadFromCloud: иначе облако
          // перезатрёт счёт. Без параметров URL — полный no-op («ничего лишнего»).
          await applyDebugTokensGrant()
          void installEconomyDebugHelper()
          // EC1: показать баннер-оффер если нет подписки и аренда не активна
          const econ = useEconomyStore.getState()
          econ.setBannerVisible(econ.shouldShowBannerRO())
          // UB4-1: platform.init() показывает sticky-баннер безусловно, а оплата
          // «отключить баннер» обязана убирать и его. syncPlatformBanner() сверяет
          // SDK с экономикой в обе стороны.
          void econ.syncPlatformBanner()
        } catch (e) {
          console.error('[App] Economy init failed:', e)
        }
        if (disposed) return

        // Периодическая синхронизация экономики (каждые 30 сек)
        syncInterval = setInterval(() => {
          void useEconomyStore.getState().syncToCloud()
        }, 30000)

        // ── P1-1: сброс дневных лимитов при смене суток, даже если страница
        // открыта больше суток. Триггеры: visibilitychange/focus + setInterval ~60с.
        const checkDayRollover = () => {
          void useEconomyStore.getState().refreshDayRollover()
        }
        const onVisibility = () => {
          if (document.visibilityState === 'visible') checkDayRollover()
        }
        const rolloverInterval = setInterval(checkDayRollover, 60_000)
        document.addEventListener('visibilitychange', onVisibility)
        window.addEventListener('focus', checkDayRollover)
        cleanupRolloverRef.current = () => {
          clearInterval(rolloverInterval)
          document.removeEventListener('visibilitychange', onVisibility)
          window.removeEventListener('focus', checkDayRollover)
        }
      }
    }
    void bootstrap()
    // Cleanup: интервал синхронизации обязан очищаться при unmount
    return () => {
      disposed = true
      if (syncInterval) clearInterval(syncInterval)
      cleanupRolloverRef.current?.()
    }
  }, [])

  // ── LoadingAPI.ready() — ПОСЛЕ полной готовности UI (§A.1 чек-листа) ──
  // U10/P1-8: Game Ready вызывается ТОЛЬКО когда CSG-воркер поднялся
  // (workerOk === true) И SDK инициализирован (getInitDonePromise). Ранний
  // fallback-таймер 15с убран из yandex.ts — ready() не может сработать
  // при открытом экране "Загрузка CSG (WASM)…".
  useEffect(() => {
    if (!workerOk) return
    let disposed = false
    void getInitDonePromise().then(() => {
      if (disposed) return
      getPlatform()?.loadingReady()
    })
    return () => { disposed = true }
  }, [workerOk])

  // ── Yandex Gameplay API — обязательное требование модерации ──
  // При открытии модальных окон — stopGameplay(), при закрытии — startGameplay()
  // При монтировании (все модалки false) — автоматически вызывает startGameplay().
  // ⚠️ U10/P1-2: start/stop НЕ выполняются до завершения инициализации SDK
  // (getInitDonePromise). После init эффект повторно оценит состояние модалок.
  useEffect(() => {
    let disposed = false
    void getInitDonePromise().then(() => {
      if (disposed) return
      const platform = getPlatform()
      if (!platform) return
      if (anyModalOpen) {
        platform.stopGameplay()
      } else {
        platform.startGameplay()
      }
    })
    return () => { disposed = true }
  }, [anyModalOpen])
}
