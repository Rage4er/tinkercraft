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
  // UB3-1 (ECONOMY.md v2.5): бюджет ПОКАЗОВ, лимит ОПЕРАЦИЙ и число оплаченных
  // операций для каждого вида rewarded-рекламы (import = серия из 2 роликов).
  adShowsLimit,
  adOperationsLimit,
  adPaidOperations,
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

/**
 * U1/U9/U12: вид rewarded-рекламы. Каждый вид имеет СОБСТВЕННЫЙ кулдаун 5 мин
 * и СОБСТВЕННЫЙ дневной лимит ≤3 (§2 ECONOMY.md v2.1).
 * - `tokens` — реклама за токены (+50, кнопка/HUD);
 * - `import` — серия из 2 роликов ЗА ИМПОРТ STL (НЕ начисляет токены);
 * - `export` — 1 ролик ЗА ЭКСПОРТ STL (НЕ начисляет токены);
 * - `banner` — 1 ролик за скрытие баннера (аренда disableBanner).
 *
 * U12 (регрессии P1/P2): экспорт и импорт имеют ОТДЕЛЬНЫЕ виды — просмотр
 * рекламы за токены в HUD не влияет на счётчики/кулдауны оплаты экспорта/
 * импорта и наоборот. Оплата экспорта/импорта рекламой НЕ начисляет токены.
 */
export type AdRewardKind = 'tokens' | 'import' | 'export' | 'banner'

/** Состояние одного вида наградной рекламы */
export interface AdRewardState {
  /** Время последнего показа (серверное) — для кд 5 мин */
  lastTimestamp: number | null
  /** Просмотров сегодня (лимит ≤3/день на вид) */
  countToday: number
}

/** Все виды наградной рекламы (порядок фиксирован) */
export const AD_REWARD_KINDS: AdRewardKind[] = ['tokens', 'import', 'export', 'banner']

/** Пустое состояние вида рекламы */
export function emptyAdReward(): AdRewardState {
  return { lastTimestamp: null, countToday: 0 }
}

/** Начальное per-reward состояние: все виды сброшены */
export function emptyAdRewards(): Record<AdRewardKind, AdRewardState> {
  return {
    tokens: emptyAdReward(),
    import: emptyAdReward(),
    export: emptyAdReward(),
    banner: emptyAdReward(),
  }
}

/**
 * Отметить успешный показ рекламы вида `kind`:
 * счётчик +1 и кулдаун = serverTime (серверное время, §5).
 */
function markAdWatched(
  rewards: Record<AdRewardKind, AdRewardState>,
  kind: AdRewardKind,
  serverTime: number
): Record<AdRewardKind, AdRewardState> {
  const cur = rewards[kind] ?? emptyAdReward()
  return {
    ...rewards,
    [kind]: { lastTimestamp: serverTime, countToday: cur.countToday + 1 },
  }
}

/**
 * Сбросить ДНЕВНЫЕ счётчики всех видов рекламы (смена суток, §5).
 * Кулдауны (lastTimestamp) НЕ сбрасываются — как было со старым
 * lastAdTimestamp: перезапуск/новый день не даёт мгновенного показа.
 */
function resetAdRewardsCounters(
  rewards: Record<AdRewardKind, AdRewardState>
): Record<AdRewardKind, AdRewardState> {
  return {
    tokens: { ...(rewards.tokens ?? emptyAdReward()), countToday: 0 },
    import: { ...(rewards.import ?? emptyAdReward()), countToday: 0 },
    export: { ...(rewards.export ?? emptyAdReward()), countToday: 0 },
    banner: { ...(rewards.banner ?? emptyAdReward()), countToday: 0 },
  }
}

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
}

/** Состояние экономики */
interface EconomyState {
  // ── Основные данные ──
  tokens: number
  lastDailyBonus: number | null

  // ── Подписки ──
  activeSubscription: SubscriptionKey | null
  subscriptionExpiresAt: number | null

  // ── Аренда (24ч) ──
  rentals: Record<RentalKey, number | null> // timestamp когда истекает

  // ── Лимиты за день ──
  /**
   * U1/U9: per-reward состояние rewarded-рекламы.
   * Каждый вид (tokens/import/banner) — свой кулдаун 5 мин и свой дневной
   * счётчик ≤3 (§2 ECONOMY.md v2.1). Заменяет единые todayAdsWatched/
   * lastAdTimestamp (U1/U9 из docs/USER_FEEDBACK_ECONOMY.md).
   */
  adRewards: Record<AdRewardKind, AdRewardState>
  todayActions: number
  lastActionTimestamp: number | null
  todayCashbacks: number
  /** P0-1: хэши моделей, за которые уже начислен кэшбэк сегодня (анти-фарм) */
  todayExportHashes: string[]
  todayQuestsCompleted: QuestDifficulty[]

  // ── Квесты ──
  todayQuests: QuestV2[]
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
  /** UB3-3: debug-хук — довести баланс до target (не уменьшает). Только из debug-mode. */
  grantDebugTokens(target: number): boolean
  /** P2-3: отметить онбординг завершённым (persist + облако) */
  completeOnboarding(): void
  /** E6: зафиксировать хэш экспортированной модели (через set, с persist) */
  setExportHash(hash: string): void

  // ── Доход ──
  claimDailyBonus(): Promise<boolean>
  watchAdForTokens(): Promise<boolean>
  /**
   * U12: 1 rewarded-ролик ЗА ЭКСПОРТ STL (вид `export`).
   * НЕ начисляет токены — оплачивает экспорт (после успеха вызывается onExport).
   */
  watchAdForExport(): Promise<boolean>
  /**
   * EC2/U12: N реклам подряд для импорта (без кулдауна между показами, НЕ начисляет токены).
   * UB2-2: onProgress — прогресс серии (после каждого успешного показа),
   * чтобы модалка импорта показывала живой «1/2» вместо стоящего «0/2».
   */
  watchAdsForImport(count: number, onProgress?: (watched: number, total: number) => void): Promise<boolean>
  watchAdForBanner(): Promise<{ ok: boolean }>

  // ── U1/U9: per-reward геттеры для UI (кулдаун/лимит каждого вида) ──
  /**
   * Оставшееся время кулдауна (мс) для вида рекламы (0 — можно смотреть).
   * Синхронно, на основе кэша серверного времени (P1-8).
   */
  getAdCooldownRemaining(kind: AdRewardKind): number
  /** Осталось просмотров сегодня для вида (лимит ≤3/день на вид) */
  getAdRewardsLeftToday(kind: AdRewardKind): number
  /** Можно ли смотреть рекламу вида (не исчерпан лимит И нет кулдауна) */
  canWatchAdKind(kind: AdRewardKind): boolean
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
  /** B1: виден ли баннер-оффер (bannerVisible && нет подписки && нет аренды disableBanner) */
  shouldShowBannerRO(): boolean
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

/**
 * EC-R2: синхронная проверка «тот же календарный день» (та же логика, что
 * isDayPassed, но без await — для атомарной повторной проверки ВНУТРИ set()).
 * Двойной клик по кнопке бонуса: оба вызова проходят await isDayPassed() до
 * первого set → без этой проверки начислялось бы +100 вместо +50.
 */
function isSameServerDay(a: number, b: number): boolean {
  const da = new Date(a)
  const db = new Date(b)
  return da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
}

/**
 * EC-R2: in-flight guard для асинхронных действий начисления.
 * Повторный вызов во время выполнения первого НЕ запускает вторую копию —
 * оба вызова получают результат ОДНОГО выполнения (двойной клик = один бонус,
 * один показ рекламы). Guard модульный: живёт вне store (не персистится).
 */
function withInFlightGuard<T>(
  ref: { current: Promise<T> | null },
  run: () => Promise<T>
): Promise<T> {
  if (ref.current) return ref.current
  const p = run().finally(() => { ref.current = null })
  ref.current = p
  return p
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
  | 'activeSubscription'
  | 'subscriptionExpiresAt'
  | 'rentals'
  | 'todayQuests'
  | 'todayQuestsCompleted'
  | 'adRewards'
  | 'todayActions'
  | 'todayCashbacks'
  | 'todayExportHashes'
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
 * U1/U9: санитизация per-reward состояний рекламы.
 * - Каждый вид валидируется отдельно: countToday clamp к лимиту 3/день,
 *   lastTimestamp — валидный timestamp или null.
 * - МИГРАЦИЯ старых полей (v2.0 → v2.1): если в данных есть единые
 *   lastAdTimestamp / todayAdsWatched и НЕТ новой структуры adRewards,
 *   значения переносятся в вид `tokens` (см. комментарий в sanitizeEconomyData).
 */
function sanitizeAdRewards(
  rawAdRewards: unknown,
  rawRoot: Record<string, unknown>
): Record<AdRewardKind, AdRewardState> {
  const base = emptyAdRewards()

  // Миграция старых полей → вид tokens (только если новой структуры ещё нет)
  const hasNewStructure = isPlainObject(rawAdRewards)
  if (!hasNewStructure) {
    const legacyCount = toClampedNumber(rawRoot.todayAdsWatched, 0, 0, LIMITS.adsPerDay)
    const legacyTs = toNullableTimestamp(rawRoot.lastAdTimestamp)
    if (legacyCount > 0 || legacyTs !== null) {
      base.tokens = { lastTimestamp: legacyTs, countToday: legacyCount }
    }
  }

  if (!hasNewStructure) return base

  for (const kind of AD_REWARD_KINDS) {
    const entry = (rawAdRewards as Record<string, unknown>)[kind]
    if (!isPlainObject(entry)) continue // отсутствующий вид → пустой
    base[kind] = {
      lastTimestamp: toNullableTimestamp(entry.lastTimestamp),
      // UB3-1: clamp к бюджету ПОКАЗОВ вида (import допускает 6)
      countToday: toClampedNumber(entry.countToday, 0, 0, adShowsLimit(kind)),
    }
  }
  return base
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
  // U1/U9: per-reward счётчики рекламы. Старые единые поля lastAdTimestamp /
  // todayAdsWatched (до v2.1) мигрируются в вид `tokens`: это единственный
  // вид, чьи старые показания можно однозначно интерпретировать (кнопка/HUD/
  // экспорт — все были «реклама за токены»). Импорт и баннер получают пустые
  // состояния — их счётчики начнутся с нуля (потеря ≤3 показов некритична,
  // а риск неверно приписать просмотры импорта/баннера к токенам выше).
  out.adRewards = sanitizeAdRewards(raw.adRewards, raw)
  out.todayActions = toClampedNumber(raw.todayActions, 0, 0, LIMITS.actionsPerDay)
  out.todayCashbacks = toClampedNumber(raw.todayCashbacks, 0, 0, LIMITS.cashbackPerDay)

  // P0-1: список хэшей за день — только строки
  out.todayExportHashes = Array.isArray(raw.todayExportHashes)
    ? raw.todayExportHashes.filter((h): h is string => typeof h === 'string')
    : []

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
    activeSubscription: state.activeSubscription,
    subscriptionExpiresAt: state.subscriptionExpiresAt,
    rentals: state.rentals,
    todayQuests: state.todayQuests,
    todayQuestsCompleted: state.todayQuestsCompleted,
    // U1/U9: per-reward счётчики/кулдауны рекламы синхронизируются в облако
    adRewards: state.adRewards,
    todayActions: state.todayActions,
    todayCashbacks: state.todayCashbacks,
    todayExportHashes: state.todayExportHashes, // P0-1: защита от очистки localStorage
    lastExportHash: state.lastExportHash,
    lastQuestResetDate: state.lastQuestResetDate,
    onboardingDone: state.onboardingDone, // P2-3: синхронизируем флаг онбординга
  }
}

/**
 * Хэш текущего состояния для dedupe setData (P0-4).
 * EC-R4/EC-R5: КАНОНИЧЕСКИЙ хэш — ключи объектов отсортированы на каждом
 * уровне (sortDeep). Это делает хэш сравнимым между:
 *  - локальным состоянием (computeSavedDataHash),
 *  - облачными данными (canonicalDataHash санитизированного облака) —
 *    порядок ключей в JSON из облака не совпадает с порядком collectSyncData.
 * ⚠️ Одноразовая миграция: lastSavedData в старом (несортированном) формате
 * не совпадёт с новым — первый syncToCloud после обновления перезапишет облако
 * теми же данными (один избыточный setData, без потери данных).
 */
function computeSavedDataHash(state: EconomyState): string {
  return JSON.stringify(sortDeep(collectSyncData(state)))
}

/** EC-R5: канонический хэш произвольных (санитизированных) данных облака */
function canonicalDataHash(data: Record<string, unknown>): string {
  return JSON.stringify(sortDeep(data))
}

/** EC-R2: in-flight guard бонуса — двойной клик = одно начисление */
const dailyBonusInFlight: { current: Promise<boolean> | null } = { current: null }
/** EC-R2: in-flight guard рекламы за токены — двойной клик = один показ */
const adTokensInFlight: { current: Promise<boolean> | null } = { current: null }

// ─── Store ──────────────────────────────────────────────────────────

export const useEconomyStore = create<EconomyState>()(
  persist(
    (set, get) => ({
      // ── Начальное состояние ──
      tokens: 0,
      lastDailyBonus: null,
      activeSubscription: null,
      subscriptionExpiresAt: null,
      rentals: {
        text3d: null,
        extendedPalette: null,
        disableBanner: null,
      },
      // U1/U9: per-reward реклама — свой кулдаун и счётчик у каждого вида
      adRewards: emptyAdRewards(),
      todayActions: 0,
      lastActionTimestamp: null,
      todayCashbacks: 0,
      todayExportHashes: [] as string[], // P0-1: анти-фарм кэшбэка за день
      todayQuestsCompleted: [],
      todayQuests: [],
      lastExportHash: null,
      lastQuestResetDate: null, // E7: дата последнего сброса квестов
      onboardingDone: false, // P2-3: онбординг не показан по умолчанию
      lastSavedData: '' as string,
      pendingSync: false, // Y3.16: debounce для syncToCloud
      syncTailPending: false, // P0-3: «грязный» флаг для повторной синхронизации
      // B1: баннер-оффер скрытия виден ПО УМОЛЧАНИЮ (§6.3 ECONOMY.md) —
      // пока не куплена аренда disableBanner и нет подписки. При старте
      // App.tsx (bootstrap EC1) дополнительно сверяет с подпиской/арендой.
      bannerVisible: true,

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

      // UB3-3: debug-выдача — «доплатить до target», никогда не уменьшает и
      // не превышает MAX_TOKENS. Вызывается ТОЛЬКО из platform/debug-mode.ts
      // (детекция debug-mode/debug-tokens в URL), в релизе без параметров
      // недостижима. В облако уходит как обычный баланс (syncToCloud) — для
      // draft-прогодов это осознанно: тесты покупок должны переживать reload.
      grantDebugTokens: (target) => {
        const cur = get().tokens
        const next = Math.min(Math.max(cur, Math.floor(target)), MAX_TOKENS)
        if (next <= cur) return false
        set({ tokens: next })
        console.log(`[Economy][DEBUG] grantDebugTokens: ${cur} → ${next}`)
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
      // EC-R2: двойной клик не даёт +100 — in-flight guard + атомарная
      // повторная проверка «тот же день» ВНУТРИ set().
      claimDailyBonus: async () => {
        return withInFlightGuard(dailyBonusInFlight, async () => {
          const state = get()
          const passed = await isDayPassed(state.lastDailyBonus)
          if (!passed) {
            console.warn('[Economy] Daily bonus already claimed today')
            return false
          }

          // Сохраняем серверное время
          const { getServerTime } = await import('../platform/server-time')
          const serverTime = await getServerTime()

          // EC-R2: атомарная повторная проверка — если параллельный вызов
          // уже начислил бонус (тот же серверный день), второй set — no-op
          const tokensBefore = get().tokens
          set((st) => {
            if (st.lastDailyBonus !== null && isSameServerDay(st.lastDailyBonus, serverTime)) {
              return {}
            }
            return {
              tokens: st.tokens + EARNINGS_DAILY_BONUS,
              lastDailyBonus: serverTime,
            }
          })
          const applied = get().tokens === tokensBefore + EARNINGS_DAILY_BONUS
          if (!applied) {
            console.warn('[Economy] Daily bonus already claimed today (concurrent)')
            return false
          }
          await get().syncToCloud()
          console.log(`[Economy] Daily bonus claimed: +${EARNINGS_DAILY_BONUS}`)
          return true
        })
      },

      // ── Реклама за токены: +50, ≤ 3/день на вид, кулдаун 5 мин на вид (§5) ──
      // U1/U9: свой кулдаун/счётчик у вида `tokens` — не блокирует импорт/баннер.
      // EC-R2: двойной клик = один показ — in-flight guard + атомарная
      // повторная проверка дневного лимита ВНУТРИ set().
      watchAdForTokens: async () => {
        return withInFlightGuard(adTokensInFlight, async () => {
          const state = get()
          const kind: AdRewardKind = 'tokens'
          const ad = state.adRewards[kind] ?? emptyAdReward()

          // UB3-1: бюджет показов вида (единый источник AD_SHOWS_PER_DAY; для
          // tokens = 3 — поведение не меняется)
          if (isLimitReached(ad.countToday, adShowsLimit(kind))) {
            console.warn('[Economy] Ad limit reached today (tokens)')
            return false
          }

          const passed = await isCooldownPassed(ad.lastTimestamp, AD_COOLDOWN_MS)
          if (!passed) {
            console.warn('[Economy] Ad cooldown not passed (tokens)')
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

          // EC-R2: атомарная повторная проверка лимита — параллельный вызов
          // не может превысить дневной лимит вида tokens
          const tokensBefore = get().tokens
          set((st) => {
            const cur = st.adRewards[kind] ?? emptyAdReward()
            if (isLimitReached(cur.countToday, adShowsLimit(kind))) return {}
            return {
              tokens: st.tokens + EARNINGS_AD_REWARDED,
              adRewards: markAdWatched(st.adRewards, kind, serverTime),
            }
          })
          const applied = get().tokens === tokensBefore + EARNINGS_AD_REWARDED
          if (!applied) {
            console.warn('[Economy] Ad limit reached today (tokens, concurrent)')
            return false
          }
          await get().syncToCloud()
          console.log(`[Economy] Ad rewarded (tokens): +${EARNINGS_AD_REWARDED}`)
          return true
        })
      },

      // ── U12: реклама ЗА ЭКСПОРТ STL (вид `export`) ──
      // 1 ролик → экспорт оплачен. Токены НЕ начисляются (в отличие от
      // watchAdForTokens — там +50 за просмотр). Свой кулдаун 5 мин и свой
      // дневной лимит ≤3 (вид export). Не влияет на tokens/import/banner.
      watchAdForExport: async (): Promise<boolean> => {
        const state = get()
        const kind: AdRewardKind = 'export'
        const ad = state.adRewards[kind] ?? emptyAdReward()

        if (isLimitReached(ad.countToday, adShowsLimit(kind))) {
          console.warn('[Economy] Ad limit reached for export')
          return false
        }

        const passed = await isCooldownPassed(ad.lastTimestamp, AD_COOLDOWN_MS)
        if (!passed) {
          console.warn('[Economy] Ad cooldown not passed for export')
          return false
        }

        const platform = getPlatform()
        if (!platform) {
          console.warn('[Economy] No platform for export ad')
          return false
        }

        const rewarded = await platform.showRewardedVideo()
        if (!rewarded) return false

        // Сохраняем серверное время
        const { getServerTime } = await import('../platform/server-time')
        const serverTime = await getServerTime()

        // U12: НЕ начисляем токены — реклама ОПЛАЧИВАЕТ экспорт (оплата, не доход)
        set((st) => ({
          adRewards: markAdWatched(st.adRewards, kind, serverTime),
        }))
        await get().syncToCloud()
        console.log('[Economy] Export ad watched — export paid by ad')
        return true
      },

      // ── EC2/U12: N рекламы подряд для импорта (§3.1: 2 просмотра) ──
      // U1/U9: серия использует СОБСТВЕННЫЙ вид `import` — кулдаун 5 мин
      // проверяется один раз в начале серии, между показами паузы НЕТ.
      // U12 (P2): серия ОПЛАЧИВАЕТ импорт — токены НЕ начисляются ни за один
      // ролик (раньше начислялись +50 за каждый — регрессия P2). Счётчик вида
      // import считает ПОКАЗЫ (серия 2 ролика = +2).
      // UB3-1 (ECONOMY.md v2.5): дневной контракт импорта — «3 импорта/сутки,
      // до 6 показов». Серия может начаться, только если (а) оплаченных
      // операций (floor(shows/2)) ещё меньше 3 и (б) остатка показов хватает на
      // ВСЮ серию (countToday + count <= 6) — иначе ролик «сгорел бы» на
      // середине. Частичный просмотр (отказ на 2-й) НЕ засчитывает операцию:
      // импорт не выполняется, токены не начисляются.
      watchAdsForImport: async (count: number, onProgress?: (watched: number, total: number) => void): Promise<boolean> => {
        const state = get()
        const kind: AdRewardKind = 'import'
        const ad = state.adRewards[kind] ?? emptyAdReward()
        const showsBudget = adShowsLimit(kind) // 6

        // UB3-1: лимит ОПЕРАЦИЙ (3 импорта/день) + бюджет показов на всю серию
        if (isLimitReached(adPaidOperations(ad.countToday, kind), adOperationsLimit(kind))) {
          console.warn('[Economy] Import operations limit reached today')
          return false
        }
        if (ad.countToday + count > showsBudget) {
          console.warn('[Economy] Import ad shows budget exhausted')
          return false
        }

        const passed = await isCooldownPassed(ad.lastTimestamp, AD_COOLDOWN_MS)
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
          // UB3-1: бюджет показов вида import (6/день) не даём превысить и в середине серии
          const cur = get().adRewards[kind] ?? emptyAdReward()
          if (isLimitReached(cur.countToday, showsBudget)) break
          const rewarded = await platform.showRewardedVideo()
          if (!rewarded) break
          watchedCount++
          // UB2-2: уведомляем UI о прогрессе серии (1/2, 2/2)
          onProgress?.(watchedCount, count)
          // Серверное время после каждого показа (P2-2: getServerTime напрямую)
          const serverTime = await getServerTime()
          // U12: только отмечаем показ — токены НЕ начисляются
          set((st) => ({
            adRewards: markAdWatched(st.adRewards, kind, serverTime),
          }))
        }

        // Ни один ролик не показан — операция не оплачена
        if (watchedCount === 0) return false

        void get().syncToCloud()
        console.log(`[Economy] Import ads watched: ${watchedCount}/${count} — import paid by ads (no tokens)`)
        // U12: true только если серия завершена полностью (импорт оплачен рекламой).
        return watchedCount >= count
      },

      // ── Реклама для баннера: 1 просмотр → скрыть баннер на 24ч (§3.2, §6.3) ──
      // U1/U9: баннер использует СОБСТВЕННЫЙ вид `banner` — свой кулдаун 5 мин
      // и свой лимит ≤3/день (в v2.0 был общий лимит/кулдаун со всей рекламой).
      // Токены за показ НЕ начисляются — это оплата аренды disableBanner
      // (§3.2: «Отключение баннера — 50 TC ИЛИ 1 просмотр»), а не заработок.
      watchAdForBanner: async () => {
        const state = get()
        const kind: AdRewardKind = 'banner'
        const ad = state.adRewards[kind] ?? emptyAdReward()

        // U1/U9: лимит вида banner (не общий для всех rewarded-показов)
        if (isLimitReached(ad.countToday, adShowsLimit(kind))) {
          console.warn('[Economy] Banner ad limit reached today')
          return { ok: false }
        }

        // U1/U9: кулдаун вида banner (не делится с токенами/импортом)
        const cooldownPassed = await isCooldownPassed(ad.lastTimestamp, AD_COOLDOWN_MS)
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

        set((st) => ({
          rentals: { ...st.rentals, disableBanner: serverTime + ONE_DAY_MS },
          adRewards: markAdWatched(st.adRewards, kind, serverTime),
          // P0-1/U5: баннер скрываем ЗДЕСЬ (единая точка) — компоненты не могут
          // забыть вызвать setBannerVisible(false) после успешной оплаты.
          bannerVisible: false,
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

      // ── U1/U9: per-reward геттеры для UI (кулдаун/лимит каждого вида) ──
      getAdCooldownRemaining: (kind: AdRewardKind) => {
        const ad = get().adRewards[kind] ?? emptyAdReward()
        if (!ad.lastTimestamp) return 0
        return Math.max(0, AD_COOLDOWN_MS - (serverTimeNow() - ad.lastTimestamp))
      },
      getAdRewardsLeftToday: (kind: AdRewardKind) => {
        const ad = get().adRewards[kind] ?? emptyAdReward()
        // UB3-1: остаток ПОКАЗОВ вида (import — бюджет 6, остальные 3)
        return Math.max(0, adShowsLimit(kind) - ad.countToday)
      },
      canWatchAdKind: (kind: AdRewardKind) => {
        const ad = get().adRewards[kind] ?? emptyAdReward()
        // UB3-1: для импорта нужна ещё и проверка «хватает ли показов на серию»
        // (см. watchAdsForImport) — здесь только базовый бюджет вида.
        return !isLimitReached(ad.countToday, adShowsLimit(kind))
          && get().getAdCooldownRemaining(kind) === 0
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
      /** Mutating проверка подписки — очищает истёкшую (для render-фазы) */
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

        // EC-R3: атомарная повторная проверка баланса ВНУТРИ updater — между
        // внешней проверкой и set() есть await, баланс мог упасть (отрицательные
        // токены невозможны даже в гонке)
        let applied = false
        set((st) => {
          if (st.tokens < config.tokens) return {}
          applied = true
          return {
            tokens: st.tokens - config.tokens,
            activeSubscription: type,
            subscriptionExpiresAt: serverTime + config.days * ONE_DAY_MS,
          }
        })
        if (!applied) {
          return { ok: false, code: 'not_enough' }
        }
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
      /** Mutating проверка аренды — очищает истёкшую (для render-фазы) */
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

      // ── B1: виден ли баннер-оффер (§6.3) ──
      // bannerVisible && нет подписки && нет аренды disableBanner (по серверному
      // времени). Без мутаций — безопасен для render-фазы и selector-ов.
      // Единый источник истины для EconomyBanner и App.tsx bootstrap EC1.
      shouldShowBannerRO: () => {
        const state = get()
        if (!state.bannerVisible) return false
        if (state.activeSubscription) {
          if (!state.subscriptionExpiresAt || serverTimeNow() <= state.subscriptionExpiresAt) {
            return false
          }
        }
        const disableExpires = state.rentals.disableBanner
        if (disableExpires !== null && serverTimeNow() <= disableExpires) return false
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

        // EC-R3: атомарная повторная проверка баланса ВНУТРИ updater (см. buySubscription)
        let applied = false
        set((st) => {
          if (st.tokens < config) return {}
          applied = true
          return {
            tokens: st.tokens - config,
            rentals: { ...st.rentals, [key]: serverTime + ONE_DAY_MS },
            // P0-1/U5: при покупке disableBanner баннер скрывается атомарно в store.
            // Повторная покупка в другом компоненте (PropertiesPanel/EconomyBanner)
            // невозможна — hasRentalRO('disableBanner') уже true.
            bannerVisible: key === 'disableBanner' ? false : st.bannerVisible,
          }
        })
        if (!applied) {
          return { ok: false, code: 'not_enough' }
        }
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
          return { ...q, completed: true, progress: q.target }
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
        // P0-1/U5: если аренда disableBanner истекла (24ч прошли) — снова показываем
        // баннер-оффер (если нет подписки). Аналогично App.tsx bootstrap EC1.
        const cur = get()
        const showBannerAgain =
          !cur.hasActiveSubscriptionRO() &&
          !cur.hasRentalRO('disableBanner')
        set({
          todayQuests: generateDailyQuestsV2(),
          todayQuestsCompleted: [],
          // U1/U9: сбрасываем дневные счётчики ВСЕХ видов рекламы (кулдауны остаются)
          adRewards: resetAdRewardsCounters(get().adRewards),
          todayActions: 0,
          todayCashbacks: 0,
          todayExportHashes: [], // P0-1: новый день — новый список хэшей кэшбэка
          lastQuestResetDate: serverTime,
          // P0-1/U5: истёкшая аренда → баннер снова доступен для покупки
          bannerVisible: showBannerAgain,
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
            // U1/U9: все виды рекламы сбрасываются на новый день
            adRewards: resetAdRewardsCounters(get().adRewards),
            todayActions: 0,
            todayCashbacks: 0,
            todayExportHashes: [], // P0-1: новый день — новый список хэшей кэшбэка
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

        // C3: зеркала считаем по операциям history (type: 'mirror'), а НЕ по
        // scale < 0. Причина: mirrorObject в mirror-store.ts записывает
        // transform со scale = Math.abs(...) (строка «Scale всегда
        // положительный (abs), геометрия отражена через позиции/повороты
        // в дереве»), поэтому отрицательного scale у зеркальных объектов
        // НЕТ — проверка scale < 0 никогда не срабатывала, и квест
        // «count_mirrored» не засчитывался. Операция mirror хранит ids —
        // id созданных зеркальных копий; считаем по ТЕКУЩЕЙ сцене, чтобы
        // удаление зеркала/undo уменьшало счётчик.
        const mirrorCreatedIds = new Set<string>()
        for (const op of operations) {
          if (op.type === 'mirror' && op.ids && op.ids.length > 0) {
            for (const id of op.ids) mirrorCreatedIds.add(id)
          }
        }

        let coloredCount = 0
        for (const obj of Object.values(objects)) {
          shapeTypes.add(obj.shapeType)
          if (obj.color && obj.color !== '#808080') coloredCount++
          if (obj.shapeType === 'csg') csgCount++
          // Y3.7: исправлено 'text' → 'text3d'
          if (obj.shapeType === 'text3d') text3dCount++
          // C3/Y3.6: зеркало — объект создан mirror-операцией ИЛИ legacy scale < 0
          if (
            mirrorCreatedIds.has(obj.id) ||
            obj.transform.scaleX < 0 || obj.transform.scaleY < 0 || obj.transform.scaleZ < 0
          ) {
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
          }
        })

        // Обновляем прогресс квестов (без начисления токенов)
        // Токены начисляются только через commitQuests() при save/export
        set({ todayQuests: updatedQuests })
      },

      // ── Синхронизация ──
      // P0-5: облачные данные проходят санитизацию (не доверяем cloud больше
      // локального). lastSavedData пересчитывается ПОСЛЕ применения (P0-4/EC-R4).
      loadFromCloud: async () => {
        const platform = getPlatform()
        if (!platform) return

        try {
          const raw = await platform.loadData()
          const sanitized = sanitizeEconomyData(raw)
          if (sanitized) {
            // EC-R5: облако не новее нашей последней успешной синхронизации —
            // НЕ перезаписываем локальный прогресс облачным.
            //  - облако пустое (никогда не сохранялось, loadData() === {}) → keep local;
            //  - канонический хэш облака === lastSavedData (облако содержит ровно то,
            //    что мы последний раз успешно сохранили) → keep local: локальные
            //    несинхронизированные изменения (последний syncToCloud упал) терять нельзя.
            // Иначе (облако с другого устройства новее) — cloud wins, как раньше.
            // lastSavedData исключается из сравнения: это внутренний dedupe-флаг,
            // в облако он не отправляется (но может присутствовать в СТАРЫХ облаках).
            const { lastSavedData: _cloudLsd, ...cloudData } = sanitized
            const cloudHash = canonicalDataHash(cloudData)
            const cloudNeverWritten = isPlainObject(raw) && Object.keys(raw).length === 0
            const cloudIsOurLastSave = get().lastSavedData !== '' && cloudHash === get().lastSavedData
            if (cloudNeverWritten || cloudIsOurLastSave) {
              // EC-R4: lastSavedData пересчитывается от АКТУАЛЬНОГО состояния
              // (раньше считался до merge → первый sync всегда видел «изменения»)
              set({ lastSavedData: computeSavedDataHash(get()), pendingSync: false, syncTailPending: false })
              return
            }

            set({
              tokens: sanitized.tokens ?? get().tokens,
              lastDailyBonus: sanitized.lastDailyBonus !== undefined ? sanitized.lastDailyBonus : get().lastDailyBonus,
              activeSubscription: sanitized.activeSubscription !== undefined ? sanitized.activeSubscription : get().activeSubscription,
              subscriptionExpiresAt: sanitized.subscriptionExpiresAt !== undefined ? sanitized.subscriptionExpiresAt : get().subscriptionExpiresAt,
              rentals: sanitized.rentals ?? get().rentals,
              todayQuests: sanitized.todayQuests ?? get().todayQuests,
              todayQuestsCompleted: sanitized.todayQuestsCompleted ?? get().todayQuestsCompleted,
              // U1/U9: per-reward реклама из облака
              adRewards: sanitized.adRewards ?? get().adRewards,
              todayActions: sanitized.todayActions ?? get().todayActions,
              todayCashbacks: sanitized.todayCashbacks ?? get().todayCashbacks,
              todayExportHashes: sanitized.todayExportHashes ?? get().todayExportHashes,
              lastExportHash: sanitized.lastExportHash !== undefined ? sanitized.lastExportHash : get().lastExportHash,
              lastQuestResetDate: sanitized.lastQuestResetDate !== undefined ? sanitized.lastQuestResetDate : get().lastQuestResetDate,
              // P2-3: флаг онбординга из облака
              onboardingDone: sanitized.onboardingDone === true || get().onboardingDone,
              pendingSync: false,
              syncTailPending: false,
            })
            // EC-R4: hash ПОСЛЕ применения облачных полей — object literal выше
            // вычисляется до merge, поэтому computeSavedDataHash(get()) ВНУТРИ set()
            // хэшировал ДО-облачное состояние → избыточный setData за запуск.
            set({ lastSavedData: computeSavedDataHash(get()) })
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
          // EC-R5: lastSavedData — ВНУТРЕННИЙ dedupe-флаг, в облако не отправляется
          // (иначе canonical-хэш облака никогда не совпадает с lastSavedData)
          if (currentData) delete currentData.lastSavedData
          // EC-R5: hash = hash ФАКТИЧЕСКИ СОХРАНЁННЫХ данных (не состояния) —
          // гарантирует совпадение с canonicalDataHash при следующей загрузке
          const dataHash = currentData ? canonicalDataHash(currentData) : ''

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
      // U1/U9: v3 — per-reward реклама (adRewards вместо todayAdsWatched/lastAdTimestamp).
      // U12: v4 — добавлен вид `export` (оплата экспорта рекламой). Старые виды
      // tokens/import/banner сохраняются из v3 (санитизация не трогает их), вид
      // export отсутствует в старых данных → стартует с нуля. Миграция старых
      // единых полей (до v2.1) выполняется в sanitizeEconomyData/sanitizeAdRewards.
      version: 4,
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
          // B1: НЕ восстанавливаем bannerVisible из storage (UI-флаг, не данные).
          // По умолчанию — true: оффер виден, пока нет аренды disableBanner/подписки.
          // App.tsx bootstrap EC1 при необходимости скроет его.
          bannerVisible: true,
        }
      },
      // P0-4: lastSavedData в partialize — после перезагрузки не перезаписываем
      // облако более старыми данными (lastSavedData обновляется при загрузке).
      partialize: (state) => ({
        tokens: state.tokens,
        lastDailyBonus: state.lastDailyBonus,
        activeSubscription: state.activeSubscription,
        subscriptionExpiresAt: state.subscriptionExpiresAt,
        rentals: state.rentals,
        todayQuests: state.todayQuests,
        todayQuestsCompleted: state.todayQuestsCompleted,
        // Daily-счётчики — кэшируем в localStorage
        // U1/U9: per-reward реклама персистится целиком (кулдауны + счётчики)
        adRewards: state.adRewards,
        todayActions: state.todayActions,
        todayCashbacks: state.todayCashbacks,
        todayExportHashes: state.todayExportHashes, // P0-1: анти-фарм за день
        lastExportHash: state.lastExportHash, // E6
        lastQuestResetDate: state.lastQuestResetDate, // E7
        lastSavedData: state.lastSavedData, // P0-4
        onboardingDone: state.onboardingDone, // P2-3: онбординг персистится единообразно
      }),
    }
  )
)
