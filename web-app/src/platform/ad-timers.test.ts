// src/platform/ad-timers.test.ts — U2: UI-таймеры кулдауна рекламы
//
// Покрытие:
//  (а) getAdCooldownRemainingMs возвращает монотонно убывающее время;
//  (б) формат "м:сс" округляется вверх;
//  (в) при отсутствии lastTimestamp → 0 (кулдаун не начат);
//  (г) при серверном смещении таймер привязан к серверному моменту.

import { describe, it, expect, beforeEach } from 'vitest'
import { useEconomyStore, emptyAdRewards } from '../store/economy-store'
import { AD_COOLDOWN_MS } from '../store/economy-config'
import { getAdCooldownRemainingMs, formatCooldownMs } from './ad-timers'

const SERVER_TS = 1_700_000_000_000

beforeEach(() => {
    useEconomyStore.setState({
        adRewards: emptyAdRewards(),
    })
})

describe('ad-timers (U2)', () => {
    it('(а) getAdCooldownRemainingMs монотонно убывает', () => {
        useEconomyStore.setState({
            adRewards: { ...emptyAdRewards(), tokens: { lastTimestamp: SERVER_TS, countToday: 1 } },
        })
        // lastTimestamp = SERVER_TS, прошло 10с серверного времени
        const r1 = getAdCooldownRemainingMs('tokens', SERVER_TS + 10_000)
        const r2 = getAdCooldownRemainingMs('tokens', SERVER_TS + 20_000)
        expect(r1).toBeGreaterThan(r2)
        expect(r1).toBe(AD_COOLDOWN_MS - 10_000)
        expect(r2).toBe(AD_COOLDOWN_MS - 20_000)
        // По истечении кулдауна — 0
        expect(getAdCooldownRemainingMs('tokens', SERVER_TS + AD_COOLDOWN_MS + 1)).toBe(0)
    })

    it('(б) формат "м:сс" округляется вверх', () => {
        expect(formatCooldownMs(0)).toBe('0:00')
        expect(formatCooldownMs(5 * 60 * 1000)).toBe('5:00')
        // 4:59.1 → 5:00 (ceil)
        expect(formatCooldownMs(4 * 60 * 1000 + 59 * 1000 + 100)).toBe('5:00')
        expect(formatCooldownMs(61 * 1000)).toBe('1:01')
    })

    it('(в) без lastTimestamp кулдаун не активен (0)', () => {
        expect(getAdCooldownRemainingMs('tokens', Date.now())).toBe(0)
    })

    it('(г) привязка к серверному моменту: nowMs учитывает смещение', () => {
        useEconomyStore.setState({
            adRewards: { ...emptyAdRewards(), banner: { lastTimestamp: SERVER_TS, countToday: 1 } },
        })
        // Локальные часы опережают серверные на 2 часа (перевод часов).
        // UI передаёт nowMs = localNow + offset, где offset = serverTime − localTime.
        // Значит при локальном now = SERVER_TS + 2h + 15s, с offset = −2h,
        // серверное now = SERVER_TS + 15s → остаток = CD − 15s.
        const localNow = SERVER_TS + 2 * 3600_000 + 15_000
        const offset = -2 * 3600_000 // сервер отстаёт от локальных на 2ч
        const remaining = getAdCooldownRemainingMs('banner', localNow + offset)
        expect(remaining).toBe(AD_COOLDOWN_MS - 15_000)
    })
})
