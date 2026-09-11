// src/store/economy-store.ts — Полная экономика по ECONOMY.md v2.0
// Релиз: моделирование бесплатно · вывод и удобства — аренда · токены · квесты
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { getPlatform, isEconomyAvailable } from '../platform'
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
  countSceneObjects, // P1-2: единый подсчёт объектов для экспорта/кэшбэка/квестов
  isDayPassed,
  isCooldownPassed,
  isLimitReached,
} from './economy-config'
import type { CashbackScanResult } from './economy-config'
import { getCachedServerTime } from '../platform/server-time'

export { scanForCashback, calculateCashbackV2, countSceneObjects }
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
  /** P0-1: хэши моделей, за которые уже начислен кэшбэк сегодня (анти-фарм) */
  todayExportHashes: string[]
  todayQuestsCompleted: QuestDifficulty[]

  // ── Квесты ──
  todayQuests: QuestV2[]
  questTriggers: Record<QuestTrigger, number>
  getTodayQuests(): QuestV2[]
  completeEventQuest(trigger: QuestTrigger, objectCount?: number): void
  initDailyQuests(): void
  /** P1-1: проверить смену суток по серверному времени и сбросить дневные лимиты при необходимости */
  refreshDayRollover(): Promise<void>
  evaluateQuests(objects: Record<string, SceneObject>, operations: TinkerCraftOperation[]): void
  commitQuests(): Promise<void>

  // ── Хэш модели для кэшбэка ──
  lastExportHash: string | null

  // ── Дата последнего сброса квестов (E7: независима от бонуса) ──
  lastQuestResetDate: number | null

  // ── P2-3: онбординг показан — единая точка персиста и синхронизации.
  // Сохраняется через store (persist + syncToCloud), а не напрямую в saveData:
  // компонент EconomyOnboarding вызывает completeOnboarding() ── флаг попадает
  // в localStorage и облако атомарно, без риска затереть облачные поля. ──
  onboardingDone: boolean

  // ── Для предотвращения дубликатов setData ──
  lastSavedData: string

  // ── Debounce для syncToCloud (§5 SDK: лимит 100 setData / 5 мин) ──
  pendingSync: boolean
  /** P0-3: «грязный» флаг — повторный вызов syncToCloud во время активной синхронизации */
  syncTailPending: boolean

  // ── Actions ──
  addTokens(amount: number): void
  spendTokens(amount: number): boolean
  /** P2-3: отметить онбординг завершённым (persist + облако) */
  completeOnboarding(): void
  /** E6: зафиксировать хэш экспортированной модели (через set, с persist) */
  setExportHash(hash: string): void

  // ── Доход ──
  claimDailyBonus(): Promise<boolean>
  watchAdForTokens(): Promise<boolean>
  /** EC2: N реклам подряд для импорта (без кулдауна между показами) */
  watchAdsForImport(count: number): Promise<boolean>
  watchAdForBanner(): Promise<{ ok: boolean }>
  earnActionToken(): Promise<boolean>
  /** P0-1: кэшбэк начисляется только если hash не был использован сегодня (анти-фарм) */
  calculateAndClaimCashback(scanResult: CashbackScanResult, hash?: string | null): number

  // ── Подписки ──
  hasActiveSubscription(): boolean
  hasActiveSubscriptionRO(): boolean
  buySubscription(type: SubscriptionKey): Promise<{ ok: boolean; code?: string }>
  checkSubscriptionExpiry(): void

  // ── Аренда ──
  hasRental(key: RentalKey): boolean
  hasRentalRO(key: RentalKey): boolean
  /** P1-5: единый read-only доступ к 3D-тексту (подписка ИЛИ аренда text3d по серверному времени) */
  canUseText3dRO(): boolean
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

/**
 * P0-2: текущее время по СЕРВЕРНЫМ часам (кэш ~30с).
 * Expiry аренд/подписок и кулдауны обязаны вычисляться от серверного времени —
 * перевод локальных часов не должен продлевать подписки (§5 ECONOMY.md).
 * Fallback: если серверное время ещё не получено (SDK недоступен/не готов),
 * используем локальное Date.now() — это допустимо, т.к. при отсутствии SDK
 * экономика всё равно отключена (P0-6), а защита восстанавливается вместе с SDK.
 */
function serverTimeNow(): number {
  return getCachedServerTime() ?? Date.now()
}

/** Простой хэш строки (DJB2) */
function simpleHash(str: string): string {
  let hash = 5381
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i)
  }
  return (hash >>> 0).toString(36)
}

/** Рекурсивно отсортировать ключи объектов (стабильный хэш к порядку ключей) */
function sortDeep(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortDeep) // порядок массива СОХРАНЯЕТСЯ (важно для P1-3)
  if (v !== null && typeof v === 'object') {
    const out: Record<string, unknown> = {}
    for (const k of Object.keys(v as Record<string, unknown>).sort()) {
      out[k] = sortDeep((v as Record<string, unknown>)[k])
    }
    return out
  }
  return v
}

/**
 * Создать хэш для проверки уникальности экспорта.
 * P1-3: хэширует ВСЮ структуру данных (включая вложенные ключи и порядок
 * элементов массивов) — изменение CSG-структуры (operations) даёт другой хэш.
 * Стабилен к порядку ключей объекта (сортировка на каждом уровне).
 */
export function createExportHash(data: Record<string, unknown>): string {
  const serialized = JSON.stringify(sortDeep(data))
  return simpleHash(serialized)
}

// ─── P0-5: Санитизация данных экономики (клиентская часть) ──────────
//
// ⚠️ ОГРАНИЧЕНИЕ (задокументировано): полная серверная валидация невозможна —
// Yandex SDK хранит данные как непрозрачный блоб и не имеет серверной логики.
// Поэтому здесь реализована КЛИЕНТСКАЯ защита от прямых правок localStorage:
//  - clamp токенов в [0, MAX_TOKENS] (MAX_TOKENS = 1_000_000);
//  - валидация структуры полей (числа/строки/булевы/массивы), отбрасывание мусора;
//  - при hydrate (persist merge) и перед syncToCloud/loadFromCloud.
// Это НЕ защищает от опытного пользователя, но исключает случайный/наивный фрод.

/** Максимально допустимое число токенов (P0-5: кап против правок localStorage) */
export const MAX_TOKENS = 1_000_000

/** Поля экономики, которые персистятся и синхронизируются с облаком */
type PersistedEconomyFields = Pick<
  EconomyState,
  | 'tokens'
  | 'lastDailyBonus'
  | 'totalModelsCreated'
  | 'activeSubscription'
  | 'subscriptionExpiresAt'
  | 'rentals'
  | 'todayQuests'
  | 'todayQuestsCompleted'
  | 'todayAdsWatched'
  | 'todayActions'
  | 'todayCashbacks'
  | 'todayExportHashes'
  | 'questTriggers'
  | 'lastExportHash'
  | 'lastQuestResetDate'
  | 'lastSavedData'
  | 'onboardingDone'
>

const RENTAL_KEYS: RentalKey[] = ['text3d', 'extendedPalette', 'disableBanner']
const SUBSCRIPTION_KEYS: SubscriptionKey[] = ['weekly', 'monthly']
const QUEST_DIFFICULTIES: QuestDifficulty[] = ['easy', 'medium', 'hard']
const QUEST_CATEGORIES: QuestCategory[] = ['composition', 'diversity', 'boolean', 'transform', 'output']
const QUEST_TRIGGERS: QuestTrigger[] = [
  'count_cubes', 'count_objects', 'count_unique_shapes', 'count_colored', 'count_csg',
  'csg_complex', 'count_mirrored', 'export_stl', 'export_stl_large', 'import_stl', 'count_text3d',
]

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** Число: конечное и в диапазоне, иначе fallback */
function toClampedNumber(v: unknown, fallback: number, min: number, max: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return fallback
  return Math.min(max, Math.max(min, Math.floor(v)))
}

/** Число | null: null/undefined → null, невалидное → null, иначе число */
function toNullableTimestamp(v: unknown): number | null {
  if (v === null || v === undefined) return null
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

/** Строка | null */
function toNullableString(v: unknown): string | null {
  return typeof v === 'string' ? v : null
}

/** Валидный квест V2 или null */
function sanitizeQuest(v: unknown): QuestV2 | null {
  if (!isPlainObject(v)) return null
  const { difficulty, trigger, category, target, progress, reward, completed } = v
  if (typeof difficulty !== 'string' || !QUEST_DIFFICULTIES.includes(difficulty as QuestDifficulty)) return null
  if (typeof trigger !== 'string' || !QUEST_TRIGGERS.includes(trigger as QuestTrigger)) return null
  if (typeof category !== 'string' || !QUEST_CATEGORIES.includes(category as QuestCategory)) return null
  if (typeof target !== 'number' || !Number.isFinite(target) || target < 1) return null
  if (typeof reward !== 'number' || !Number.isFinite(reward) || reward < 0) return null
  const p = typeof progress === 'number' && Number.isFinite(progress) ? Math.max(0, Math.floor(progress)) : 0
  return {
    difficulty: difficulty as QuestDifficulty,
    trigger: trigger as QuestTrigger,
    category: category as QuestCategory,
    target: Math.floor(target),
    progress: Math.min(p, Math.floor(target)),
    reward: Math.floor(reward),
    completed: completed === true || p >= Math.floor(target),
  }
}

/**
 * P0-5: санитизация данных экономики.
 * Принимает произвольные данные (localStorage/cloud/hydrate) и возвращает
 * валидный Partial персистентных полей, либо null (данные не объект).
 * Экспортируется для тестов.
 */
export function sanitizeEconomyData(raw: unknown): Partial<PersistedEconomyFields> | null {
  if (!isPlainObject(raw)) return null

  const out: Partial<PersistedEconomyFields> = {}

  // Токены: неотрицательные, кап 1_000_000
  out.tokens = toClampedNumber(raw.tokens, 0, 0, MAX_TOKENS)

  out.lastDailyBonus = toNullableTimestamp(raw.lastDailyBonus)
  out.totalModelsCreated = toClampedNumber(raw.totalModelsCreated, 0, 0, 1_000_000)
  out.lastQuestResetDate = toNullableTimestamp(raw.lastQuestResetDate)
  out.subscriptionExpiresAt = toNullableTimestamp(raw.subscriptionExpiresAt)

  // Подписка: только известные ключи
  const sub = raw.activeSubscription
  out.activeSubscription = typeof sub === 'string' && SUBSCRIPTION_KEYS.includes(sub as SubscriptionKey)
    ? (sub as SubscriptionKey)
    : null

  // Аренда: строгая структура — все 3 ключа, значения timestamp|null
  if (isPlainObject(raw.rentals)) {
    const r = raw.rentals
    const rentals = {} as Record<RentalKey, number | null>
    for (const key of RENTAL_KEYS) rentals[key] = toNullableTimestamp(r[key])
    out.rentals = rentals
  } else {
    out.rentals = { text3d: null, extendedPalette: null, disableBanner: null }
  }

  // Квесты: фильтруем невалидные
  out.todayQuests = Array.isArray(raw.todayQuests)
    ? raw.todayQuests.map(sanitizeQuest).filter((q): q is QuestV2 => q !== null)
    : []

  // Завершённые квесты: только известные сложности
  out.todayQuestsCompleted = Array.isArray(raw.todayQuestsCompleted)
    ? raw.todayQuestsCompleted.filter((d): d is QuestDifficulty =>
      typeof d === 'string' && QUEST_DIFFICULTIES.includes(d as QuestDifficulty))
    : []

  // Дневные счётчики: clamp к дневным лимитам (нельзя записать 9999 реклам)
  out.todayAdsWatched = toClampedNumber(raw.todayAdsWatched, 0, 0, LIMITS.adsPerDay)
  out.todayActions = toClampedNumber(raw.todayActions, 0, 0, LIMITS.actionsPerDay)
  out.todayCashbacks = toClampedNumber(raw.todayCashbacks, 0, 0, LIMITS.cashbackPerDay)

  // P0-1: список хэшей за день — только строки
  out.todayExportHashes = Array.isArray(raw.todayExportHashes)
    ? raw.todayExportHashes.filter((h): h is string => typeof h === 'string')
    : []

  // Триггеры квестов: число → clamp ≥ 0
  if (isPlainObject(raw.questTriggers)) {
    const qt = {} as Record<QuestTrigger, number>
    for (const [k, v] of Object.entries(raw.questTriggers)) {
      if (typeof v === 'number' && Number.isFinite(v) && v >= 0) qt[k as QuestTrigger] = Math.floor(v)
    }
    out.questTriggers = qt
  } else {
    out.questTriggers = {} as Record<QuestTrigger, number>
  }

  out.lastExportHash = toNullableString(raw.lastExportHash)
  out.lastSavedData = typeof raw.lastSavedData === 'string' ? raw.lastSavedData : ''
  out.onboardingDone = raw.onboardingDone === true

  return out
}

/** Собрать данные для отправки в облако (единый источник для sync/load) */
function collectSyncData(state: EconomyState): Record<string, unknown> {
  return {
    tokens: state.tokens,
    lastDailyBonus: state.lastDailyBonus,
    totalModelsCreated: state.totalModelsCreated,
    activeSubscription: state.activeSubscription,
    subscriptionExpiresAt: state.subscriptionExpiresAt,
    rentals: state.rentals,
    todayQuests: state.todayQuests,
    todayQuestsCompleted: state.todayQuestsCompleted,
    todayAdsWatched: state.todayAdsWatched,
    todayActions: state.todayActions,
    todayCashbacks: state.todayCashbacks,
    todayExportHashes: state.todayExportHashes, // P0-1: защита от очистки localStorage
    questTriggers: state.questTriggers,
    lastExportHash: state.lastExportHash,
    lastQuestResetDate: state.lastQuestResetDate,
    onboardingDone: state.onboardingDone, // P2-3: синхронизируем флаг онбординга
  }
}

/** Хэш текущего состояния для dedupe setData (P0-4) */
function computeSavedDataHash(state: EconomyState): string {
  return JSON.stringify(collectSyncData(state))
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
      todayExportHashes: [] as string[], // P0-1: анти-фарм кэшбэка за день
      todayQuestsCompleted: [],
      todayQuests: [],
      questTriggers: {} as Record<QuestTrigger, number>,
      lastExportHash: null,
      lastQuestResetDate: null, // E7: дата последнего сброса квестов
      onboardingDone: false, // P2-3: онбординг не показан по умолчанию
      lastSavedData: '' as string,
      pendingSync: false, // Y3.16: debounce для syncToCloud
      syncTailPending: false, // P0-3: «грязный» флаг для повторной синхронизации
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

      // P2-3: отметить онбординг завершённым. Флаг попадает в persist
      // (localStorage) и в облако через syncToCloud() — единая точка
      // персиста/синхронизации вместо прямого platform.saveData().
      completeOnboarding: () => {
        set({ onboardingDone: true })
        void get().syncToCloud()
      },

      // E6: хэш экспорта фиксируется через set() — попадает в persist/cloud.
      // P0-1: атомарно добавляем хэш в список «за сегодня» (анти-фарм кэшбэка).
      setExportHash: (hash) => {
        const state = get()
        const already = state.todayExportHashes.includes(hash)
        set({
          lastExportHash: hash,
          todayExportHashes: already ? state.todayExportHashes : [...state.todayExportHashes, hash],
        })
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

      // ── EC2: N рекламы подряд для импорта (§3.1: 2 просмотра) ──
      // Без кулдауна между показами — кулдаун проверяется только один раз в начале
      // P1-6: каждая УСПЕШНО просмотренная реклама начисляет +50 СРАЗУ, даже если
      // пользователь не досмотрел серию (отказ на 2-й) — показ платформой засчитан,
      // значит награда положена. Импорт дополнительно списывает стоимость токенами
      // в ImportModal (§3.1: 100 TC) — реклама и токены не смешиваются.
      watchAdsForImport: async (count: number): Promise<boolean> => {
        const state = get()

        // Проверяем только текущий лимит — серия показывается до тех пор,
        // пока не исчерпан дневной лимит 3/день (§2)
        if (isLimitReached(state.todayAdsWatched, LIMITS.adsPerDay)) {
          console.warn('[Economy] Ad limit reached for import')
          return false
        }

        const passed = await isCooldownPassed(state.lastAdTimestamp, AD_COOLDOWN_MS)
        if (!passed) {
          console.warn('[Economy] Ad cooldown not passed before import ads')
          return false
        }

        const platform = getPlatform()
        if (!platform) {
          console.warn('[Economy] No platform for ad')
          return false
        }

        const { getServerTime } = await import('../platform/server-time')
        let watchedCount = 0
        for (let i = 0; i < count; i++) {
          // Дневной лимит не даёт превысить 3/день даже в середине серии
          if (isLimitReached(get().todayAdsWatched, LIMITS.adsPerDay)) break
          const rewarded = await platform.showRewardedVideo()
          if (!rewarded) break
          watchedCount++
          // Серверное время после каждого показа (P2-2: getServerTime напрямую)
          const serverTime = await getServerTime()
          set((st) => ({
            tokens: st.tokens + EARNINGS_AD_REWARDED,
            todayAdsWatched: st.todayAdsWatched + 1,
            lastAdTimestamp: serverTime,
          }))
        }

        // Ни один ролик не показан — операция не оплачена
        if (watchedCount === 0) return false

        void get().syncToCloud()
        console.log(`[Economy] Import ads watched: ${watchedCount}x+${EARNINGS_AD_REWARDED} tokens (partial ok)`)
        // P1-6: true только если серия завершена полностью (импорт оплачен рекламой).
        // При частичном просмотре токены уже начислены, но импорт требует полной оплаты.
        return watchedCount >= count
      },

      // ── Реклама для баннера: 1 просмотр → скрыть баннер на 24ч (§3.2, §6.3) ──
      // P1-7: реклама баннера — rewarded-показ платформы, поэтому тратит ОБЩИЙ
      // дневной лимит 3/день (§2 ECONOMY.md: «Реклама ≤3/день» без исключений для
      // баннера) и увеличивает todayAdsWatched. Токены за показ НЕ начисляются —
      // это оплата аренды disableBanner (§3.2: «Отключение баннера — 50 TC ИЛИ
      // 1 просмотр»), а не заработок. Общий кулдаун 5 мин между rewarded-показами
      // сохраняется (E4: требование Яндекса — пауза между рекламой).
      watchAdForBanner: async () => {
        const state = get()

        // P1-7: общий лимит rewarded-рекламы 3/день (§2)
        if (isLimitReached(state.todayAdsWatched, LIMITS.adsPerDay)) {
          console.warn('[Economy] Banner ad limit reached today')
          return { ok: false }
        }

        // E4: общий кулдаун rewarded-рекламы (токен-реклама и баннер делят паузу)
        const cooldownPassed = await isCooldownPassed(state.lastAdTimestamp, AD_COOLDOWN_MS)
        if (!cooldownPassed) {
          console.warn('[Economy] Banner ad cooldown not passed')
          return { ok: false }
        }

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
          lastAdTimestamp: serverTime, // E4: баннер-реклама тоже открывает кулдаун
          todayAdsWatched: state.todayAdsWatched + 1, // P1-7: общий лимит 3/день
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
      // P0-1: анти-фарм — hash модели проверяется ДО начисления. Повторный
      // экспорт той же модели (undo/redo, перезагрузка, очистка localStorage
      // невозможна т.к. хэш хранится и в облаке) НЕ даёт повторного кэшбэка.
      // P0-6: без Yandex SDK экономика полностью отключена — кэшбэк не начисляется.
      calculateAndClaimCashback: (scanResult, hash) => {
        const state = get()

        if (!isEconomyAvailable()) return 0

        // Анти-фарм: проверяем хэш ДО начисления
        if (hash) {
          if (hash === state.lastExportHash || state.todayExportHashes.includes(hash)) {
            console.log(`[Economy] Cashback skipped — hash already used today: ${hash}`)
            return 0
          }
        }

        if (isLimitReached(state.todayCashbacks, LIMITS.cashbackPerDay)) return 0

        const cashback = calculateCashbackV2(scanResult)
        if (cashback === 0) return 0

        // Атомарно: начисление + фиксация хэша в списке «за сегодня»
        set((state) => ({
          tokens: state.tokens + cashback,
          todayCashbacks: state.todayCashbacks + 1,
          lastExportHash: hash ?? state.lastExportHash,
          todayExportHashes: hash && !state.todayExportHashes.includes(hash)
            ? [...state.todayExportHashes, hash]
            : state.todayExportHashes,
        }))
        void get().syncToCloud()
        console.log(`[Economy] Cashback V2 claimed: +${cashback}`)
        return cashback
      },

      // ── Подписки ──
      /** Read-only проверка подписки (без мутации, для selector-ов) */
      // P0-2: expiry по серверному времени (перевод часов не продлевает подписку)
      hasActiveSubscriptionRO: () => {
        const state = get()
        if (!state.activeSubscription) return false
        if (state.subscriptionExpiresAt && serverTimeNow() > state.subscriptionExpiresAt) {
          return false
        }
        return true
      },
      /** Mutingating проверка подписки — очищает истёкшую (для render-фазы) */
      // P0-2: expiry по серверному времени
      hasActiveSubscription: () => {
        const state = get()
        if (!state.activeSubscription) return false
        if (state.subscriptionExpiresAt && serverTimeNow() > state.subscriptionExpiresAt) {
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

      // P0-2: expiry по серверному времени
      checkSubscriptionExpiry: () => {
        const state = get()
        if (state.subscriptionExpiresAt && serverTimeNow() > state.subscriptionExpiresAt) {
          set({ activeSubscription: null, subscriptionExpiresAt: null })
        }
      },

      // ── Аренда 24ч ──
      /** Read-only проверка аренды (без мутации, для selector-ов) */
      // P0-2: expiry по серверному времени
      hasRentalRO: (key: RentalKey) => {
        const state = get()
        const expires = state.rentals[key]
        if (!expires) return false
        if (serverTimeNow() > expires) return false
        return true
      },
      /** Mutingating проверка аренды — очищает истёкшую (для render-фазы) */
      // P0-2: expiry по серверному времени
      hasRental: (key: RentalKey) => {
        const state = get()
        const expires = state.rentals[key]
        if (!expires) return false
        if (serverTimeNow() > expires) {
          set((state) => ({ rentals: { ...state.rentals, [key]: null } }))
          return false
        }
        return true
      },

      // ── P1-5: единый read-only доступ к 3D-тексту ──
      // Подписка ИЛИ аренда text3d не истекла (по серверному времени).
      // Без мутаций — безопасен для render-фазы и selector-ов.
      // Единственный источник истины для App.tsx (×2), LeftPanel и Toolbar.
      canUseText3dRO: () => {
        const state = get()
        if (state.activeSubscription) {
          if (!state.subscriptionExpiresAt || serverTimeNow() <= state.subscriptionExpiresAt) {
            return true
          }
        }
        const expires = state.rentals.text3d
        if (expires !== null && serverTimeNow() <= expires) return true
        return false
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
      // EC10: нет дневного лимита — коммитим при каждом save/export
      commitQuests: async () => {
        const state = get()
        const quests = state.todayQuests

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
            todayQuestsCompleted: [...new Set([...state.todayQuestsCompleted, ...newCompleted])],
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
      // EC4: target-проверка — не помечать квесты с target > objectCount
      completeEventQuest: (trigger: QuestTrigger, objectCount?: number) => {
        const state = get()
        const quests = state.todayQuests
        const updated = quests.map((q) => {
          if (q.completed || q.trigger !== trigger) return q
          // EC4: проверим target для экспорт-квестов
          if (trigger === 'export_stl' && objectCount !== undefined && objectCount < q.target) return q
          if (trigger === 'export_stl_large' && objectCount !== undefined && objectCount < q.target) return q
          // Событийный квест выполнен при наступлении события
          return { ...q, completed: true, progress: q.target, _justCompleted: true }
        })
        // Только обновляем прогресс — токены начисляются через commitQuests()
        set({ todayQuests: updated })
        void get().syncToCloud()
      },

      // ── P1-1: проверка смены суток по серверному времени ──
      // Переиспользуется из initDailyQuests (старт), visibilitychange/focus
      // (возврат на вкладку) и setInterval (страховка ~60с) — так дневные
      // лимиты восстанавливаются даже если страница открыта больше суток.
      refreshDayRollover: async () => {
        const state = get()

        // Первый запуск ещё не было — просто фиксируем дату сброса
        if (state.lastQuestResetDate === null) {
          const { getServerTime } = await import('../platform/server-time')
          const serverTime = await getServerTime()
          set({ lastQuestResetDate: serverTime })
          return
        }

        const dayPassed = await isDayPassed(state.lastQuestResetDate)
        if (!dayPassed) return // день не сменился — ничего не делаем

        const { getServerTime } = await import('../platform/server-time')
        const serverTime = await getServerTime()
        set({
          todayQuests: generateDailyQuestsV2(),
          todayQuestsCompleted: [],
          todayAdsWatched: 0,
          todayActions: 0,
          todayCashbacks: 0,
          todayExportHashes: [], // P0-1: новый день — новый список хэшей кэшбэка
          questTriggers: {} as Record<QuestTrigger, number>,
          lastQuestResetDate: serverTime,
        })
        console.log('[Economy] New day detected — quests and counters reset')
        void get().syncToCloud()
      },

      // ── Инициализация квестов на новый день (§5 серверное время) ──
      // E7: день определяется по lastQuestResetDate (НЕ по lastDailyBonus —
      // иначе у игрока, не берущего бонус, квесты пересоздавались бы при
      // каждом запуске и прогресс терялся между сессиями)
      // P1-1: логика сброса вынесена в refreshDayRollover()
      initDailyQuests: async () => {
        const state = get()

        if (state.todayQuests.length === 0) {
          // Первый запуск — генерируем квесты
          const { getServerTime } = await import('../platform/server-time')
          const serverTime = await getServerTime()
          set({
            todayQuests: generateDailyQuestsV2(),
            todayQuestsCompleted: [],
            todayAdsWatched: 0,
            todayActions: 0,
            todayCashbacks: 0,
            todayExportHashes: [], // P0-1: новый день — новый список хэшей кэшбэка
            questTriggers: {} as Record<QuestTrigger, number>,
            lastQuestResetDate: serverTime,
          })
          return
        }

        // Квесты уже есть — проверяем смену суток
        await get().refreshDayRollover()
      },

      // ── Оценка квестов V2 по состоянию проекта ──
      evaluateQuests: (objects: Record<string, SceneObject>, operations: TinkerCraftOperation[]) => {
        const state = get()
        const quests = state.todayQuests

        // Считаем состояния проекта
        // P1-2: единый подсчёт объектов — та же функция, что в exportStl/scanForCashback
        const objectCount = countSceneObjects(objects)
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

        // Y3.5: CSG с детьми — считаем CSG-объекты у которых >= 3 детей.
        // P1-9: учитываются ВСЕ булевы операции (union/subtract/intersect):
        // в истории документа любая CSG-операция записывается как 'group' с
        // treeOperation (document-store.csgBoolean → GroupOperation), поэтому
        // подсчёт по всем 'group'-операциям покрывает все три типа булевых.
        // «Дети» = суммарное число операндов (листьев) поддерева CSG:
        // (A∪B)∩C даёт 3 листа → csg_complex засчитывается.
        // Источник — operations[], т.к. он переживает undo/redo и загрузку
        // проекта (SceneObject.children теряется при rebuildFromHistory).
        const csgOperandTree = new Map<string, string[]>()
        for (const op of operations) {
          if (op.type === 'group' && op.resultId && op.ids && op.ids.length >= 2) {
            csgOperandTree.set(op.resultId, [...op.ids])
          }
        }
        // Дополняем из SceneObject.children (живая сцена, без undo/redo)
        for (const obj of Object.values(objects)) {
          if (obj.shapeType === 'csg' && obj.children && obj.children.length >= 2) {
            csgOperandTree.set(obj.id, [...obj.children])
          }
        }

        const leavesMemo = new Map<string, number>()
        const countOperandLeaves = (id: string, stack: Set<string>): number => {
          const cached = leavesMemo.get(id)
          if (cached !== undefined) return cached
          if (stack.has(id)) return 1 // защита от циклов
          const kids = csgOperandTree.get(id)
          if (!kids || kids.length === 0) return 1 // лист (примитив/baked) или паста-CSG
          stack.add(id)
          const total = kids.reduce((acc, kid) => acc + countOperandLeaves(kid, stack), 0)
          stack.delete(id)
          leavesMemo.set(id, total)
          return total
        }

        for (const csgId of csgOperandTree.keys()) {
          if (countOperandLeaves(csgId, new Set<string>()) >= 3) csgWithChildren++
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
      // P0-5: облачные данные проходят санитизацию (не доверяем cloud больше
      // локального). lastSavedData восстанавливается и пересчитывается (P0-4).
      loadFromCloud: async () => {
        const platform = getPlatform()
        if (!platform) return

        try {
          const raw = await platform.loadData()
          const sanitized = sanitizeEconomyData(raw)
          if (sanitized) {
            set({
              tokens: sanitized.tokens ?? get().tokens,
              lastDailyBonus: sanitized.lastDailyBonus !== undefined ? sanitized.lastDailyBonus : get().lastDailyBonus,
              totalModelsCreated: sanitized.totalModelsCreated ?? get().totalModelsCreated,
              activeSubscription: sanitized.activeSubscription !== undefined ? sanitized.activeSubscription : get().activeSubscription,
              subscriptionExpiresAt: sanitized.subscriptionExpiresAt !== undefined ? sanitized.subscriptionExpiresAt : get().subscriptionExpiresAt,
              rentals: sanitized.rentals ?? get().rentals,
              todayQuests: sanitized.todayQuests ?? get().todayQuests,
              todayQuestsCompleted: sanitized.todayQuestsCompleted ?? get().todayQuestsCompleted,
              todayAdsWatched: sanitized.todayAdsWatched ?? get().todayAdsWatched,
              todayActions: sanitized.todayActions ?? get().todayActions,
              todayCashbacks: sanitized.todayCashbacks ?? get().todayCashbacks,
              todayExportHashes: sanitized.todayExportHashes ?? get().todayExportHashes,
              questTriggers: sanitized.questTriggers ?? get().questTriggers,
              lastExportHash: sanitized.lastExportHash !== undefined ? sanitized.lastExportHash : get().lastExportHash,
              lastQuestResetDate: sanitized.lastQuestResetDate !== undefined ? sanitized.lastQuestResetDate : get().lastQuestResetDate,
              // P2-3: флаг онбординга из облака
              onboardingDone: sanitized.onboardingDone === true || get().onboardingDone,
              // P0-4: восстанавливаем lastSavedData и пересчитываем hash
              lastSavedData: computeSavedDataHash(get()),
              pendingSync: false,
              syncTailPending: false,
            })
          }
        } catch (error) {
          console.error('[Economy] Load from cloud failed:', error)
        }
      },

      // P0-3: debounce с «хвостом». При повторном вызове во время активной
      // синхронизации данные НЕ теряются — ставится флаг syncTailPending, и
      // после завершения первой синхронизации выполняется ещё одна (с актуальным
      // состоянием). pendingSync сбрасывается только по факту успеха/неудачи.
      syncToCloud: async () => {
        // P0-3: если синхронизация уже выполняется — помечаем «грязный» хвост
        if (get().pendingSync) {
          set({ syncTailPending: true })
          return
        }
        set({ pendingSync: true, syncTailPending: false })

        const platform = getPlatform()
        if (!platform) {
          set({ pendingSync: false, syncTailPending: false })
          return
        }

        const runSync = async (): Promise<void> => {
          // P0-5: данные проходят санитизацию перед отправкой
          const currentData = sanitizeEconomyData(collectSyncData(get()))
          const dataHash = currentData ? computeSavedDataHash(get()) : ''

          // Не сохраняем, если данные не изменились с последней синхронизации
          if (get().lastSavedData === dataHash) {
            set({ pendingSync: false })
            return
          }

          try {
            await platform.saveData(currentData ?? {})
            set({ lastSavedData: dataHash, pendingSync: false })
          } catch (error) {
            console.error('[Economy] Sync to cloud failed:', error)
            set({ pendingSync: false })
          }
        }

        await runSync()

        // P0-3: «хвост» — если во время синхронизации пришли новые изменения,
        // повторяем с актуальным состоянием (pendingSync был сброшен выше)
        if (get().syncTailPending && !get().pendingSync) {
          set({ syncTailPending: false })
          await runSync()
        }
      },

      setBannerVisible: (visible: boolean) => {
        set({ bannerVisible: visible })
      },
    }),
    {
      name: 'tinkercraft-economy',
      version: 2,
      // P0-5: hydrate-merge с санитизацией — правка localStorage в DevTools
      // не даёт неограниченных токенов (clamp [0, MAX_TOKENS], валидация структуры).
      merge: (persisted, current) => {
        if (!persisted) return current
        // persisted — десериализованные данные из localStorage (unknown)
        const sanitized = sanitizeEconomyData(persisted)
        if (!sanitized) return current
        return {
          ...current,
          ...sanitized,
          // Состояние синхронизации/UI не восстанавливаем из storage
          pendingSync: false,
          syncTailPending: false,
          bannerVisible: false,
        }
      },
      // P0-4: lastSavedData в partialize — после перезагрузки не перезаписываем
      // облако более старыми данными (lastSavedData обновляется при загрузке).
      partialize: (state) => ({
        tokens: state.tokens,
        lastDailyBonus: state.lastDailyBonus,
        totalModelsCreated: state.totalModelsCreated,
        activeSubscription: state.activeSubscription,
        subscriptionExpiresAt: state.subscriptionExpiresAt,
        rentals: state.rentals,
        todayQuests: state.todayQuests,
        todayQuestsCompleted: state.todayQuestsCompleted,
        // Daily-счётчики — кэшируем в localStorage
        todayAdsWatched: state.todayAdsWatched,
        todayActions: state.todayActions,
        todayCashbacks: state.todayCashbacks,
        todayExportHashes: state.todayExportHashes, // P0-1: анти-фарм за день
        questTriggers: state.questTriggers,
        lastExportHash: state.lastExportHash, // E6
        lastQuestResetDate: state.lastQuestResetDate, // E7
        lastSavedData: state.lastSavedData, // P0-4
        onboardingDone: state.onboardingDone, // P2-3: онбординг персистится единообразно
      }),
    }
  )
)
