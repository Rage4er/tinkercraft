// ============================================================
// Debug logging — conditional logs only in development
// ============================================================
// В режиме разработки (pnpm dev) логи выводятся.
// В продакшн-сборке (pnpm build) логи полностью отсутствуют.
// Vite автоматически определяет режим через import.meta.env.DEV.

/** true — только в режиме разработки (pnpm dev), false — в продакшн-сборке */
export const isDev = import.meta.env.DEV

/**
 * Условный лог — выводит сообщение ТОЛЬКО в режиме разработки.
 * @example
 *   devLog('MIRROR', 'BEFORE', transform)
 */
export function devLog(prefix: string, ...args: unknown[]): void {
  if (isDev) {
    console.log(`[${prefix}]`, ...args)
  }
}

/**
 * Условный ворнинг — выводит сообщение ТОЛЬКО в режиме разработки.
 * @example
 *   devWarn('MIRROR', 'node missing')
 */
export function devWarn(prefix: string, ...args: unknown[]): void {
  if (isDev) {
    console.warn(`[${prefix}]`, ...args)
  }
}
