// src/platform/ad-timers.ts — «Тикающие» UI-таймеры кулдаунов рекламы (U2)
//
// Проблема: кулдауны в PropertiesPanel/EconomyMiniHUD считались от
// getServerTime() с кэшем 30с — значение «стояло на месте» до обновления кэша.
//
// Решение: UI-таймер тикает посекундно по локальным часам, но с поправкой
// на серверное смещение (getServerTimeOffset() = serverTime − localTime):
//   nowMs = Date.now() + offset
// Отображаемый отсчёт идёт плавно (1с тик), а итоговая привязка — к серверному
// моменту lastTimestamp (анти-накрутка не страдает: расчёты лимитов в
// economy-store остаются на серверном времени через getCachedServerTime()).

import { useEffect, useState } from 'react'
import { useEconomyStore, type AdRewardKind } from '../store/economy-store'
import { AD_COOLDOWN_MS } from '../store/economy-config'
import { getServerTime, getServerTimeOffset } from './server-time'

/** Обновлять кэш серверного времени (и offset) каждые 30с — синхронно с CACHE_MS */
const SERVER_TIME_REFRESH_MS = 30_000

/**
 * Чистый геттер: сколько мс осталось до конца кулдауна вида `kind`
 * в момент `nowMs` (серверное смещение уже учтено вызывающей стороной).
 * 0 — кулдаун прошёл (или не начинался).
 */
export function getAdCooldownRemainingMs(kind: AdRewardKind, nowMs: number): number {
    const ad = useEconomyStore.getState().adRewards[kind]
    if (!ad?.lastTimestamp) return 0
    return Math.max(0, AD_COOLDOWN_MS - (nowMs - ad.lastTimestamp))
}

/** Форматировать ms → "м:сс" (округление вверх — как было) */
export function formatCooldownMs(ms: number): string {
    const totalSec = Math.ceil(ms / 1000)
    const min = Math.floor(totalSec / 60)
    const sec = totalSec % 60
    return `${min}:${sec.toString().padStart(2, '0')}`
}

/**
 * Хук «живого» кулдауна рекламы.
 * Тикает раз в секунду; `nowMs` = локальное время + серверное смещение.
 * Периодически (30с) запрашивает getServerTime(), чтобы offset не устаревал.
 *
 * Возвращает:
 *  - remainingMs: число мс до конца кулдауна (0 — доступно);
 *  - formatted: строка "м:сс" (или null, если кулдаун неактивен);
 *  - active: true, если кулдаун идёт.
 */
export function useAdCooldown(kind: AdRewardKind): {
    remainingMs: number
    formatted: string | null
    active: boolean
} {
    const [nowMs, setNowMs] = useState<number>(() => Date.now() + (getServerTimeOffset() ?? 0))

    useEffect(() => {
        // Обновляем кэш серверного времени при монтировании (чтобы offset был свежим)
        void getServerTime().then(() => {
            setNowMs(Date.now() + (getServerTimeOffset() ?? 0))
        })

        // Посекундный тик по локальным часам + серверное смещение
        const iv = setInterval(() => {
            setNowMs(Date.now() + (getServerTimeOffset() ?? 0))
        }, 1000)

        // Регулярное обновление кэша серверного времени (offset не стареет)
        const refresh = setInterval(() => {
            void getServerTime()
        }, SERVER_TIME_REFRESH_MS)

        return () => {
            clearInterval(iv)
            clearInterval(refresh)
        }
    }, [])

    const remainingMs = getAdCooldownRemainingMs(kind, nowMs)

    return {
        remainingMs,
        formatted: remainingMs > 0 ? formatCooldownMs(remainingMs) : null,
        active: remainingMs > 0,
    }
}

// ─── UB3-5: таймер до сброса ежедневного бонуса ──────────────────────

/**
 * Чистый геттер: сколько мс осталось до сброса ежедневного бонуса.
 *
 * День бонуса определяется календарной датой СЕРВЕРНОГО времени
 * (isDayPassed сравнивает getFullYear/getMonth/getDate в локальной TZ
 * браузера) → «момент сброса» = ближайшая полуночь локальной TZ после
 * момента получения (lastDailyBonus), скорректированная серверным смещением.
 * 0 — бонус уже доступен (не получен или день сменился).
 */
export function getDailyResetRemainingMs(lastDailyBonus: number | null, nowMs: number): number {
    if (lastDailyBonus === null) return 0
    const d = new Date(lastDailyBonus)
    const nextMidnight = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime()
    return Math.max(0, nextMidnight - nowMs)
}

/** Формат UB3-5: ms → "ч:мм:сс" (часы без ведущего нуля) */
export function formatCountdownHms(ms: number): string {
    const totalSec = Math.ceil(ms / 1000)
    const h = Math.floor(totalSec / 3600)
    const min = Math.floor((totalSec % 3600) / 60)
    const sec = totalSec % 60
    return `${h}:${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`
}

/**
 * Хук «живого» отсчёта до сброса ежедневного бонуса (UB3-5).
 * Тот же паттерн, что у useAdCooldown: тик 1с по локальным часам
 * с поправкой на серверное смещение; подписка на lastDailyBonus — чтобы
 * после получения бонуса отсчёт стартовал без перезагрузки.
 */
export function useDailyReset(): {
    remainingMs: number
    formatted: string | null
    /** true, если бонус уже доступен (не получен или сутки прошли) */
    due: boolean
} {
    const lastDailyBonus = useEconomyStore((s) => s.lastDailyBonus)
    const [nowMs, setNowMs] = useState<number>(() => Date.now() + (getServerTimeOffset() ?? 0))

    useEffect(() => {
        void getServerTime().then(() => {
            setNowMs(Date.now() + (getServerTimeOffset() ?? 0))
        })
        const iv = setInterval(() => {
            setNowMs(Date.now() + (getServerTimeOffset() ?? 0))
        }, 1000)
        const refresh = setInterval(() => {
            void getServerTime()
        }, SERVER_TIME_REFRESH_MS)
        return () => {
            clearInterval(iv)
            clearInterval(refresh)
        }
    }, [])

    const remainingMs = getDailyResetRemainingMs(lastDailyBonus, nowMs)

    return {
        remainingMs,
        formatted: remainingMs > 0 ? formatCountdownHms(remainingMs) : null,
        due: lastDailyBonus === null || remainingMs === 0,
    }
}
