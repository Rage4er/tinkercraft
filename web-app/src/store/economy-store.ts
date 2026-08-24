// src/store/economy-store.ts — Полная экономика по ECONOMY.md v1.0
// Релиз: моделирование бесплатно · вывод и удобства — аренда · токены · квесты
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { getPlatform } from '../platform'
import {
  ECONOMY_COSTS,
  ECONOMY_RENTALS,
  ECONOMY_SUBSCRIPTIONS,
  EARNINGS_DAILY_BONUS,
  EARNINGS_AD_REWARDED,
  EARNINGS_QUESTS,
  EARNINGS_ACTION,
  EARNINGS_CASHBACK,
  LIMITS,
  AD_COOLDOWN_MS,
  ACTION_COOLDOWN_MS,
  calculateCashback,
  isDayPassed,
  isCooldownPassed,
  isLimitReached,
} from './economy-config'

// ─── Типы ───────────────────────────────────────────────────────────

/** Тип аренды */
export type RentalKey = 'text3d' | 'extendedPalette' | 'disableBanner'

/** Тип подписки */
export type SubscriptionKey = 'weekly' | 'monthly'

/** Сложность квеста */
export type QuestDifficulty = 'easy' | 'medium' | 'hard'

/** Триггеры для квестов */
export type QuestTrigger =
  | 'addShape:cube'
  | 'addShape:sphere'
  | 'addShape:cylinder'
  | 'addShape:cone'
  | 'addShape:torus'
  | 'addShape:prism'
  | 'addShape:pyramid'
  | 'tool:mirror'
  | 'setColor'
  | 'tool:align'
  | 'csg:union'
  | 'csg:subtract'
  | 'csg:intersect'
  | 'export:stl'
  | 'import:stl'
  | 'sceneSize'

/** Текущий квест */
interface Quest {
  difficulty: QuestDifficulty
  trigger: QuestTrigger
  target: number
  progress: number
  reward: number
}

/** Состояние экономики */
interface EconomyState {
  // ── Основные данные ──
  tokens: number
  lastDailyBonus: number | null
  totalModelsCreated: number

  // ── Подписки ──
  activeSubscription: SubscriptionKey | null
  subscriptionExpiresAt: number | null

  // ── Аренда (24ч) ──
  rentals: Record<RentalKey, number | null> // timestamp когда истекает

  // ── Лимиты за день ──
  todayAdsWatched: number
  lastAdTimestamp: number | null
  todayActions: number
  lastActionTimestamp: number | null
  todayCashbacks: number
  todayQuestsCompleted: QuestDifficulty[]

  // ── Квесты ──
  todayQuests: Quest[]
  questTriggers: Record<QuestTrigger, number>
  completeQuest(trigger: QuestTrigger, sceneSize?: number): void
  getTodayQuests(): Quest[]
  initDailyQuests(): void

  // ── Хэш модели для кэшбэка ──
  lastExportHash: string | null

  // ── Actions ──
  addTokens(amount: number): void
  spendTokens(amount: number): boolean

  // ── Доход ──
  claimDailyBonus(): Promise<boolean>
  watchAdForTokens(): Promise<boolean>
  earnActionToken(): boolean
  calculateAndClaimCashback(objectCount: number, csgOps: number): number

  // ── Подписки ──
  hasActiveSubscription(): boolean
  buySubscription(type: SubscriptionKey): Promise<{ ok: boolean; code?: string }>
  checkSubscriptionExpiry(): void

  // ── Аренда ──
  hasRental(key: RentalKey): boolean
  buyRental(key: RentalKey): Promise<{ ok: boolean; code?: string }>

  // ── Квесты ──
  completeQuest(trigger: QuestTrigger, sceneSize?: number): void
  getTodayQuests(): Quest[]

  // ── Синхронизация ──
  loadFromCloud(): Promise<void>
  syncToCloud(): Promise<void>
}

// ─── Генерация ежедневных квестов ───────────────────────────────────

const QUEST_POOL: Record<QuestDifficulty, Array<{ trigger: QuestTrigger; target: number; reward: number }>> = {
  easy: [
    { trigger: 'addShape:cube', target: 5, reward: EARNINGS_QUESTS.easy },
    { trigger: 'tool:mirror', target: 3, reward: EARNINGS_QUESTS.easy },
    { trigger: 'setColor', target: 3, reward: EARNINGS_QUESTS.easy },
    { trigger: 'tool:align', target: 2, reward: EARNINGS_QUESTS.easy },
  ],
  medium: [
    { trigger: 'sceneSize', target: 10, reward: EARNINGS_QUESTS.medium }, // макс размер сцены
    { trigger: 'csg:union', target: 5, reward: EARNINGS_QUESTS.medium },
    { trigger: 'setColor', target: 5, reward: EARNINGS_QUESTS.medium },
    { trigger: 'export:stl', target: 1, reward: EARNINGS_QUESTS.medium },
  ],
  hard: [
    { trigger: 'sceneSize', target: 25, reward: EARNINGS_QUESTS.hard },
    { trigger: 'csg:subtract', target: 10, reward: EARNINGS_QUESTS.hard },
    { trigger: 'addShape:cube', target: 6, reward: EARNINGS_QUESTS.hard }, // все 6 примитивов
    { trigger: 'import:stl', target: 1, reward: EARNINGS_QUESTS.hard },
  ],
}

/** Сгенерировать 3 квеста на день (1 лёгкий + 1 средний + 1 сложный) */
function generateDailyQuests(): Quest[] {
  const difficulties: QuestDifficulty[] = ['easy', 'medium', 'hard']
  return difficulties.map((diff) => {
    const pool = QUEST_POOL[diff]
    const quest = pool[Math.floor(Math.random() * pool.length)]
    return {
      difficulty: diff,
      trigger: quest.trigger,
      target: quest.target,
      progress: 0,
      reward: quest.reward,
    }
  })
}

// ─── Хэш для кэшбэка ────────────────────────────────────────────────

const ONE_DAY_MS = 24 * 60 * 60 * 1000

/** Простой хэш строки (DJB2) */
function simpleHash(str: string): string {
  let hash = 5381
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i)
  }
  return (hash >>> 0).toString(36)
}

/** Создать хэш для проверки уникальности экспорта */
export function createExportHash(data: Record<string, unknown>): string {
  const serialized = JSON.stringify(data, Object.keys(data).sort())
  return simpleHash(serialized)
}

// ─── Store ──────────────────────────────────────────────────────────

export const useEconomyStore = create<EconomyState>()(
  persist(
    (set, get) => ({
      // ── Начальное состояние ──
      tokens: 0,
      lastDailyBonus: null,
      totalModelsCreated: 0,
      activeSubscription: null,
      subscriptionExpiresAt: null,
      rentals: {
        text3d: null,
        extendedPalette: null,
        disableBanner: null,
      },
      todayAdsWatched: 0,
      lastAdTimestamp: null,
      todayActions: 0,
      lastActionTimestamp: null,
      todayCashbacks: 0,
      todayQuestsCompleted: [],
      todayQuests: [],
      questTriggers: {} as Record<QuestTrigger, number>,
      lastExportHash: null,

      // ── Actions ──
      addTokens: (amount) => {
        set((state) => ({ tokens: state.tokens + amount }))
      },

      spendTokens: (amount) => {
        const state = get()
        if (state.tokens < amount) return false
        set((state) => ({ tokens: state.tokens - amount }))
        void get().syncToCloud()
        return true
      },

      // ── Ежедневный бонус: +50, 1 раз в день ──
      claimDailyBonus: async () => {
        const state = get()
        if (!isDayPassed(state.lastDailyBonus)) {
          console.warn('[Economy] Daily bonus already claimed today')
          return false
        }

        set({
          tokens: get().tokens + EARNINGS_DAILY_BONUS,
          lastDailyBonus: Date.now(),
        })
        await get().syncToCloud()
        console.log(`[Economy] Daily bonus claimed: +${EARNINGS_DAILY_BONUS}`)
        return true
      },

      // ── Реклама за токены: +50, ≤ 3/день, кулдаун 5 мин ──
      watchAdForTokens: async () => {
        const state = get()

        if (isLimitReached(state.todayAdsWatched, LIMITS.adsPerDay)) {
          console.warn('[Economy] Ad limit reached today')
          return false
        }

        if (!isCooldownPassed(state.lastAdTimestamp, AD_COOLDOWN_MS)) {
          console.warn('[Economy] Ad cooldown not passed')
          return false
        }

        const platform = getPlatform()
        if (!platform) {
          console.warn('[Economy] No platform for ad')
          return false
        }

        const rewarded = await platform.showRewardedVideo()
        if (!rewarded) return false

        set((state) => ({
          tokens: state.tokens + EARNINGS_AD_REWARDED,
          todayAdsWatched: state.todayAdsWatched + 1,
          lastAdTimestamp: Date.now(),
        }))
        await get().syncToCloud()
        console.log(`[Economy] Ad rewarded: +${EARNINGS_AD_REWARDED}`)
        return true
      },

      // ── Бонус за действия: +1, ≤ 30/день, кулдаун 5 с ──
      earnActionToken: () => {
        const state = get()

        if (isLimitReached(state.todayActions, LIMITS.actionsPerDay)) return false
        if (!isCooldownPassed(state.lastActionTimestamp, ACTION_COOLDOWN_MS)) return false

        set((state) => ({
          tokens: state.tokens + EARNINGS_ACTION,
          todayActions: state.todayActions + 1,
          lastActionTimestamp: Date.now(),
        }))
        return true
      },

      // ── Кэшбэк за экспорт: +5…+25, ≤ 3/день ──
      calculateAndClaimCashback: (objectCount: number, csgOps: number) => {
        const state = get()

        if (isLimitReached(state.todayCashbacks, LIMITS.cashbackPerDay)) return 0

        const cashback = calculateCashback(objectCount, csgOps)
        if (cashback === 0) return 0

        set((state) => ({
          tokens: state.tokens + cashback,
          todayCashbacks: state.todayCashbacks + 1,
        }))
        console.log(`[Economy] Cashback claimed: +${cashback}`)
        return cashback
      },

      // ── Подписки ──
      hasActiveSubscription: () => {
        const state = get()
        if (!state.activeSubscription) return false
        if (state.subscriptionExpiresAt && Date.now() > state.subscriptionExpiresAt) {
          set({ activeSubscription: null, subscriptionExpiresAt: null })
          return false
        }
        return true
      },

      buySubscription: async (type: SubscriptionKey) => {
        const config = ECONOMY_SUBSCRIPTIONS[type]
        const state = get()

        if (state.tokens < config.tokens) {
          return { ok: false, code: 'not_enough' }
        }

        set((state) => ({
          tokens: state.tokens - config.tokens,
          activeSubscription: type,
          subscriptionExpiresAt: Date.now() + config.days * ONE_DAY_MS,
        }))
        await get().syncToCloud()
        console.log(`[Economy] Subscription ${type} purchased: ${config.tokens} tokens, ${config.days} days`)
        return { ok: true, code: 'ok' }
      },

      checkSubscriptionExpiry: () => {
        const state = get()
        if (state.subscriptionExpiresAt && Date.now() > state.subscriptionExpiresAt) {
          set({ activeSubscription: null, subscriptionExpiresAt: null })
        }
      },

      // ── Аренда 24ч ──
      hasRental: (key: RentalKey) => {
        const state = get()
        const expires = state.rentals[key]
        if (!expires) return false
        if (Date.now() > expires) {
          set((state) => ({ rentals: { ...state.rentals, [key]: null } }))
          return false
        }
        return true
      },

      buyRental: async (key: RentalKey) => {
        const config = ECONOMY_RENTALS[key]
        const state = get()

        if (state.tokens < config) {
          return { ok: false, code: 'not_enough' }
        }

        set((state) => ({
          tokens: state.tokens - config,
          rentals: { ...state.rentals, [key]: Date.now() + ONE_DAY_MS },
        }))
        await get().syncToCloud()
        console.log(`[Economy] Rental ${key} purchased: ${config} tokens, 24h`)
        return { ok: true, code: 'ok' }
      },

      // ── Квесты ──
      completeQuest: (trigger: QuestTrigger, sceneSize?: number) => {
        const state = get()
        const quests = state.todayQuests

        for (const quest of quests) {
          if (quest.progress >= quest.target) continue

          // Сценарий sceneSize: максимальный размер сцены за день
          if (quest.trigger === 'sceneSize') {
            if (sceneSize !== undefined && sceneSize > quest.progress) {
              const newProgress = sceneSize
              const completed = newProgress >= quest.target

              set((state) => ({
                todayQuests: state.todayQuests.map((q) =>
                  q === quest ? { ...q, progress: newProgress } : q
                ),
                questTriggers: { ...state.questTriggers, [trigger]: (state.questTriggers[trigger] || 0) + 1 },
              }))

              if (completed && !state.todayQuestsCompleted.includes(quest.difficulty)) {
                set((state) => ({
                  tokens: state.tokens + quest.reward,
                  todayQuestsCompleted: [...state.todayQuestsCompleted, quest.difficulty],
                }))
                console.log(`[Economy] Quest completed (${quest.difficulty}): +${quest.reward} tokens`)
              }
            }
            continue
          }

          if (quest.trigger === trigger) {
            const newProgress = quest.progress + 1
            const completed = newProgress >= quest.target

            set((state) => ({
              todayQuests: state.todayQuests.map((q) =>
                q === quest ? { ...q, progress: newProgress } : q
              ),
              questTriggers: { ...state.questTriggers, [trigger]: (state.questTriggers[trigger] || 0) + 1 },
            }))

            if (completed && !state.todayQuestsCompleted.includes(quest.difficulty)) {
              set((state) => ({
                tokens: state.tokens + quest.reward,
                todayQuestsCompleted: [...state.todayQuestsCompleted, quest.difficulty],
              }))
              console.log(`[Economy] Quest completed (${quest.difficulty}): +${quest.reward} tokens`)
            }
          }
        }
      },

      getTodayQuests: () => {
        const state = get()
        return state.todayQuests
      },

      // ── Инициализация квестов на новый день ──
      initDailyQuests: () => {
        const state = get()
        if (state.todayQuests.length > 0 && !isDayPassed(state.lastDailyBonus)) {
          // Уже есть квесты и день не сменился
          return
        }
        set({
          todayQuests: generateDailyQuests(),
          todayQuestsCompleted: [],
          todayAdsWatched: 0,
          todayActions: 0,
          todayCashbacks: 0,
          questTriggers: {} as Record<QuestTrigger, number>,
        })
      },

      // ── Синхронизация ──
      loadFromCloud: async () => {
        const platform = getPlatform()
        if (!platform) return

        try {
          const data = await platform.loadData()
          if (data.tokens) set({ tokens: data.tokens as number })
          if (data.lastDailyBonus) set({ lastDailyBonus: data.lastDailyBonus as number })
          if (data.totalModelsCreated) set({ totalModelsCreated: data.totalModelsCreated as number })
          if (data.activeSubscription) set({ activeSubscription: data.activeSubscription as SubscriptionKey })
          if (data.subscriptionExpiresAt) set({ subscriptionExpiresAt: data.subscriptionExpiresAt as number })
          if (data.rentals) set({ rentals: data.rentals as Record<RentalKey, number | null> })
          if (data.todayQuests) set({ todayQuests: data.todayQuests as Quest[] })
          if (data.todayQuestsCompleted) set({ todayQuestsCompleted: data.todayQuestsCompleted as QuestDifficulty[] })
        } catch (error) {
          console.error('[Economy] Load from cloud failed:', error)
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
            activeSubscription: get().activeSubscription,
            subscriptionExpiresAt: get().subscriptionExpiresAt,
            rentals: get().rentals,
            todayQuests: get().todayQuests,
            todayQuestsCompleted: get().todayQuestsCompleted,
          })
        } catch (error) {
          console.error('[Economy] Sync to cloud failed:', error)
        }
      },
    }),
    {
      name: 'tinkercraft-economy',
      version: 1,
      partialize: (state) => ({
        tokens: state.tokens,
        lastDailyBonus: state.lastDailyBonus,
        totalModelsCreated: state.totalModelsCreated,
        activeSubscription: state.activeSubscription,
        subscriptionExpiresAt: state.subscriptionExpiresAt,
        rentals: state.rentals,
        todayQuests: state.todayQuests,
        todayQuestsCompleted: state.todayQuestsCompleted,
      }),
    }
  )
)
