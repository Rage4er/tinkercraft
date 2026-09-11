// src/platform/clean.ts — Stub для чистого CAD (без SDK)
import type { IPlatform } from './types'

export const platform: IPlatform = {
  ysdk: null,

  /** P0-6: clean-платформа — Yandex SDK отсутствует всегда */
  isYandexSdkReady() {
    return false
  },

  /** P0-6: тип платформы для диагностики/UI */
  getPlatformType() {
    return 'clean'
  },

  async init() {
    return false
  },

  /** Clean-версия: нет LoadingAPI — no-op */
  loadingReady() {
    // no-op
  },

  async showFullscreenAd() {
    return false
  },

  async showRewardedVideo() {
    return false
  },

  getPlayer() {
    return null
  },

  isAuthorized() {
    return false
  },

  async saveData(data: Record<string, unknown>): Promise<void> {
    // Fallback: localStorage для clean-версии
    try {
      localStorage.setItem('yandex_fallback', JSON.stringify(data))
    } catch {
      // ignore
    }
  },

  async loadData(): Promise<Record<string, unknown>> {
    try {
      const raw = localStorage.getItem('yandex_fallback')
      return raw ? JSON.parse(raw) : {}
    } catch {
      return {}
    }
  },

  async submitScore() {
    // no-op
  },

  async getLeaderboardEntries() {
    return []
  },

  startGameplay() {
    // no-op
  },

  stopGameplay() {
    // no-op
  },

  /** Стики-баннер — no-op для clean-версии */
  async showBannerAdv() {
    return { stickyAdvIsShowing: false, reason: 'ADV_IS_NOT_CONNECTED' }
  },

  async hideBannerAdv() {
    return { stickyAdvIsShowing: false }
  },

  async getBannerAdvStatus() {
    return { stickyAdvIsShowing: false, reason: 'ADV_IS_NOT_CONNECTED' }
  },

  /** Clean-версия: локальное время (fallback) */
  async getServerTime(): Promise<number> {
    return Date.now()
  },

  dispose() {
    // no-op
  },
}
