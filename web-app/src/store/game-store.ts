// src/store/game-store.ts — Токены, ежедневные бонусы, синхронизация
import { create } from 'zustand'
import { getPlatform } from '../platform'

// ─── Константы экономики ───────────────────────────────────────────
export const TOKEN_COSTS = {
  exportSTL: 5,
  exportPNG: 3,
  premiumColor: 20,
  unlockFigure: 15,
  speedBuildRetry: 3,
} as const

export const TOKEN_EARNINGS = {
  dailyBonus: 5,
  dailyBonusWithAd: 20,
  modelRated: 5,
  challengeComplete: 15,
  speedBuildWin: 25,
  achievementUnlock: 50,
  adRewarded: 10,
} as const

// ─── Состояние ─────────────────────────────────────────────────────
interface GameState {
  // Данные
  tokens: number
  lastDailyBonus: number | null
  totalModelsCreated: number

  // Actions
  addTokens(amount: number): void
  spendTokens(amount: number): boolean
  claimDailyBonus(): Promise<boolean>
  claimDailyBonusWithAd(): Promise<boolean>
  incrementModelsCreated(): void
  loadFromCloud(): Promise<void>
  syncToCloud(): Promise<void>
}

// ─── Store ─────────────────────────────────────────────────────────
export const useGameStore = create<GameState>((set, get) => ({
  tokens: 0,
  lastDailyBonus: null,
  totalModelsCreated: 0,

  addTokens: (amount) => {
    set((state) => ({ tokens: state.tokens + amount }))
  },

  spendTokens: (amount) => {
    const state = get()
    if (state.tokens < amount) return false
    set((state) => ({ tokens: state.tokens - amount }))
    return true
  },

  claimDailyBonus: async () => {
    const now = Date.now()
    const lastBonus = get().lastDailyBonus
    const ONE_DAY = 24 * 60 * 60 * 1000

    if (lastBonus && now - lastBonus < ONE_DAY) {
      console.warn('[Game] Daily bonus not ready')
      return false
    }

    // Сохраняем бонус
    const platform = getPlatform()
    if (platform) {
      await platform.saveData({ lastDailyBonus: now })
    }

    set({
      tokens: get().tokens + TOKEN_EARNINGS.dailyBonus,
      lastDailyBonus: now,
    })
    return true
  },

  claimDailyBonusWithAd: async () => {
    const platform = getPlatform()
    if (!platform) return false

    // Показываем rewarded рекламу
    const rewarded = await platform.showRewardedVideo()
    if (!rewarded) return false

    // Начисляем бонус
    const now = Date.now()
    set({
      tokens: get().tokens + TOKEN_EARNINGS.dailyBonusWithAd,
      lastDailyBonus: now,
    })

    // Синхронизируем с облаком
    await get().syncToCloud()
    return true
  },

  incrementModelsCreated: () => {
    set((state) => ({ totalModelsCreated: state.totalModelsCreated + 1 }))
  },

  loadFromCloud: async () => {
    const platform = getPlatform()
    if (!platform) return

    try {
      const data = await platform.loadData()
      if (data.tokens) set({ tokens: data.tokens as number })
      if (data.lastDailyBonus) set({ lastDailyBonus: data.lastDailyBonus as number })
      if (data.totalModelsCreated)
        set({ totalModelsCreated: data.totalModelsCreated as number })
    } catch (error) {
      console.error('[Game] Load from cloud failed:', error)
    }
  },

  syncToCloud: async () => {
    const platform = getPlatform()
    if (!platform) return

    try {
      await platform.saveData({
        tokens: get().tokens,
        lastDailyBonus: get().lastDailyBonus,
        totalModelsCreated: get().totalModelsCreated,
      })
    } catch (error) {
      console.error('[Game] Sync to cloud failed:', error)
    }
  },
}))
