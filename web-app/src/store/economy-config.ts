// src/store/economy-config.ts — Константы экономики по ECONOMY.md v2.3
// Версия: 2.3 · Дата: 14.09.2026
// U1/U9: реклама per-reward — свой кулдаун 5 мин и свой лимит ≤3/день
// на каждый вид награды.
// U12/A (v2.3): видов рекламы ЧЕТЫРЕ — tokens / import / export / banner.
// Доход приносит ТОЛЬКО вид tokens (+50×3 = 150/день); import (серия 2 роликов),
// export (1 ролик) и banner (1 ролик) — ОПЛАТА операций (§3.1/§3.2 ECONOMY.md),
// токены за показ НЕ начисляются.

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

/**
 * UB3-1 (v2.5): сколько рекламных РОЛИКОВ стоит одна операция вида награды.
 * `import` = 2 (серия из двух роликов, §3.1 ECONOMY.md), остальные виды = 1.
 */
export const AD_OPERATION_COST = {
  tokens: 1,
  import: 2,
  export: 1,
  banner: 1,
} as const

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
  /** Макс доход в день (v2.3: доход только вид tokens 3 × 50 = 150, итого 50+150+100+30+75 = 405) */
  maxPerDay: 405,
  /** Реалистичный доход в день (v2.3: бонус + реклама tokens ×2–3 + квесты + кэшбэк + использование) */
  realisticPerDay: 250,

  /**
   * U1/U9: просмотры рекламы в день — НА КАЖДЫЙ ВИД награды
   * (tokens / import / export / banner), §2 ECONOMY.md v2.3.
   * ⚠️ UB3-1 (v2.5): для вида `import` это лимит **операций** (импортов),
   * бюджет ПОКАЗОВ для него — `AD_SHOWS_PER_DAY.import` (= 6).
   */
  adsPerDay: 3,
  /**
   * UB3-1 (v2.5): оплачиваемых рекламой ИМПОРТОВ в день. Один импорт стоит
   * серию из 2 роликов → дневной бюджет показов вида `import` = 6.
   */
  importsPerDay: 3,
  /** Кулдаун между рекламой (мс) — на каждый вид награды (U1) */
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

/**
 * UB3-1 (v2.5): бюджет рекламных ПОКАЗОВ в день на каждый вид награды.
 *
 * Контракт UB3-1: «3 импорта в сутки, каждый оплачивается серией из 2 роликов»
 * → для вида `import` бюджет показов = 3 × 2 = 6. Для видов с ценой 1 ролик
 * бюджет совпадает с `LIMITS.adsPerDay` (3 показа = 3 операции), то есть
 * поведение tokens / export / banner НЕ меняется.
 */
export const AD_SHOWS_PER_DAY = {
  tokens: LIMITS.adsPerDay * AD_OPERATION_COST.tokens,
  import: LIMITS.importsPerDay * AD_OPERATION_COST.import, // 3 × 2 = 6
  export: LIMITS.adsPerDay * AD_OPERATION_COST.export,
  banner: LIMITS.adsPerDay * AD_OPERATION_COST.banner,
} as const

/** Вид rewarded-рекламы (совпадает с AdRewardKind в economy-store) */
export type AdRewardKindName = keyof typeof AD_OPERATION_COST

/** UB3-1: дневной бюджет ПОКАЗОВ для вида (import = 6, остальные = 3) */
export function adShowsLimit(kind: AdRewardKindName): number {
  return AD_SHOWS_PER_DAY[kind]
}

/** UB3-1: лимит ОПЕРАЦИЙ вида в день (import = 3 импорта, остальные = 3) */
export function adOperationsLimit(kind: AdRewardKindName): number {
  return Math.floor(AD_SHOWS_PER_DAY[kind] / AD_OPERATION_COST[kind])
}

/**
 * UB3-1: сколько ОПЕРАЦИЙ вида оплачено сегодня по числу показов.
 * Частичная серия (показ был, операция не оплачена) операцию не засчитывает:
 * 3 показа импорта = 1 оплаченный импорт + 1 «сгоревший» ролик.
 */
export function adPaidOperations(countToday: number, kind: AdRewardKindName): number {
  return Math.floor(Math.max(0, countToday) / AD_OPERATION_COST[kind])
}

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
 *
 * ⚠️ P2-1: ФОЛБЭК НА ЛОКАЛЬНЫЕ ЧАСЫ — документированное отклонение.
 * `getServerTime()` (platform/server-time.ts) при недоступности платформы
 * возвращает Date.now(). Это допустимо по двум причинам:
 *  1. В yandex-режиме серверное время ОБЯЗАТЕЛЬНО: экономика работает только
 *     при реальном Yandex SDK (isEconomyAvailable() === true). Если SDK не
 *     инициализирован — yandex.ts сам логирует предупреждение
 *     («[Yandex] getServerTime: SDK not initialized») и фолбэчит на локальное.
 *  2. В clean-режиме экономика отключена целиком (isEconomyAvailable() === false),
 *     поэтому вычисления времени не влияют на начисления.
 * Фолбэк необходим для работы тестов и dev-окружения без SDK.
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

/**
 * Устаревшая функция кэшбэка (v1).
 * Заменена на calculateCashbackV2 + calculateCashbackBreakdown.
 * Сохранена для обратной совместимости с тестами.
 * @deprecated Используйте calculateCashbackV2
 */
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
 * Разбивка кэшбэка для UI-превью (§2.1)
 * EC5: единая функция для ExportModal и store — формула не расходится.
 */
export interface CashbackBreakdown {
  base: number
  scale: number
  shapeDiv: number
  toolCount: number
  toolDiv: number
  total: number
}

export function calculateCashbackBreakdown(scan: CashbackScanResult): CashbackBreakdown {
  const scale = Math.min(
    Math.floor(scan.objectCount / EARNINGS_CASHBACK.perObjectScale),
    EARNINGS_CASHBACK.maxObjectsBonus
  )
  const shapeDiv = Math.min(
    Math.max(0, scan.uniqueShapeTypes - 1),
    EARNINGS_CASHBACK.maxShapeTypesBonus
  )
  const toolCount = Math.min(scan.toolsCount, EARNINGS_CASHBACK.maxToolsCount)
  const toolDiv = Math.min(scan.toolCategories, EARNINGS_CASHBACK.maxToolCategories)

  const total = Math.min(
    EARNINGS_CASHBACK.base + scale + shapeDiv + toolCount + toolDiv,
    EARNINGS_CASHBACK.ceiling
  )

  return { base: EARNINGS_CASHBACK.base, scale, shapeDiv, toolCount, toolDiv, total }
}

/** Проверить, достигнут ли дневной лимит по количеству */
export function isLimitReached(count: number, limit: number): boolean {
  return count >= limit
}

// ─── Сканирование дерева для кэшбэка V2 и квестов ───────────────────

/**
 * P1-2: единое определение «объекта» для целей экспорта, кэшбэка и квестов.
 *
 * По спецификации (§2.1: «объекты (примитивы + baked, включая детей CSG)»)
 * «объектом» считается ЛЮБОЙ объект сцены, попадающий в экспорт STL:
 * примитивы, CSG-результаты, импортированные меши (`import_mesh`) и
 * 3D-текст (`text3d` — baked-геометрия). Все они экспортируются в STL
 * (`downloadStl(objectList, ...)`) и должны учитываться единообразно
 * в `exportStl`, `scanForCashback` и `evaluateQuests`.
 *
 * Единая точка принятия решения: если потребуется исключить какой-то тип
 * из подсчёта — это делается здесь один раз, а не в трёх местах.
 */
export function countSceneObjects(
  objects: Record<string, { shapeType: string }>
): number {
  return Object.values(objects).length
}

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

  // EC-R1: зеркала считаем по mirror-операциям истории (как C3 в evaluateQuests).
  // Причина: mirror-store пишет ПОЛОЖИТЕЛЬНЫЙ scale (Math.abs) — проверка
  // scale < 0 никогда не срабатывала, и зеркала не попадали в toolsCount/
  // toolCategories кэшбэка (§2.1). Считаем по ТЕКУЩЕЙ сцене (пересечение
  // id из mirror-операций с объектами) — удаление зеркала/undo уменьшает счётчик.
  const mirrorCreatedIds = new Set<string>()
  for (const op of operations) {
    if (op.type === 'mirror' && op.ids && op.ids.length > 0) {
      for (const id of op.ids) mirrorCreatedIds.add(id)
    }
  }

  for (const [id, obj] of Object.entries(objects)) {
    shapeTypes.add(obj.shapeType)
    if (obj.color && obj.color !== '#808080') coloredCount++
    if (obj.shapeType === 'csg') csgCount++
    // EC-R1: зеркало — создан mirror-операцией ИЛИ legacy scale < 0
    if (
      mirrorCreatedIds.has(id) ||
      obj.transform.scaleX < 0 || obj.transform.scaleY < 0 || obj.transform.scaleZ < 0
    ) mirrorCount++
    if (obj.shapeType === 'text3d') textCount++
  }

  // Категории инструментов
  let toolCategories = 0
  if (csgCount > 0) toolCategories++ // булевы
  if (mirrorCount > 0) toolCategories++ // зеркало
  if (coloredCount > 0) toolCategories++ // цвет
  if (textCount > 0) toolCategories++ // текст

  return {
    // P1-2: единый подсчёт — та же функция, что и в exportStl/evaluateQuests
    objectCount: countSceneObjects(objects),
    uniqueShapeTypes: shapeTypes.size,
    toolsCount: csgCount + mirrorCount + coloredCount + textCount,
    toolCategories,
  }
}
