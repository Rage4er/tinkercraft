// src/store/economy-config.ts — Константы экономики по ECONOMY.md v2.0
// Версия: 2.0 · Дата: 28.08.2026
// Кэшбэк V2: формула коэффициентов, полная UI-спецификация

// ─── Тарифы ─────────────────────────────────────────────────────────

/** Стоимость разовых операций */
export const ECONOMY_COSTS = {
  /** Экспорт STL (1 файл) — 50 токенов ИЛИ 1 просмотр рекламы */
  exportSTL: 50,
  /** Импорт STL (1 файл) — 100 токенов ИЛИ 2 просмотра рекламы */
  importSTL: 100,
} as const

/** Аренда на 24 часа (с момента покупки) */
export const ECONOMY_RENTALS = {
  /** 3D-текст — 75 токенов, только токены */
  text3d: 75,
  /** Расширенная палитра — 75 токенов, только токены */
  extendedPalette: 75,
  /** Отключение баннера — 50 токенов, 1 просмотр рекламы */
  disableBanner: 50,
} as const

/** Подписки */
export const ECONOMY_SUBSCRIPTIONS = {
  weekly: { tokens: 700, days: 7 },
  monthly: { tokens: 2000, days: 30 },
} as const

// ─── Доход ──────────────────────────────────────────────────────────

/** Ежедневный бонус */
export const EARNINGS_DAILY_BONUS = 50

/** Просмотр рекламы */
export const EARNINGS_AD_REWARDED = 50

/** Ежедневные задания */
export const EARNINGS_QUESTS = {
  easy: 20,
  medium: 30,
  hard: 50,
} as const

/** Использование фигур/инструментов */
export const EARNINGS_ACTION = 1

/** Кэшбэк V2 — формула коэффициентов (§2.1 ECONOMY.md v2.0)
 *  Кэшбэк = min(25, 1 + Масштаб + РазнообразиеФигур + КолИнструментов + РазнообразиеИнструментов)
 */
export const EARNINGS_CASHBACK = {
  base: 1, // база за факт экспорта
  // Масштаб: +1 за 5 объектов (примитивы+baked, включая детей CSG), кап 6
  perObjectScale: 5,
  maxObjectsBonus: 6,
  // Разнообразие фигур: уникальные типы примитивов (0 если один), кап 6
  maxShapeTypesBonus: 6,
  // Кол-во инструментов: CSG-узлы + зеркала + перекраски + тексты, кап 6
  maxToolsCount: 6,
  // Разнообразие инструментов: категории булевы/зеркало/цвет/текст, кап 6
  maxToolCategories: 6,
  ceiling: 25,
} as const

// ─── Лимиты ─────────────────────────────────────────────────────────

/** Максимум токенов в день */
export const LIMITS = {
  /** Макс доход в день */
  maxPerDay: 405,
  /** Реалистичный доход в день */
  realisticPerDay: 240,

  /** Просмотры рекламы за токены в день */
  adsPerDay: 3,
  /** Кулдаун между рекламой (мс) */
  adCooldownMs: 5 * 60 * 1000,

  /** Использование фигур/инструментов в день */
  actionsPerDay: 30,
  /** Кулдаун между действиями (мс) */
  actionCooldownMs: 5 * 1000,

  /** Кэшбэк за экспорт в день */
  cashbackPerDay: 3,

  /** Ежедневный бонус — 1 раз в день */
  dailyBonusPerDay: 1,
} as const

// ─── Кулдауны ───────────────────────────────────────────────────────

/** Кулдаун между просмотрами рекламы (мс) */
export const AD_COOLDOWN_MS = LIMITS.adCooldownMs

/** Кулдаун между бонусами за действия (мс) */
export const ACTION_COOLDOWN_MS = LIMITS.actionCooldownMs

// ─── Утилиты ────────────────────────────────────────────────────────

const ONE_DAY_MS = 24 * 60 * 60 * 1000

/**
 * Проверить, прошёл ли день с момента (§5 ECONOMY.md v2.0)
 * Использует серверное время для защиты от накруток переводом часов.
 */
export async function isDayPassed(timestamp: number | null): Promise<boolean> {
  if (!timestamp) return true
  const last = new Date(timestamp)
  // Получаем серверное время
  const { getServerTime } = await import('../platform/server-time')
  const serverTime = await getServerTime()
  const now = new Date(serverTime)
  return (
    last.getFullYear() < now.getFullYear() ||
    last.getMonth() < now.getMonth() ||
    last.getDate() < now.getDate()
  )
}

/**
 * Проверить, прошёл ли кулдаун (мс) (§5 ECONOMY.md v2.0)
 * Использует серверное время для защиты от накруток.
 */
export async function isCooldownPassed(timestamp: number | null, ms: number): Promise<boolean> {
  if (!timestamp) return true
  const { getServerTime } = await import('../platform/server-time')
  const serverTime = await getServerTime()
  return serverTime - timestamp >= ms
}

/**
 * Рассчитать кэшбэк V2 по формуле коэффициентов (§2.1 ECONOMY.md v2.0)
 * Кэшбэк = min(25, 1 + Масштаб + РазнообразиеФигур + КолИнструментов + РазнообразиеИнструментов)
 *
 * @param scanResult — результат сканирования дерева документов (общий с квестами V2)
 */
export interface CashbackScanResult {
  /** Количество объектов (примитивы+baked, включая детей CSG) */
  objectCount: number
  /** Уникальные типы примитивов */
  uniqueShapeTypes: number
  /** CSG-узлы + зеркала + перекраски + тексты */
  toolsCount: number
  /** Категории инструментов: булевы/зеркало/цвет/текст */
  toolCategories: number
}

export function calculateCashbackV2(scan: CashbackScanResult): number {
  // Масштаб: +1 за 5 объектов, кап 6
  const scaleBonus = Math.min(
    Math.floor(scan.objectCount / EARNINGS_CASHBACK.perObjectScale),
    EARNINGS_CASHBACK.maxObjectsBonus
  )
  // Разнообразие фигур: уникальные типы (0 если один), кап 6
  const shapeDiversityBonus = Math.min(
    Math.max(0, scan.uniqueShapeTypes - 1),
    EARNINGS_CASHBACK.maxShapeTypesBonus
  )
  // Кол-во инструментов, кап 6
  const toolsCountBonus = Math.min(scan.toolsCount, EARNINGS_CASHBACK.maxToolsCount)
  // Разнообразие инструментов, кап 6
  const toolsDiversityBonus = Math.min(scan.toolCategories, EARNINGS_CASHBACK.maxToolCategories)

  const total =
    EARNINGS_CASHBACK.base +
    scaleBonus +
    shapeDiversityBonus +
    toolsCountBonus +
    toolsDiversityBonus

  return Math.min(total, EARNINGS_CASHBACK.ceiling)
}

/**
 * Старая формула кэшбэка (для обратной совместимости)
 * @deprecated Используйте calculateCashbackV2
 */
export function calculateCashback(
  objectCount: number,
  csgOps: number
): number {
  const objectsBonus = Math.min(
    Math.max(0, objectCount - 5) * 1,
    10
  )
  const csgBonus = Math.min(
    csgOps * 2,
    10
  )
  return Math.min(
    5 + objectsBonus + csgBonus,
    25
  )
}

/** Проверить, достигнут ли дневной лимит по количеству */
export function isLimitReached(count: number, limit: number): boolean {
  return count >= limit
}

// ─── Сканирование дерева для кэшбэка V2 и квестов ───────────────────

/**
 * Отсканировать объекты и операции для расчёта кэшбэка V2.
 * Общий сканер с квестами V2 (§2.1, §4 ECONOMY.md v2.0).
 */
export function scanForCashback(
  objects: Record<string, { shapeType: string; color: string; transform: { scaleX: number; scaleY: number; scaleZ: number } }>,
  operations: Array<{ type: string; ids?: string[] }>
): CashbackScanResult {
  const shapeTypes = new Set<string>()
  let coloredCount = 0
  let csgCount = 0
  let mirrorCount = 0
  let textCount = 0

  for (const obj of Object.values(objects)) {
    shapeTypes.add(obj.shapeType)
    if (obj.color && obj.color !== '#808080') coloredCount++
    if (obj.shapeType === 'csg') csgCount++
    if (obj.transform.scaleX < 0 || obj.transform.scaleY < 0 || obj.transform.scaleZ < 0) mirrorCount++
    if (obj.shapeType === 'text3d') textCount++
  }

  // Категории инструментов
  let toolCategories = 0
  if (csgCount > 0) toolCategories++ // булевы
  if (mirrorCount > 0) toolCategories++ // зеркало
  if (coloredCount > 0) toolCategories++ // цвет
  if (textCount > 0) toolCategories++ // текст

  return {
    objectCount: Object.keys(objects).length,
    uniqueShapeTypes: shapeTypes.size,
    toolsCount: csgCount + mirrorCount + coloredCount + textCount,
    toolCategories,
  }
}
