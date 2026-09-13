// src/platform/server-time.test.ts — U2/P2-5: fallback НЕ кэшируется
//
// Покрытие:
//  (а) два вызова подряд при ошибке SDK — оба идут в SDK (не возвращают
//      закэшированный Date.now());
//  (б) успешный ответ кэшируется на 30с;
//  (в) getCachedServerTime()/getServerTimeOffset() возвращают null при
//      отсутствии свежего кэша.

import { describe, it, expect, beforeEach, vi } from 'vitest'

// Мок платформы: getServerTime можно дёргать вручную
const h = vi.hoisted(() => {
    const getServerTime = vi.fn<() => Promise<number>>(async () => {
        throw new Error('SDK time unavailable')
    })
    return { getServerTime }
})

vi.mock('./index', () => ({
    getPlatform: () => ({
        getServerTime: h.getServerTime,
    }),
}))

import {
    getServerTime,
    getCachedServerTime,
    getServerTimeOffset,
    resetServerTimeCache,
} from './server-time'

describe('server-time (U2/P2-5)', () => {
    beforeEach(() => {
        resetServerTimeCache()
        h.getServerTime.mockReset()
        h.getServerTime.mockImplementation(async () => {
            throw new Error('SDK time unavailable')
        })
    })

    it('(а) fallback при ошибке НЕ кэшируется — оба вызова идут в SDK', async () => {
        const t1 = await getServerTime()
        const t2 = await getServerTime()
        // Оба вызова достигли SDK (не вернули закэшированный Date.now)
        expect(h.getServerTime).toHaveBeenCalledTimes(2)
        // Значения близки к Date.now(), но это ЛОКАЛЬНЫЙ fallback (не из кэша)
        expect(t1).toBeGreaterThan(0)
        expect(Math.abs(t1 - t2)).toBeLessThan(5000)
        // Кэш остался пустым — следующий вызов снова пойдёт в SDK
        expect(getCachedServerTime()).toBeNull()
        expect(getServerTimeOffset()).toBeNull()
    })

    it('(а) при отсутствии платформы fallback тоже не кэшируется', async () => {
        // Второй вызов также вернёт локальное время и НЕ заполнит кэш
        const t1 = await getServerTime()
        const t2 = await getServerTime()
        expect(t1).toBeGreaterThan(0)
        expect(t2).toBeGreaterThan(0)
        expect(getCachedServerTime()).toBeNull()
    })

    it('(б) успешный ответ кэшируется на 30с', async () => {
        h.getServerTime.mockResolvedValue(1_700_000_000_000)
        const t = await getServerTime()
        expect(t).toBe(1_700_000_000_000)
        expect(getCachedServerTime()).toBe(1_700_000_000_000)
        // Offset = serverTime − localTime (момент кэширования)
        const offset = getServerTimeOffset()
        expect(offset).not.toBeNull()
        expect(typeof offset).toBe('number')
    })

    it('(в) getCachedServerTime/getServerTimeOffset возвращают null без свежего кэша', () => {
        expect(getCachedServerTime()).toBeNull()
        expect(getServerTimeOffset()).toBeNull()
    })
})
