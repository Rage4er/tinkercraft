// src/platform/clean.ts — Stub для чистого CAD (без SDK)
import type { IPlatform } from './types'

export const platform: IPlatform = {
  ysdk: null,

  async init() {
    return false
  },

  async showFullscreenAd() {
    return false
  },

  async showRewardedVideo() {
    return null
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

  dispose() {
    // no-op
  },
}
