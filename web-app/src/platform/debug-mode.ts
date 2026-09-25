// src/platform/debug-mode.ts — Дебаг-хук экономики (UB3-3)
//
// Задача: на draft-сборке Яндекс Игр (`?debug-mode=16&draft=true&lang=ru`)
// получить стартовый счёт токенов (3000), чтобы испытывать аренды/подписки
// и лимиты. Без параметров в URL — полный no-op: «ничего лишнего».
//
// Проблема доставки: игра работает в iframe на домене игры, а `debug-mode`
// живёт в адресной строке СТРАНИЦЫ yandex.ru. Яндекс пересылает в игру только
// параметр `payload` (→ `ysdk.environment.payload`), остальные — нет.
// Поэтому детектор мультиканальный, первый сработавший канал включает хук:
//   1) собственные параметры URL iframe: `?debug-mode` / `?debug-tokens=N`;
//   2) `document.referrer` — URL страницы-владельца (работает, если политика
//      referrer сохранила query; проверяется на живом draft);
//   3) `ysdk.environment.payload` — строка с маркером `debug-tokens`
//      (страховочный канал: `&payload=debug-tokens=3000`).
// Витрина/прод без параметров → null (никаких выдач, никакой консоли).

/** Стартовый счёт по умолчанию: покрывает месяц Pro (2000) + все аренды (200) */
export const DEBUG_DEFAULT_TOKENS = 3000

/** Разумный потолок выдачи (защита от опечатки `?debug-tokens=999999999`) */
export const DEBUG_MAX_TOKENS = 100_000

/** Достать значение параметра из строки запроса ("?a=1" или "a=1") */
function searchValue(search: string, name: string): string | null {
  if (!search) return null
  try {
    return new URLSearchParams(search.startsWith('?') ? search.slice(1) : search).get(name)
  } catch {
    return null
  }
}

/**
 * Разобрать строку запроса на предмет debug-выдачи.
 * `debug-tokens=N` — явное число; `debug-mode` (любое значение, в т.ч. 16) —
 * стартовый счёт по умолчанию. Иначе null.
 */
export function parseDebugTokensSearch(search: string): number | null {
  const tokensRaw = searchValue(search, 'debug-tokens')
  if (tokensRaw !== null) {
    const n = Number(tokensRaw)
    if (Number.isFinite(n) && n > 0) return Math.min(Math.floor(n), DEBUG_MAX_TOKENS)
  }
  if (searchValue(search, 'debug-mode') !== null) return DEBUG_DEFAULT_TOKENS
  return null
}

/** Разобрать payload ysdk на маркер `debug-tokens[=:]N` (или просто «debug») */
export function parseDebugPayload(payload: unknown): number | null {
  if (typeof payload !== 'string') return null
  const m = payload.match(/debug-tokens[=:]?(\d+)/)
  if (m) return Math.min(Number(m[1]), DEBUG_MAX_TOKENS)
  if (/(^|[&;, ])(debug|debug-mode)($|[&;, =])/.test(payload)) return DEBUG_DEFAULT_TOKENS
  return null
}

/** query-часть из URL или готовой search-строки (для referrer-канала) */
function toSearch(urlOrSearch: string): string {
  if (!urlOrSearch) return ''
  if (urlOrSearch.startsWith('?') || /^[a-z0-9_-]+=/i.test(urlOrSearch)) return urlOrSearch
  try {
    return new URL(urlOrSearch).search
  } catch {
    return ''
  }
}

/** query-часть document.referrer (страница Яндекс Игр, если браузер её сохранил) */
function referrerSearch(): string {
  try {
    if (typeof document === 'undefined' || !document.referrer) return ''
    return new URL(document.referrer).search
  } catch {
    return ''
  }
}

/**
 * Сколько токенов выдать по debug-режиму (null — не выдавать ничего).
 * `opts` — инъекция для тестов; в проде читаются реальные источники.
 */
export function getDebugTokensGrant(opts?: {
  search?: string
  referrer?: string
  payload?: unknown
}): number | null {
  if (typeof window === 'undefined') return null
  const own = opts?.search ?? window.location.search
  const fromOwn = parseDebugTokensSearch(own)
  if (fromOwn !== null) return fromOwn
  const ref = opts ? toSearch(opts.referrer ?? '') : referrerSearch()
  const fromRef = parseDebugTokensSearch(ref)
  if (fromRef !== null) return fromRef
  return parseDebugPayload(opts?.payload)
}

/**
 * Консольный помощник для ручных проверок (UB3-3): доступен ТОЛЬКО когда
 * debug-режим уже детектирован (или это локальная dev-сборка) — в релизе
 * `window.__tcEconomy` отсутствует, накрутить токены из консоли нельзя.
 */
export async function installEconomyDebugHelper(): Promise<void> {
  if (typeof window === 'undefined') return
  const active = import.meta.env.DEV || (await resolveGrant()) !== null
  if (!active) return
  const { useEconomyStore } = await import('../store/economy-store')
  type DebugApi = {
    grantTokens: (n?: number) => Promise<boolean>
    state: () => ReturnType<typeof useEconomyStore.getState>
  }
  const api: DebugApi = {
    grantTokens: async (n = DEBUG_DEFAULT_TOKENS) => {
      const ok = useEconomyStore.getState().grantDebugTokens(n)
      await useEconomyStore.getState().syncToCloud()
      return ok
    },
    state: () => useEconomyStore.getState(),
  }
    ; (window as unknown as { __tcEconomy: DebugApi }).__tcEconomy = api
  console.log('[Debug] __tcEconomy доступен: __tcEconomy.grantTokens(3000)')
}

/** Кэш результата детекции на время сессии (URL за сессию не меняется) */
let grantCache: number | null | undefined

async function resolveGrant(): Promise<number | null> {
  if (grantCache !== undefined) return grantCache
  let payload: unknown
  try {
    const { getSdk } = await import('./sdk')
    payload = getSdk()?.environment?.payload
  } catch {
    payload = undefined
  }
  grantCache = getDebugTokensGrant({ payload })
  return grantCache
}

/**
 * Разовая debug-выдача при старте (вызывать ПОСЛЕ loadFromCloud — иначе
 * облако перезатрёт). 0/undefined — ничего не сделано.
 */
export async function applyDebugTokensGrant(): Promise<number> {
  const grant = await resolveGrant()
  if (grant === null) return 0
  const { useEconomyStore } = await import('../store/economy-store')
  const applied = useEconomyStore.getState().grantDebugTokens(grant)
  if (applied) {
    await useEconomyStore.getState().syncToCloud()
    console.log(`[Debug] UB3-3: стартовый счёт доведён до ${grant} токенов`)
  }
  return grant
}
