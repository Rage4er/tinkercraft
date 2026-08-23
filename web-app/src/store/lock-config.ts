// src/store/lock-config.ts — Конфигурация заблокированных элементов
// Только для Yandex-версии. В clean-версии замков нет.
// Обновлено для экономики v1.0: аренда 24ч вместо вечных покупок

export type LockBadgeKind = 'lock' | 'ad' | 'token'

export interface LockConfig {
  tokens: number // цена в токенах
  ad: boolean    // можно ли разблокировать рекламой
  rental24h: boolean // аренда 24 часа вместо вечной покупки
}

/**
 * Заблокированные элементы на релизе.
 * Все разблокировки — аренда 24 часа (по ECONOMY.md).
 */
export const LOCKED_ITEMS: Record<string, LockConfig> = {
  'shape:torus': { tokens: 10, ad: true, rental24h: true },
  'shape:cone': { tokens: 10, ad: true, rental24h: true },
  'tool:text3d': { tokens: 75, ad: false, rental24h: true },
  'tool:extendedPalette': { tokens: 75, ad: false, rental24h: true },
}

export const getLockConfig = (id: string): LockConfig | null =>
  LOCKED_ITEMS[id] ?? null
