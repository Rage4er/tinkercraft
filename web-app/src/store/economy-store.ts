// src/store/economy-store.ts — Полная экономика по ECONOMY.md v2.0
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
  LIMITS,
  AD_COOLDOWN_MS,
  ACTION_COOLDOWN_MS,
  calculateCashbackV2,
  scanForCashback,
  isDayPassed,
  isCooldownPassed,
  isLimitReached,
} from './economy-config'

export { scanForCashback, calculateCashbackV2 }
import type { SceneObject, TinkerCraftOperation } from '../csg/types'

// ─── Типы ───────────────────────────────────────────────────────────

/** Тип аренды */
export type RentalKey = 'text3d' | 'extendedPalette' | 'disableBanner'

/** Тип подписки */
export type SubscriptionKey = 'weekly' | 'monthly'

/** Сложность квеста */
export type QuestDifficulty = 'easy' | 'medium' | 'hard'

/** Категория квеста V2 */
export type QuestCategory = 'composition' | 'diversity' | 'boolean' | 'transform' | 'output'

/** Триггеры для квестов V2 (состояние проекта + события) */
export type QuestTrigger =
  // 🧱 Состав
  | 'count_cubes'           // ≥ 5 кубов
  | 'count_objects'         // ≥ 8/12/20 объектов
  // 🎨 Разнообразие
  | 'count_unique_shapes'   // ≥ 4 разных примитива
  | 'count_colored'         // ≥ 3 объекта с изменённым цветом
  // 🧩 Булевы
  | 'count_csg'             // ≥ 1/2 CSG
  | 'csg_complex'           // CSG с ≥ 3 детьми
  // 🪞 Преобразования
  | 'count_mirrored'        // ≥ 1/3 зеркала
  // 📤 Вывод
  | 'export_stl'            // экспорт STL (событие)
  | 'export_stl_large'      // экспорт ≥ 10 объектов (событие)
  | 'import_stl'            // импорт STL (событие)
  // 🔤 Текст
  | 'count_text3d'          // ≥ 1 3D-текст

/** Текущий квест V2 */
interface QuestV2 {
  difficulty: QuestDifficulty
  trigger: QuestTrigger
  category: QuestCategory
  target: number
  progress: number
  reward: number
  completed: boolean // флаг зачёта (не сбрасывается при прогрессе)
  _justCompleted?: boolean // внутренний флаг: newly completed в этом вызове
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
  lastQuestCommitDate: number | null // Y3.15: защита от двойного commitQuests за день

  // ── Квесты ──
  todayQuests: QuestV2[]
  questTriggers: Record<QuestTrigger, number>
  getTodayQuests(): QuestV2[]
  completeEventQuest(trigger: QuestTrigger): void
  initDailyQuests(): void
  evaluateQuests(objects: Record<string, SceneObject>, operations: TinkerCraftOperation[]): void
  commitQuests(): Promise<void>

  // ── Хэш модели для кэшбэка ──
  lastExportHash: string | null

  // ── Для предотвращения дубликатов setData ──
  lastSavedData: string

  // ── Debounce для syncToCloud (§5 SDK: лимит 100 setData / 5 мин) ──
  pendingSync: boolean

  // ── Actions ──
  addTokens(amount: number): void
  spendTokens(amount: number): boolean

  // ── Доход ──
  claimDailyBonus(): Promise<boolean>
  watchAdForTokens(): Promise<boolean>
  watchAdForBanner(): Promise<{ ok: boolean }>
  earnActionToken(): Promise<boolean>
  calculateAndClaimCashback(scanResult: { objectCount: number; uniqueShapeTypes: number; toolsCount: number; toolCategories: number }): number

  // ── Подписки ──
  hasActiveSubscription(): boolean
  buySubscription(type: SubscriptionKey): Promise<{ ok: boolean; code?: string }>
  checkSubscriptionExpiry(): void

  // ── Аренда ──
  hasRental(key: RentalKey): boolean
  buyRental(key: RentalKey): Promise<{ ok: boolean; code?: string }>

  // ── Квесты ──
  getTodayQuests(): QuestV2[]

  // ── Синхронизация ──
  loadFromCloud(): Promise<void>
  syncToCloud(): Promise<void>

  // ── Статус панели ──
  setBannerVisible(visible: boolean): void
  bannerVisible: boolean
}

// ─── Пул квестов V2 — состояние проекта, а не клики ────────────────

/** Пул квестов V2: 15 задач, 5 категорий, гарантия разных категорий в день */
const QUEST_POOL_V2: Record<QuestDifficulty, Array<{
  trigger: QuestTrigger
  category: QuestCategory
  target: number
  reward: number
}>> = {
  easy: [
    { trigger: 'count_cubes', category: 'composition', target: 5, reward: EARNINGS_QUESTS.easy },
    { trigger: 'count_unique_shapes', category: 'diversity', target: 4, reward: EARNINGS_QUESTS.easy },
    { trigger: 'count_objects', category: 'composition', target: 8, reward: EARNINGS_QUESTS.easy },
    { trigger: 'count_colored', category: 'diversity', target: 3, reward: EARNINGS_QUESTS.easy },
    { trigger: 'count_mirrored', category: 'transform', target: 1, reward: EARNINGS_QUESTS.easy },
  ],
  medium: [
    { trigger: 'export_stl', category: 'output', target: 1, reward: EARNINGS_QUESTS.medium },
    { trigger: 'count_csg', category: 'boolean', target: 1, reward: EARNINGS_QUESTS.medium },
    { trigger: 'import_stl', category: 'output', target: 1, reward: EARNINGS_QUESTS.medium },
    { trigger: 'count_text3d', category: 'composition', target: 1, reward: EARNINGS_QUESTS.medium },
    { trigger: 'count_objects', category: 'composition', target: 12, reward: EARNINGS_QUESTS.medium },
  ],
  hard: [
    { trigger: 'count_csg', category: 'boolean', target: 2, reward: EARNINGS_QUESTS.hard },
    { trigger: 'csg_complex', category: 'boolean', target: 3, reward: EARNINGS_QUESTS.hard },
    { trigger: 'count_objects', category: 'composition', target: 20, reward: EARNINGS_QUESTS.hard },
    { trigger: 'export_stl', category: 'output', target: 10, reward: EARNINGS_QUESTS.hard },
    { trigger: 'count_mirrored', category: 'transform', target: 3, reward: EARNINGS_QUESTS.hard },
  ],
}

/** Категории для гарантии разнообразия дневных квестов */
const ALL_CATEGORIES: QuestCategory[] = ['composition', 'diversity', 'boolean', 'transform', 'output']

/**
 * Сгенерировать 3 квеста на день (1 лёгкий + 1 средний + 1 сложный),
 * все из РАЗНЫХ категорий.
 * Y3.12: строгая генерация — гарантируем разные категории даже при fallback.
 */
function generateDailyQuestsV2(): QuestV2[] {
  const difficulties: QuestDifficulty[] = ['easy', 'medium', 'hard']
  const usedCategories = new Set<QuestCategory>()
  const quests: QuestV2[] = []

  for (const diff of difficulties) {
    const pool = QUEST_POOL_V2[diff]
    // Фильтруем по неиспользованным категориям
    const available = pool.filter(q => !usedCategories.has(q.category))
    const chosen = available.length > 0
      ? available[Math.floor(Math.random() * available.length)]
      // Y3.12: fallback — берём квест из любой доступной категории, а не случайный
      : pool.find(q => !usedCategories.has(q.category)) ?? pool[0]

    usedCategories.add(chosen.category)
    quests.push({
      difficulty: diff,
      trigger: chosen.trigger,
      category: chosen.category,
      target: chosen.target,
      progress: 0,
      reward: chosen.reward,
      completed: false,
    })
  }

  return quests
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
      lastQuestCommitDate: null, // Y3.15: защита от двойного commitQuests
      todayQuests: [],
      questTriggers: {} as Record<QuestTrigger, number>,
      lastExportHash: null,
      lastSavedData: '' as string,
      pendingSync: false, // Y3.16: debounce для syncToCloud
      bannerVisible: false,

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

      // ── Ежедневный бонус: +50, 1 раз в день (§5 серверное время) ──
      claimDailyBonus: async () => {
        const state = get()
        const passed = await isDayPassed(state.lastDailyBonus)
        if (!passed) {
          console.warn('[Economy] Daily bonus already claimed today')
          return false
        }

        // Сохраняем серверное время
        const { getServerTime } = await import('../platform/server-time')
        const serverTime = await getServerTime()

        set({
          tokens: get().tokens + EARNINGS_DAILY_BONUS,
          lastDailyBonus: serverTime,
        })
        await get().syncToCloud()
        console.log(`[Economy] Daily bonus claimed: +${EARNINGS_DAILY_BONUS}`)
        return true
      },

      // ── Реклама за токены: +50, ≤ 3/день, кулдаун 5 мин (§5 серверное время) ──
      watchAdForTokens: async () => {
        const state = get()

        if (isLimitReached(state.todayAdsWatched, LIMITS.adsPerDay)) {
          console.warn('[Economy] Ad limit reached today')
          return false
        }

        const passed = await isCooldownPassed(state.lastAdTimestamp, AD_COOLDOWN_MS)
        if (!passed) {
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

        // Сохраняем серверное время
        const { getServerTime } = await import('../platform/server-time')
        const serverTime = await getServerTime()

        set((state) => ({
          tokens: state.tokens + EARNINGS_AD_REWARDED,
          todayAdsWatched: state.todayAdsWatched + 1,
          lastAdTimestamp: serverTime,
        }))
        await get().syncToCloud()
        console.log(`[Economy] Ad rewarded: +${EARNINGS_AD_REWARDED}`)
        return true
      },

      // ── Реклама для баннера: 1 просмотр → скрыть баннер на 24ч (§3.2, §6.3) ──
      // Независимо от лимитов рекламы за токены
      watchAdForBanner: async () => {
        const platform = getPlatform()
        if (!platform) {
          console.warn('[Economy] No platform for banner ad')
          return { ok: false }
        }

        const watched = await platform.showRewardedVideo()
        if (!watched) return { ok: false }

        const { getServerTime } = await import('../platform/server-time')
        const serverTime = await getServerTime()

        set((state) => ({
          rentals: { ...state.rentals, disableBanner: serverTime + ONE_DAY_MS },
        }))
        // ✅ Скрыть баннер после оплаты
        try {
          await platform.hideBannerAdv()
          console.log('[Economy] Banner hidden after rental purchase')
        } catch (e) {
          console.log('[Economy] Banner hide failed (may be dashboard-controlled):', e)
        }
        await get().syncToCloud()
        console.log('[Economy] Banner ad watched — disableBanner rental activated')
        return { ok: true }
      },

      // ── Бонус за действия: +1, ≤ 30/день, кулдаун 5 с (§5 серверное время) ──
      earnActionToken: async () => {
        const state = get()

        if (isLimitReached(state.todayActions, LIMITS.actionsPerDay)) return false
        const passed = await isCooldownPassed(state.lastActionTimestamp, ACTION_COOLDOWN_MS)
        if (!passed) return false

        // Сохраняем серверное время
        const { getServerTime } = await import('../platform/server-time')
        const serverTime = await getServerTime()

        set((state) => ({
          tokens: state.tokens + EARNINGS_ACTION,
          todayActions: state.todayActions + 1,
          lastActionTimestamp: serverTime,
        }))
        void get().syncToCloud()
        return true
      },

      // ── Кэшбэк V2 за экспорт: +1…+25, ≤ 3/день ──
      calculateAndClaimCashback: (scanResult) => {
        const state = get()

        if (isLimitReached(state.todayCashbacks, LIMITS.cashbackPerDay)) return 0

        const cashback = calculateCashbackV2(scanResult)
        if (cashback === 0) return 0

        set((state) => ({
          tokens: state.tokens + cashback,
          todayCashbacks: state.todayCashbacks + 1,
        }))
        void get().syncToCloud()
        console.log(`[Economy] Cashback V2 claimed: +${cashback}`)
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

        // §5: используем серверное время для защиты от накруток
        const { getServerTime } = await import('../platform/server-time')
        const serverTime = await getServerTime()

        set((state) => ({
          tokens: state.tokens - config.tokens,
          activeSubscription: type,
          subscriptionExpiresAt: serverTime + config.days * ONE_DAY_MS,
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

        // §5: используем серверное время для защиты от накруток
        const { getServerTime } = await import('../platform/server-time')
        const serverTime = await getServerTime()

        set((state) => ({
          tokens: state.tokens - config,
          rentals: { ...state.rentals, [key]: serverTime + ONE_DAY_MS },
        }))
        await get().syncToCloud()
        console.log(`[Economy] Rental ${key} purchased: ${config} tokens, 24h`)
        return { ok: true, code: 'ok' }
      },

      // ── Квесты V2: completeQuest удалён, используется evaluateQuests() ──
      // Старый метод completeQuest удалён — квесты теперь оцениваются по состоянию проекта

      /** Коммитить токены за завершённые квесты (вызывается при save/export) */
      // ── Коммит квестов: начисление токенов при save/export (§4 ECONOMY.md) ──
      // Y3.15: защита от двойного вызова — один коммит в день
      commitQuests: async () => {
        const state = get()
        const quests = state.todayQuests
        const now = Date.now()
        // Если уже коммитили сегодня — пропускаем
        if (state.lastQuestCommitDate && now - state.lastQuestCommitDate < ONE_DAY_MS) return

        let tokensEarned = 0
        const newCompleted: QuestDifficulty[] = []
        for (const quest of quests) {
          if (quest.completed && !state.todayQuestsCompleted.includes(quest.difficulty)) {
            tokensEarned += quest.reward
            newCompleted.push(quest.difficulty)
            console.log(`[Economy] Quest committed (${quest.difficulty}): +${quest.reward} tokens`)
          }
        }
        if (tokensEarned > 0) {
          set({
            tokens: state.tokens + tokensEarned,
            todayQuestsCompleted: [...state.todayQuestsCompleted, ...newCompleted],
            lastQuestCommitDate: now,
          })
          await get().syncToCloud()
          console.log('[Economy] Quest rewards committed to cloud')
        }
      },

      getTodayQuests: () => {
        const state = get()
        return state.todayQuests
      },

      // ── Событийный квест: отметить выполнение по триггеру ──
      // Y3.4: export_stl, import_stl — срабатывают при действии, не по состоянию
      // Y3.13: начисление токенов только через commitQuests() при save/export
      completeEventQuest: (trigger: QuestTrigger) => {
        const state = get()
        const quests = state.todayQuests
        const updated = quests.map((q) => {
          if (q.completed || q.trigger !== trigger) return q
          // Событийный квест выполнен при наступлении события
          return { ...q, completed: true, progress: q.target, _justCompleted: true }
        })
        // Только обновляем прогресс — токены начисляются через commitQuests()
        set({ todayQuests: updated })
        void get().syncToCloud()
      },

      // ── Инициализация квестов на новый день (§5 серверное время) ──
      initDailyQuests: async () => {
        const state = get()
        if (state.todayQuests.length > 0) {
          const passed = await isDayPassed(state.lastDailyBonus)
          if (passed) {
            // День сменился — сбрасываем всё
            set({
              todayQuests: generateDailyQuestsV2(),
              todayQuestsCompleted: [],
              todayAdsWatched: 0,
              todayActions: 0,
              todayCashbacks: 0,
              questTriggers: {} as Record<QuestTrigger, number>,
            })
            console.log('[Economy] New day detected — quests and counters reset')
          }
          // Уже есть квесты и день не сменился — ничего не делаем
        } else {
          // Первый запуск — генерируем квесты
          set({
            todayQuests: generateDailyQuestsV2(),
            todayQuestsCompleted: [],
            todayAdsWatched: 0,
            todayActions: 0,
            todayCashbacks: 0,
            questTriggers: {} as Record<QuestTrigger, number>,
          })
        }
      },

      // ── Оценка квестов V2 по состоянию проекта ──
      evaluateQuests: (objects: Record<string, SceneObject>, operations: TinkerCraftOperation[]) => {
        const state = get()
        const quests = state.todayQuests

        // Считаем состояния проекта
        const objectCount = Object.keys(objects).length
        const shapeTypes = new Set<string>()
        let mirroredCount = 0
        let text3dCount = 0
        let csgCount = 0
        let csgWithChildren = 0

        let coloredCount = 0
        for (const obj of Object.values(objects)) {
          shapeTypes.add(obj.shapeType)
          if (obj.color && obj.color !== '#808080') coloredCount++
          if (obj.shapeType === 'csg') csgCount++
          // Y3.7: исправлено 'text' → 'text3d'
          if (obj.shapeType === 'text3d') text3dCount++
          // Y3.6: зеркало — проверяем scale < 0
          if (obj.transform.scaleX < 0 || obj.transform.scaleY < 0 || obj.transform.scaleZ < 0) {
            mirroredCount++
          }
        }

        // Y3.5: CSG с детьми — считаем CSG-объекты у которых >= 3 детей в operations
        const csgIds = new Set<string>()
        for (const obj of Object.values(objects)) {
          if (obj.shapeType === 'csg') csgIds.add(obj.id)
        }
        // Для каждого CSG считаем количество операций group, где он участвует как родитель
        const csgChildrenCount = new Map<string, number>()
        for (const op of operations) {
          if (op.type === 'group' && op.ids && op.ids.length >= 2) {
            // Первая операция group с CSG = parent, остальные = children
            for (const id of op.ids) {
              if (csgIds.has(id)) {
                csgChildrenCount.set(id, op.ids.length - 1) // минус сам parent
              }
            }
          }
        }
        for (const [csgId, children] of csgChildrenCount) {
          if (children >= 3) csgWithChildren++
        }

        // Обновляем прогресс квестов
        const updatedQuests = quests.map((quest) => {
          if (quest.completed) return quest

          let newProgress = quest.progress

          switch (quest.trigger) {
            case 'count_cubes':
              // Считаем кубы
              newProgress = Object.values(objects).filter(o => o.shapeType === 'cube').length
              break
            case 'count_objects':
              newProgress = objectCount
              break
            case 'count_unique_shapes':
              newProgress = shapeTypes.size
              break
            case 'count_colored':
              newProgress = coloredCount
              break
            case 'count_mirrored':
              newProgress = mirroredCount
              break
            case 'count_csg':
              newProgress = csgCount
              break
            case 'csg_complex':
              // Y3.5: CSG с ≥ 3 детьми
              newProgress = csgWithChildren
              break
            case 'count_text3d':
              newProgress = text3dCount
              break
            case 'export_stl':
            case 'import_stl':
              // Событийные квесты — не обновляются здесь
              break
          }

          const completed = newProgress >= quest.target && !quest.completed

          return {
            ...quest,
            progress: Math.min(newProgress, quest.target),
            completed,
            _justCompleted: completed,
          }
        })

        // Обновляем прогресс квестов (без начисления токенов)
        // Токены начисляются только через commitQuests() при save/export
        set({ todayQuests: updatedQuests })
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
          if (data.todayQuests) set({ todayQuests: data.todayQuests as QuestV2[] })
          if (data.todayQuestsCompleted) set({ todayQuestsCompleted: data.todayQuestsCompleted as QuestDifficulty[] })
          // Daily-счётчики
          if (data.todayAdsWatched) set({ todayAdsWatched: data.todayAdsWatched as number })
          if (data.todayActions) set({ todayActions: data.todayActions as number })
          if (data.todayCashbacks) set({ todayCashbacks: data.todayCashbacks as number })
          if (data.questTriggers) set({ questTriggers: data.questTriggers as Record<QuestTrigger, number> })
        } catch (error) {
          console.error('[Economy] Load from cloud failed:', error)
        }
      },

      syncToCloud: async () => {
        const state = get()
        if (state.pendingSync) return // Y3.16: debounce — пропускаем если уже висит pending
        set({ pendingSync: true })

        const platform = getPlatform()
        if (!platform) {
          set({ pendingSync: false })
          return
        }

        const currentData = {
          tokens: get().tokens,
          lastDailyBonus: get().lastDailyBonus,
          totalModelsCreated: get().totalModelsCreated,
          activeSubscription: get().activeSubscription,
          subscriptionExpiresAt: get().subscriptionExpiresAt,
          rentals: get().rentals,
          todayQuests: get().todayQuests,
          todayQuestsCompleted: get().todayQuestsCompleted,
          // Daily-счётчики — сохраняем для восстановления после перезагрузки
          todayAdsWatched: get().todayAdsWatched,
          todayActions: get().todayActions,
          todayCashbacks: get().todayCashbacks,
          questTriggers: get().questTriggers,
        }

        // Не сохраняем, если данные не изменились с последней синхронизации
        const dataHash = JSON.stringify(currentData)
        if (get().lastSavedData === dataHash) {
          set({ pendingSync: false })
          return
        }

        try {
          await platform.saveData(currentData)
          set({ lastSavedData: dataHash, pendingSync: false })
        } catch (error) {
          console.error('[Economy] Sync to cloud failed:', error)
          set({ pendingSync: false })
        }
      },

      setBannerVisible: (visible: boolean) => {
        set({ bannerVisible: visible })
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
        lastQuestCommitDate: state.lastQuestCommitDate, // Y3.15
        // Daily-счётчики — кэшируем в localStorage
        todayAdsWatched: state.todayAdsWatched,
        todayActions: state.todayActions,
        todayCashbacks: state.todayCashbacks,
        questTriggers: state.questTriggers,
      }),
    }
  )
)
