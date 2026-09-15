// src/platform/sdk.test.ts — гонки таймаутов SDK (диагностика лога 130926)
//
// Покрытие:
//  (а) withTimeout: исходный промис выиграл → таймер очищен, onTimeout НЕ вызывается
//      (раньше голый Promise.race оставлял таймер тикать → ЛОЖНЫЙ warn в логе);
//  (б) withTimeout: таймер выиграл → resolve(null), onTimeout вызывается;
//  (в) withTimeout: исходный промис упал → ошибка пробрасывается, onTimeout НЕ вызывается;
//  (г) поздний resolve после таймаута не ломает внешний результат (null уже зарезолвен).

import { describe, it, expect, vi, afterEach } from 'vitest'
import { withTimeout } from './sdk'

afterEach(() => {
    vi.useRealTimers()
})

describe('withTimeout', () => {
    it('(а) успех раньше таймера: таймер очищен, onTimeout не вызывается', async () => {
        vi.useFakeTimers()
        const onTimeout = vi.fn()
        const promise = new Promise<string>((resolve) => setTimeout(() => resolve('ok'), 100))

        const result = withTimeout(promise, 10_000, onTimeout)
        await vi.advanceTimersByTimeAsync(100)
        await expect(result).resolves.toBe('ok')

        // Таймер 10с «дотикал» — но был очищен: ложного onTimeout нет
        await vi.advanceTimersByTimeAsync(10_000)
        expect(onTimeout).not.toHaveBeenCalled()
    })

    it('(б) таймер раньше промиса: resolve(null), onTimeout вызывается', async () => {
        vi.useFakeTimers()
        const onTimeout = vi.fn()
        const promise = new Promise<string>(() => { /* завис */ })

        const result = withTimeout(promise, 5_000, onTimeout)
        await vi.advanceTimersByTimeAsync(5_000)
        await expect(result).resolves.toBeNull()
        expect(onTimeout).toHaveBeenCalledTimes(1)
    })

    it('(в) ошибка исходного промиса пробрасывается, onTimeout не вызывается', async () => {
        vi.useFakeTimers()
        const onTimeout = vi.fn()
        const promise = Promise.reject(new Error('boom'))

        const result = withTimeout(promise, 10_000, onTimeout)
        await expect(result).rejects.toThrow('boom')

        await vi.advanceTimersByTimeAsync(10_000)
        expect(onTimeout).not.toHaveBeenCalled()
    })

    it('(г) поздний resolve после таймаута не меняет внешний результат', async () => {
        vi.useFakeTimers()
        const onTimeout = vi.fn()
        let lateResolve: (v: string) => void = () => { }
        const promise = new Promise<string>((resolve) => { lateResolve = resolve })

        const result = withTimeout(promise, 5_000, onTimeout)
        await vi.advanceTimersByTimeAsync(5_000)
        await expect(result).resolves.toBeNull()

        // getPlayer() резолвился ПОСЛЕ таймаута — внешний промис уже null,
        // повторного вызова onTimeout нет (таймер отработал один раз)
        lateResolve('late')
        await vi.advanceTimersByTimeAsync(1_000)
        expect(onTimeout).toHaveBeenCalledTimes(1)
    })
})
