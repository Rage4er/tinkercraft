// src/store/lock-config.ts — Конфигурация заблокированных элементов
// Только для Yandex-версии. В clean-версии замков нет.

export type LockBadgeKind = 'lock' | 'ad' | 'token'

export interface LockConfig {
  tokens: number // цена в токенах
  ad: boolean    // можно ли разблокировать рекламой
}

// id должны совпадать с id кнопок тулбара / фигур
export const LOCKED_ITEMS: Record<string, LockConfig> = {
  'shape:torus': { tokens: 10, ad: true },
  'shape:cone':  { tokens: 10, ad: true },
  'tool:text3d': { tokens: 20, ad: true },
}

export const getLockConfig = (id: string): LockConfig | null =>
  LOCKED_ITEMS[id] ?? null
