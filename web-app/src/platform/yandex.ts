// src/platform/yandex.ts — Реализация Yandex Games SDK
// Использует централизованную инициализацию из sdk.ts (initSdk/getSdk)
import type { IPlatform } from './types'
import type { SDK, Player } from 'ysdk'
import { initSdk } from './sdk'

class YandexPlatform implements IPlatform {
  public ysdk: SDK | null = null
  private player: Player | null = null
  private initialized = false

  async init(): Promise<boolean> {
    if (this.initialized) return true

    // ✅ Централизованная инициализация — один init() на всё приложение
    const ysdk = await initSdk()
    if (!ysdk) {
      this.initialized = true
      return false
    }

    this.ysdk = ysdk

    // Пробуем получить игрока
    try {
      this.player = await ysdk.getPlayer()
    } catch {
      console.warn('[Yandex] Player not authorized yet, guest mode')
      this.player = null
    }

    this.initialized = true
    return true
  }

  async showFullscreenAd(): Promise<boolean> {
    if (!this.ysdk) return false
    try {
      await this.ysdk.adv.showFullscreenAdv({
        callbacks: {
          onClose: () => console.log('[Yandex] Fullscreen ad closed'),
          onError: (err: Error) => console.error('[Yandex] Fullscreen ad error:', err),
        },
      })
      return true
    } catch {
      return false
    }
  }

  async showRewardedVideo(): Promise<boolean> {
    if (!this.ysdk) return false

    return new Promise<boolean>((resolve) => {
      let rewarded = false

      try {
        this.ysdk!.adv.showRewardedVideo({
          callbacks: {
            onRewarded: () => {
              console.log('[Yandex] Rewarded!')
              rewarded = true
            },
            onClose: () => {
              console.log('[Yandex] onClose, rewarded =', rewarded)
              resolve(rewarded)
            },
            onError: (err: Error) => {
              console.error('[Yandex] Rewarded error:', err)
              resolve(false)
            },
          },
        })
      } catch {
        resolve(false)
      }
    })
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
      this.ysdk.features.GameplayAPI.start()
    }
  }

  stopGameplay(): void {
    if (this.ysdk?.features?.GameplayAPI?.stop) {
      this.ysdk.features.GameplayAPI.stop()
    }
  }

  dispose(): void {
    this.ysdk = null
    this.player = null
    this.initialized = false
  }
}

export const platform = new YandexPlatform()
