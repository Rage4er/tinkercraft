// src/platform/yandex.ts — Реализация Yandex Games SDK
// Использует централизованную инициализацию из sdk.ts (initSdk/getSdk)
//
// ⚠️ ВСЕ вызовы рекламы должны быть ТОЛЬКО через SDK методы
// ⚠️ Реклама вызывается ПОСЛЕ успешной инициализации SDK

import type { IPlatform } from './types'
import type { SDK, Player } from 'ysdk'
import { initSdk, getSdk } from './sdk'

class YandexPlatform implements IPlatform {
  public ysdk: SDK | null = null
  private player: Player | null = null
  private initialized = false
  private initError: string | null = null

  async init(): Promise<boolean> {
    if (this.initialized) return this.ysdk !== null

    try {
      // ✅ Централизованная инициализация — один init() на всё приложение
      const ysdk = await initSdk()
      if (!ysdk) {
        this.initError = 'SDK initialization failed'
        this.initialized = true
        console.warn('[Yandex] SDK not available, running in clean mode')
        return false
      }

      this.ysdk = ysdk
      console.log('[Yandex] SDK initialized successfully')

      // Инициализируем sticky banner (правый верхний угол)
      try {
        const bannerStatus = await ysdk.adv.getBannerAdvStatus()
        console.log('[Yandex] Banner status:', bannerStatus)
      } catch (e) {
        console.log('[Yandex] Banner not available (may be dashboard-controlled):', e)
      }

      // Пробуем получить игрока
      try {
        this.player = await ysdk.getPlayer()
        console.log('[Yandex] Player loaded, authorized:', this.player?.isAuthorized?.())
      } catch {
        console.warn('[Yandex] Player not authorized yet, guest mode')
        this.player = null
      }

      this.initialized = true
      return true
    } catch (e) {
      this.initError = (e as Error).message
      this.initialized = true
      console.error('[Yandex] SDK init error:', e)
      return false
    }
  }

  /**
   * Показать полноэкранную рекламу
   * ⚠️ Вызывается ТОЛЬКО ПОСЛЕ init()
   */
  async showFullscreenAd(): Promise<boolean> {
    if (!this.ysdk) {
      console.warn('[Yandex] showFullscreenAd: SDK not initialized')
      return false
    }

    if (!this.ysdk.adv) {
      console.warn('[Yandex] showFullscreenAd: adv API not available')
      return false
    }

    return new Promise<boolean>((resolve) => {
      try {
        this.ysdk!.adv.showFullscreenAdv({
          callbacks: {
            onClose: (wasShown) => {
              console.log('[Yandex] Fullscreen ad closed, wasShown:', wasShown)
              // Обязательно возобновляем геймплей после закрытия рекламы
              if (this.ysdk?.features?.GameplayAPI?.start) {
                this.ysdk.features.GameplayAPI.start()
              }
            },
            onError: (err) => {
              // Ошибка загрузки рекламы (AdBlock, нет сети и т.д.) — не блокируем игру
              console.error('[Yandex] Fullscreen ad error:', err)
              // Обязательно возобновляем геймплей даже при ошибке
              if (this.ysdk?.features?.GameplayAPI?.start) {
                this.ysdk.features.GameplayAPI.start()
              }
            }
          }
        })
        resolve(true)
      } catch (err) {
        console.error('[Yandex] showFullscreenAd exception:', err)
        resolve(false)
      }
    })
  }

  /**
   * Показать видеорекламу с вознаграждением
   * ⚠️ Вызывается ТОЛЬКО ПОСЛЕ init()
   */
  async showRewardedVideo(): Promise<boolean> {
    if (!this.ysdk) {
      console.warn('[Yandex] showRewardedVideo: SDK not initialized')
      return false
    }

    if (!this.ysdk.adv) {
      console.warn('[Yandex] showRewardedVideo: adv API not available')
      return false
    }

    return new Promise<boolean>((resolve) => {
      let rewarded = false

      try {
        this.ysdk!.adv.showRewardedVideo({
          callbacks: {
            onOpen: () => {
              console.log('[Yandex] Rewarded video opened')
              this.stopGameplay()
            },
            onRewarded: () => {
              console.log('[Yandex] Rewarded! User earned reward')
              rewarded = true
            },
            onClose: (wasShown: boolean = true) => {
              console.log('[Yandex] Rewarded video closed, wasShown:', wasShown)
              this.startGameplay()
              resolve(rewarded)
            },
            onError: (err: Error) => {
              console.error('[Yandex] Rewarded video error:', err)
              this.startGameplay()
              resolve(false)
            },
          },
        })
      } catch (err) {
        console.error('[Yandex] showRewardedVideo exception:', err)
        this.startGameplay()
        resolve(false)
      }
    })
  }

  /**
   * Проверить статус sticky banner
   */
  async getBannerAdvStatus(): Promise<{ stickyAdvIsShowing: boolean; reason?: string }> {
    if (!this.ysdk?.adv) {
      return { stickyAdvIsShowing: false, reason: 'ADV_IS_NOT_CONNECTED' }
    }

    try {
      return await this.ysdk.adv.getBannerAdvStatus()
    } catch (err) {
      console.error('[Yandex] getBannerAdvStatus error:', err)
      return { stickyAdvIsShowing: false, reason: 'UNKNOWN' }
    }
  }

  getPlayer(): Player | null {
    return this.player
  }

  isAuthorized(): boolean {
    return this.player?.isAuthorized?.() ?? false
  }

  async saveData(data: Record<string, unknown>): Promise<void> {
    if (!this.player) {
      console.warn('[Yandex] Cannot save: player not available')
      return
    }
    try {
      await this.player.setData(data)
    } catch (e) {
      console.error('[Yandex] Save data failed:', e)
    }
  }

  async loadData(): Promise<Record<string, unknown>> {
    if (!this.player) return {}
    try {
      return await this.player.getData()
    } catch (e) {
      console.error('[Yandex] Load data failed:', e)
      return {}
    }
  }

  async submitScore(leaderboardName: string, score: number): Promise<void> {
    if (!this.ysdk || !this.player) return
    try {
      await this.ysdk.leaderboards.setScore(leaderboardName, score)
    } catch (e) {
      console.error('[Yandex] Submit score failed:', e)
    }
  }

  async getLeaderboardEntries(
    leaderboardName: string,
    count = 10
  ): Promise<Array<{ rank: number; userId: string; score: number; playerName: string }>> {
    if (!this.ysdk) return []
    try {
      const data = await this.ysdk.leaderboards.getEntries(leaderboardName, {
        quantityTop: count,
        quantityAround: 0,
      })
      return data.entries.map((e) => ({
        rank: e.rank,
        userId: e.player.uniqueID,
        score: e.score,
        playerName: e.player.publicName || 'Unknown',
      }))
    } catch (e) {
      console.error('[Yandex] Get leaderboard failed:', e)
      return []
    }
  }

  startGameplay(): void {
    if (this.ysdk?.features?.GameplayAPI?.start) {
      try {
        this.ysdk.features.GameplayAPI.start()
      } catch (e) {
        console.error('[Yandex] GameplayAPI.start error:', e)
      }
    }
  }

  stopGameplay(): void {
    if (this.ysdk?.features?.GameplayAPI?.stop) {
      try {
        this.ysdk.features.GameplayAPI.stop()
      } catch (e) {
        console.error('[Yandex] GameplayAPI.stop error:', e)
      }
    }
  }

  /** Серверное время (§5 ECONOMY.md v2.0) — кэшируем на 30 секунд */
  private _serverTimeCache: number | null = null
  private _serverTimeCacheTime: number = 0
  private readonly SERVER_TIME_CACHE_MS = 30_000

  async getServerTime(): Promise<number> {
    // Возвращаем кэш если свежий
    if (this._serverTimeCache && Date.now() - this._serverTimeCacheTime < this.SERVER_TIME_CACHE_MS) {
      return this._serverTimeCache
    }

    if (!this.ysdk) {
      console.warn('[Yandex] getServerTime: SDK not initialized')
      return Date.now() // fallback на локальное время
    }

    try {
      const serverTime = await this.ysdk.serverTime()
      this._serverTimeCache = serverTime
      this._serverTimeCacheTime = Date.now()
      console.log('[Yandex] Server time:', serverTime, '(cached for 30s)')
      return serverTime
    } catch (err) {
      console.warn('[Yandex] getServerTime failed, using local:', err)
      return Date.now() // fallback
    }
  }

  dispose(): void {
    this.ysdk = null
    this.player = null
    this.initialized = false
    this.initError = null
    this._serverTimeCache = null
    this._serverTimeCacheTime = 0
  }
}

export const platform = new YandexPlatform()
