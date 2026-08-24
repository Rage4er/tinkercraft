// src/store/lock-config.ts — Конфигурация заблокированных элементов
// Только для Yandex-версии. В clean-версии замков нет.
// Обновлено для экономики v1.0: аренда 24ч вместо вечных покупок
// Все фигуры бесплатны (по ECONOMY.md) — замки только на действиях

export type LockBadgeKind = 'lock' | 'ad' | 'token'

export interface LockConfig {
  tokens: number // цена в токенах
  ad: boolean    // можно ли разблокировать рекламой
  rental24h: boolean // аренда 24 часа вместо вечной покупки
}

/**
 * Заблокированные действия на релизе V12.
 * Все фигуры бесплатны — замки только на действиях.
 */
export const LOCKED_ITEMS: Record<string, LockConfig> = {
  'tool:text3d': { tokens: 75, ad: false, rental24h: true },
  'tool:extendedPalette': { tokens: 75, ad: false, rental24h: true },
}

export const getLockConfig = (id: string): LockConfig | null =>
  LOCKED_ITEMS[id] ?? null
