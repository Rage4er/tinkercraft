// src/store/game-store.ts — Токены, ежедневные бонусы, синхронизация, разблокировки
import { create } from 'zustand'
import { getPlatform } from '../platform'
import { getLockConfig } from './lock-config'

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
  adRewarded: 10,
  modelRated: 5,
  challengeComplete: 15,
  speedBuildWin: 25,
  achievementUnlock: 50,
} as const

const ONE_DAY = 24 * 60 * 60 * 1000

// ─── Состояние ─────────────────────────────────────────────────────
interface GameState {
  // Данные
  tokens: number
  lastDailyBonus: number | null
  totalModelsCreated: number
  unlockedItems: string[]

  // Actions
  addTokens(amount: number): void
  spendTokens(amount: number, reason: string): boolean
  claimDailyBonus(): Promise<boolean>
  claimDailyBonusWithAd(): Promise<boolean>
  watchAdForTokens(): Promise<boolean>
  incrementModelsCreated(): void
  loadFromCloud(): Promise<void>
  syncToCloud(): Promise<void>
  isUnlocked(id: string): boolean
  unlockWithTokens(id: string): Promise<{ ok: boolean; code?: string }>
  unlockWithAd(id: string): Promise<{ ok: boolean; code?: string }>
}

// ─── Store ─────────────────────────────────────────────────────────
export const useGameStore = create<GameState>((set, get) => ({
  tokens: 0,
  lastDailyBonus: null,
  totalModelsCreated: 0,
  unlockedItems: [] as string[],

  addTokens: (amount) => {
    set((state) => ({ tokens: state.tokens + amount }))
  },

  spendTokens: (amount, reason) => {
    const state = get()
    if (state.tokens < amount) return false
    set((state) => ({ tokens: state.tokens - amount }))
    // FIX (REVIEW-7): Полная синхронизация, а не частичный saveData
    void get().syncToCloud()
    console.log(`[Game] Spent ${amount} tokens for ${reason}`)
    return true
  },

  // ✅ Ежедневный бонус: +5, 1 раз в сутки, без рекламы
  claimDailyBonus: async () => {
    const now = Date.now()
    const lastBonus = get().lastDailyBonus

    if (lastBonus && now - lastBonus < ONE_DAY) {
      console.warn('[Game] Daily bonus not ready')
      return false
    }

    set({
      tokens: get().tokens + TOKEN_EARNINGS.dailyBonus,
      lastDailyBonus: now,
    })
    await get().syncToCloud()
    return true
  },

  // ✅ Ежедневный бонус ×4: +20, 1 раз в сутки, с рекламой
  claimDailyBonusWithAd: async () => {
    const now = Date.now()
    const lastBonus = get().lastDailyBonus

    // Сначала проверяем лимит — не показываем рекламу зря
    if (lastBonus && now - lastBonus < ONE_DAY) {
      console.warn('[Game] Daily bonus already claimed. Use watchAdForTokens() for +10.')
      return false
    }

    const platform = getPlatform()
    if (!platform) return false

    // Реклама с корректным onRewarded
    const rewarded = await platform.showRewardedVideo()
    if (!rewarded) return false

    set({
      tokens: get().tokens + TOKEN_EARNINGS.dailyBonusWithAd,
      lastDailyBonus: now,
    })
    await get().syncToCloud()
    return true
  },

  // ✅ Реклама за токены: +10, БЕЗ лимита — отдельная механика
  watchAdForTokens: async () => {
    const platform = getPlatform()
    if (!platform) return false

    const rewarded = await platform.showRewardedVideo()
    if (!rewarded) return false

    set((state) => ({ tokens: state.tokens + TOKEN_EARNINGS.adRewarded }))
    await get().syncToCloud()
    return true
  },

  incrementModelsCreated: () => {
    set((state) => ({ totalModelsCreated: state.totalModelsCreated + 1 }))
  },

  // ─── Разблокировка элементов ──────────────────────────────────────
  isUnlocked: (id: string) => {
    const state = get()
    if (!getLockConfig(id)) return true // нет конфига — всегда разблокировано
    return state.unlockedItems.includes(id)
  },

  unlockWithTokens: async (id: string) => {
    const cfg = getLockConfig(id)
    if (!cfg) return { ok: true }
    const state = get()
    if (state.tokens < cfg.tokens) return { ok: false, code: 'not_enough' }

    set((s) => ({
      tokens: s.tokens - cfg.tokens,
      unlockedItems: [...s.unlockedItems, id],
    }))
    await get().syncToCloud()
    console.log(`[Game] Unlocked ${id} with ${cfg.tokens} tokens`)
    return { ok: true, code: 'ok' }
  },

  unlockWithAd: async (id: string) => {
    const cfg = getLockConfig(id)
    if (!cfg?.ad) return { ok: false, code: 'no_ad' }

    const rewarded = await getPlatform()?.showRewardedVideo()
    if (!rewarded) return { ok: false, code: 'ad_skipped' }

    set((s) => ({ unlockedItems: [...s.unlockedItems, id] }))
    await get().syncToCloud()
    console.log(`[Game] Unlocked ${id} with ad`)
    return { ok: true, code: 'ok' }
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
      if (data.unlockedItems)
        set({ unlockedItems: data.unlockedItems as string[] })
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
        unlockedItems: get().unlockedItems,
      })
    } catch (error) {
      console.error('[Game] Sync to cloud failed:', error)
    }
  },
}))
