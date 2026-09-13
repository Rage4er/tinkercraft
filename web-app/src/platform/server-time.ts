// src/platform/server-time.ts — Кэшированное серверное время (§5 ECONOMY.md v2.0)
// Модуль-обёртка над getServerTime() для экономики
// Кэширует время на 30 секунд чтобы не дергать SDK лишний раз
//
// U2/P2-5: локальный fallback (Date.now()) НЕ кэшируется на 30с.
// Если serverTime() не удалось — возвращаем Date.now() без записи в кэш,
// и следующий вызов снова попробует SDK (окно накрутки перевода часов закрыто).

let cachedTime: number | null = null
let cachedAt: number = 0
const CACHE_MS = 30_000

/**
 * Получить серверное время (с кэшем 30с).
 *
 * Возвращает number ВСЕГДА (для совместимости с economy-store):
 * - свежий кэш → кэшированное значение;
 * - успешный ответ SDK → кэшируется на 30с;
 * - отсутствие платформы/ошибка → Date.now() БЕЗ кэширования (U2/P2-5),
 *   следующий вызов попробует SDK снова.
 */
export async function getServerTime(): Promise<number> {
  // Сначала попробуем кэш
  if (cachedTime && Date.now() - cachedAt < CACHE_MS) {
    return cachedTime
  }
  const platform = await import('./index').then(m => m.getPlatform())
  if (!platform) {
    // Fallback БЕЗ кэширования — следующая попытка пойдёт в SDK (U2/P2-5)
    console.warn('[ServerTime] No platform — local fallback NOT cached')
    return Date.now()
  }

  let time: number | null
  try {
    time = await platform.getServerTime()
  } catch (e) {
    // Ошибка SDK → fallback БЕЗ кэширования (U2/P2-5)
    console.warn('[ServerTime] getServerTime failed — local fallback NOT cached:', e)
    return Date.now()
  }

  if (time === null) {
    // SDK вернул null (серверное время недоступно) → fallback БЕЗ кэширования
    console.warn('[ServerTime] Server time unavailable — local fallback NOT cached')
    return Date.now()
  }

  // ✅ Успешный ответ — кэшируем на 30с
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

/**
 * U2: смещение серверных часов относительно локальных (мс).
 * offset = serverTime − localTime (на момент получения кэша).
 * Возвращает null, если свежий кэш отсутствует.
 * Используется UI-таймерами для «плавного тика» (Date.now() + offset),
 * привязанного к серверному моменту (анти-накрутка не страдает).
 */
export function getServerTimeOffset(): number | null {
  if (cachedTime && Date.now() - cachedAt < CACHE_MS) {
    return cachedTime - cachedAt
  }
  return null
}

/** Сбросить кэш (для тестов) */
export function resetServerTimeCache(): void {
  cachedTime = null
  cachedAt = 0
}
