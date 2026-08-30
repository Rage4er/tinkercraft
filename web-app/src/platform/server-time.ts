// src/platform/server-time.ts — Кэшированное серверное время (§5 ECONOMY.md v2.0)
// Модуль-обёртка над getServerTime() для экономики
// Кэширует время на 30 секунд чтобы не дергать SDK лишний раз

let cachedTime: number | null = null
let cachedAt: number = 0
const CACHE_MS = 30_000

export async function getServerTime(): Promise<number> {
  const platform = await import('./index').then(m => m.getPlatform())
  if (!platform) {
    return Date.now() // fallback
  }
  const time = await platform.getServerTime()
  // Кэшируем результат
  cachedTime = time
  cachedAt = Date.now()
  return time
}

/** Получить кэшированное серверное время (если свежее) */
export function getCachedServerTime(): number | null {
  if (cachedTime && Date.now() - cachedAt < CACHE_MS) {
    return cachedTime
  }
  return null
}

/** Сбросить кэш (для тестов) */
export function resetServerTimeCache(): void {
  cachedTime = null
  cachedAt = 0
}
