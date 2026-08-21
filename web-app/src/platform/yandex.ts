// src/platform/yandex.ts — Официальный SDK с @types/ysdk
import type { IPlatform } from './types'
import type { SDK, Player } from 'ysdk'

// Расширяем глобальный объект Window
declare global {
  interface Window {
    YaGames: {
      init: () => Promise<SDK>
    }
  }
}

class YandexPlatform implements IPlatform {
  public ysdk: SDK | null = null
  private player: Player | null = null
  private initialized = false

  async init(): Promise<boolean> {
    if (this.initialized) return true

    // Fallback для локальной разработки
    if (typeof window === 'undefined' || !(window as any).YaGames) {
      console.warn('[Yandex] SDK not available (local dev mode). Using fallback.')
      this.initialized = true
      return false
    }

    try {
      // ✅ Строгая типизация инициализации
      const YaGames = (window as any).YaGames
      this.ysdk = await YaGames.init()

      // Пробуем получить игрока
      try {
        this.player = await this.ysdk.getPlayer({ scopes: false })
      } catch {
        console.warn('[Yandex] Player not authorized yet, using guest mode')
        this.player = null
      }

      this.initialized = true

      // LoadingAPI.ready() — обязательно для модерации
      if (this.ysdk.features?.LoadingAPI?.ready) {
        this.ysdk.features.LoadingAPI.ready()
      }

      return true
    } catch (error) {
      console.error('[Yandex] Init failed:', error)
      return false
    }
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

  async showRewardedVideo(): Promise<'tokens' | 'hints' | null> {
    if (!this.ysdk) return null
    try {
      await this.ysdk.adv.showRewardedVideo({
        callbacks: {
          onRewarded: () => console.log('[Yandex] Rewarded!'),
          onClose: () => console.log('[Yandex] Rewarded video closed'),
          onError: (err: Error) => console.error('[Yandex] Rewarded video error:', err),
        },
      })
      return 'tokens'
    } catch {
      return null
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
      await this.ysdk.leaderboards.setLeaderboardScore(leaderboardName, score)
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
      const entries = await this.ysdk.leaderboards.getLeaderboardEntries(leaderboardName, {
        quantityTop: count,
        quantityAround: 0,
      })
      return entries.map((e: any) => ({
        rank: e.rank,
        userId: e.uniqueID,
        score: e.score,
        playerName: e.player?.publicName || 'Unknown',
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
