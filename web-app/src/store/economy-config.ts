// src/store/economy-config.ts — Константы экономики по ECONOMY.md
// Версия: 1.0 (релиз) · Дата: 22.08.2026

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

/** Кэшбэк за экспорт */
export const EARNINGS_CASHBACK = {
  base: 5,
  perObjectOver5: 1,
  maxObjectsBonus: 10, // максимум +10 за объекты
  perCsgOp: 2,
  maxCsgBonus: 10, // максимум +10 за CSG
  ceiling: 25, // общий потолок
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

/** Проверить, прошёл ли день с момента (по локальной дате устройства) */
export function isDayPassed(timestamp: number | null): boolean {
  if (!timestamp) return true
  const last = new Date(timestamp)
  const now = new Date()
  return (
    last.getFullYear() < now.getFullYear() ||
    last.getMonth() < now.getMonth() ||
    last.getDate() < now.getDate()
  )
}

/** Проверить, прошёл ли кулдаун (мс) */
export function isCooldownPassed(timestamp: number | null, ms: number): boolean {
  if (!timestamp) return true
  return Date.now() - timestamp >= ms
}

/** Рассчитать кэшбэк за экспорт */
export function calculateCashback(
  objectCount: number,
  csgOps: number
): number {
  const objectsBonus = Math.min(
    Math.max(0, objectCount - 5) * EARNINGS_CASHBACK.perObjectOver5,
    EARNINGS_CASHBACK.maxObjectsBonus
  )
  const csgBonus = Math.min(
    csgOps * EARNINGS_CASHBACK.perCsgOp,
    EARNINGS_CASHBACK.maxCsgBonus
  )
  return Math.min(
    EARNINGS_CASHBACK.base + objectsBonus + csgBonus,
    EARNINGS_CASHBACK.ceiling
  )
}

/** Проверить, достигнут ли дневной лимит по количеству */
export function isLimitReached(count: number, limit: number): boolean {
  return count >= limit
}
