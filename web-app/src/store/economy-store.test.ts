// src/store/economy-store.test.ts — P0-фиксы экономики
// Покрытие: P0-1 (анти-фарм кэшбэка), P0-2 (серверное время в expiry),
// P0-3 (syncToCloud с хвостом), P0-4 (lastSavedData в loadFromCloud),
// P0-5 (санитизация данных).
import { describe, it, expect, beforeEach, vi } from 'vitest'

const ONE_DAY_MS = 24 * 60 * 60 * 1000

// ─── Моки (vi.hoisted — доступны и в factory, и в тестах) ────────────
const h = vi.hoisted(() => {
    let serverTime: number | null = 1_700_000_000_000 // фиксированное «серверное» время
    const saveData = vi.fn(async () => { })
    const loadData = vi.fn(async () => ({}))
    const platform = {
        ysdk: {},
        init: vi.fn(async () => true),
        loadingReady: vi.fn(),
        showFullscreenAd: vi.fn(async () => false),
        showRewardedVideo: vi.fn(async () => false),
        getPlayer: () => null,
        isAuthorized: () => false,
        isYandexSdkReady: () => true,
        getPlatformType: () => 'yandex',
        saveData,
        loadData,
        submitScore: vi.fn(async () => { }),
        getLeaderboardEntries: vi.fn(async () => []),
        startGameplay: vi.fn(),
        stopGameplay: vi.fn(),
        getServerTime: vi.fn(async () => serverTime ?? Date.now()),
        showBannerAdv: vi.fn(async () => ({ stickyAdvIsShowing: false })),
        hideBannerAdv: vi.fn(async () => ({ stickyAdvIsShowing: false })),
        getBannerAdvStatus: vi.fn(async () => ({ stickyAdvIsShowing: false })),
        dispose: vi.fn(),
    }
    return {
        platform,
        saveData,
        loadData,
        setServerTime: (t: number | null) => { serverTime = t },
        getCachedServerTime: () => serverTime,
        getServerTime: async () => serverTime ?? Date.now(),
    }
})

vi.mock('../platform', () => ({
    getPlatform: () => h.platform,
    isEconomyAvailable: () => true,
    getPlatformType: () => 'yandex',
    initPlatform: async () => true,
}))

vi.mock('../platform/server-time', () => ({
    getServerTime: async () => h.getServerTime(),
    getCachedServerTime: () => h.getCachedServerTime(),
    resetServerTimeCache: () => { h.setServerTime(null) },
}))

// Импорты — ПОСЛЕ vi.mock (vitest поднимает моки)
import { useEconomyStore, sanitizeEconomyData, createExportHash, MAX_TOKENS, countSceneObjects } from './economy-store'
import { EARNINGS_AD_REWARDED, LIMITS } from './economy-config'
import type { TinkerCraftOperation, SceneObject } from '../csg/types'

const SCAN = { objectCount: 10, uniqueShapeTypes: 3, toolsCount: 2, toolCategories: 2 }

beforeEach(() => {
    localStorage.clear()
    h.setServerTime(1_700_000_000_000)
    h.saveData.mockReset()
    h.saveData.mockImplementation(async () => { })
    h.loadData.mockReset()
    h.loadData.mockImplementation(async () => ({}))
    // П1-6/П1-7: сбрасываем мок рекламы, чтобы вызовы не «перетекали» между тестами
    h.platform.showRewardedVideo.mockReset()
    h.platform.showRewardedVideo.mockResolvedValue(false)
    useEconomyStore.setState({
        tokens: 100,
        lastDailyBonus: null,
        totalModelsCreated: 0,
        activeSubscription: null,
        subscriptionExpiresAt: null,
        rentals: { text3d: null, extendedPalette: null, disableBanner: null },
        todayAdsWatched: 0,
        lastAdTimestamp: null,
        todayActions: 0,
        lastActionTimestamp: null,
        todayCashbacks: 0,
        todayExportHashes: [],
        todayQuestsCompleted: [],
        todayQuests: [],
        questTriggers: {} as never,
        lastExportHash: null,
        lastQuestResetDate: null,
        lastSavedData: '',
        pendingSync: false,
        syncTailPending: false,
        bannerVisible: false,
    })
})

// ─── P0-1: Анти-фарм кэшбэка ────────────────────────────────────────

describe('calculateAndClaimCashback (P0-1 анти-фарм)', () => {
    it('начисляет кэшбэк за новую модель и фиксирует хэш атомарно', () => {
        const cashback = useEconomyStore.getState().calculateAndClaimCashback(SCAN, 'model-1')
        expect(cashback).toBeGreaterThan(0)
        const s = useEconomyStore.getState()
        expect(s.lastExportHash).toBe('model-1')
        expect(s.todayExportHashes).toContain('model-1')
        expect(s.tokens).toBe(100 + cashback)
    })

    it('НЕ начисляет кэшбэк повторно за ту же модель (хэш в todayExportHashes)', () => {
        const first = useEconomyStore.getState().calculateAndClaimCashback(SCAN, 'model-1')
        expect(first).toBeGreaterThan(0)
        const tokensAfterFirst = useEconomyStore.getState().tokens

        const second = useEconomyStore.getState().calculateAndClaimCashback(SCAN, 'model-1')
        expect(second).toBe(0)
        expect(useEconomyStore.getState().tokens).toBe(tokensAfterFirst)
        expect(useEconomyStore.getState().todayCashbacks).toBe(1)
    })

    it('НЕ начисляет кэшбэк, если hash === lastExportHash (фарм через undo/redo)', () => {
        useEconomyStore.getState().calculateAndClaimCashback(SCAN, 'same-hash')
        // Имитация undo/redo: lastExportHash остался тем же
        const again = useEconomyStore.getState().calculateAndClaimCashback(SCAN, 'same-hash')
        expect(again).toBe(0)
    })

    it('начисляет кэшбэк за РАЗНЫЕ модели (в пределах дневного лимита)', () => {
        const c1 = useEconomyStore.getState().calculateAndClaimCashback(SCAN, 'hash-A')
        const c2 = useEconomyStore.getState().calculateAndClaimCashback(SCAN, 'hash-B')
        const c3 = useEconomyStore.getState().calculateAndClaimCashback(SCAN, 'hash-C')
        expect(c1).toBeGreaterThan(0)
        expect(c2).toBeGreaterThan(0)
        expect(c3).toBeGreaterThan(0)
        expect(useEconomyStore.getState().todayCashbacks).toBe(3)
        // 4-й — лимит 3/день
        expect(useEconomyStore.getState().calculateAndClaimCashback(SCAN, 'hash-D')).toBe(0)
    })

    it('сбрасывает todayExportHashes при смене дня (initDailyQuests)', async () => {
        h.setServerTime(1_700_000_000_000)
        useEconomyStore.setState({
            todayQuests: [{
                difficulty: 'easy' as const,
                trigger: 'count_cubes' as const,
                category: 'composition' as const,
                target: 5,
                progress: 0,
                reward: 20,
                completed: false,
            }],
            lastQuestResetDate: 1_700_000_000_000 - 2 * ONE_DAY_MS, // день сменился
            todayExportHashes: ['old-hash'],
        })
        await useEconomyStore.getState().initDailyQuests()
        expect(useEconomyStore.getState().todayExportHashes).toEqual([])
    })
})

// ─── P0-2: Серверное время в expiry ─────────────────────────────────

describe('expiry по серверному времени (P0-2)', () => {
    it('аренда истекает по серверному времени, а не локальному', () => {
        h.setServerTime(1_700_000_000_000)
        useEconomyStore.setState({ rentals: { text3d: 1_700_000_000_000 + 1000, extendedPalette: null, disableBanner: null } })
        expect(useEconomyStore.getState().hasRentalRO('text3d')).toBe(true)

        // «Перевод часов назад» локально не влияет — серверное время перевалило expiry
        h.setServerTime(1_700_000_000_000 + 2000)
        expect(useEconomyStore.getState().hasRentalRO('text3d')).toBe(false)
    })

    it('подписка истекает по серверному времени', () => {
        h.setServerTime(1_700_000_000_000)
        useEconomyStore.setState({ activeSubscription: 'weekly', subscriptionExpiresAt: 1_700_000_000_000 + 1000 })
        expect(useEconomyStore.getState().hasActiveSubscriptionRO()).toBe(true)

        h.setServerTime(1_700_000_000_000 + 2000)
        expect(useEconomyStore.getState().hasActiveSubscriptionRO()).toBe(false)
    })

    it('checkSubscriptionExpiry очищает истёкшую подписку по серверному времени', () => {
        h.setServerTime(1_700_000_000_000)
        useEconomyStore.setState({ activeSubscription: 'monthly', subscriptionExpiresAt: 1_700_000_000_000 + 1000 })
        h.setServerTime(1_700_000_000_000 + 2000)
        useEconomyStore.getState().checkSubscriptionExpiry()
        expect(useEconomyStore.getState().activeSubscription).toBeNull()
    })
})

// ─── P0-3: syncToCloud с «хвостом» ──────────────────────────────────

describe('syncToCloud (P0-3 debounce с хвостом)', () => {
    it('не теряет обновления, пришедшие во время активной синхронизации', async () => {
        let resolveSave: (() => void) | undefined
        h.saveData.mockImplementationOnce(() => new Promise<void>((res) => { resolveSave = res }))

        const p1 = useEconomyStore.getState().syncToCloud()
        expect(useEconomyStore.getState().pendingSync).toBe(true)

        // Данные меняются, пока первая синхронизация висит
        useEconomyStore.getState().addTokens(10)
        useEconomyStore.getState().syncToCloud() // → помечает «грязный» хвост
        expect(useEconomyStore.getState().syncTailPending).toBe(true)

        resolveSave!()
        await p1

        // После завершения первой — выполняется вторая (с актуальными токенами)
        expect(useEconomyStore.getState().pendingSync).toBe(false)
        expect(useEconomyStore.getState().syncTailPending).toBe(false)
        expect(h.saveData).toHaveBeenCalledTimes(2)
        const secondData = (h.saveData.mock.calls as unknown as Array<[Record<string, unknown>]>)[1][0]
        expect(secondData.tokens).toBe(110) // 100 + 10
    })

    it('сбрасывает pendingSync только по факту успеха/неудачи', async () => {
        // Неудача — pendingSync сбрасывается
        h.saveData.mockImplementationOnce(() => Promise.reject(new Error('network')))
        await useEconomyStore.getState().syncToCloud()
        expect(useEconomyStore.getState().pendingSync).toBe(false)
        expect(useEconomyStore.getState().syncTailPending).toBe(false)
    })
})

// ─── P0-4/P0-5: loadFromCloud + санитизация ─────────────────────────

describe('loadFromCloud (P0-4, P0-5)', () => {
    it('санитизирует облачные данные и восстанавливает lastSavedData', async () => {
        h.loadData.mockResolvedValueOnce({
            tokens: 5_000_000,              // превышает кап 1_000_000
            activeSubscription: 'hacked',   // некорректный ключ
            rentals: { text3d: 123 },       // частичная структура
            todayAdsWatched: 999,           // превышает лимит 3/день
            todayExportHashes: ['h1'],
            lastQuestResetDate: 111,
        })
        await useEconomyStore.getState().loadFromCloud()
        const s = useEconomyStore.getState()
        expect(s.tokens).toBe(MAX_TOKENS)         // кап
        expect(s.activeSubscription).toBeNull()    // некорректный ключ отброшен
        expect(s.rentals).toEqual({ text3d: 123, extendedPalette: null, disableBanner: null })
        expect(s.todayAdsWatched).toBe(3)          // clamp к лимиту
        expect(s.todayExportHashes).toEqual(['h1'])
        expect(s.lastSavedData).not.toBe('')       // P0-4: восстановлен и пересчитан
    })
})

// ─── P0-5: sanitizeEconomyData (unit) ────────────────────────────────

describe('sanitizeEconomyData (P0-5 валидация)', () => {
    it('clamp токены в [0, MAX_TOKENS]', () => {
        expect(sanitizeEconomyData({ tokens: -50 })?.tokens).toBe(0)
        expect(sanitizeEconomyData({ tokens: 5_000_000 })?.tokens).toBe(MAX_TOKENS)
        expect(sanitizeEconomyData({ tokens: 123 })?.tokens).toBe(123)
    })

    it('отбрасывает некорректную структуру полей', () => {
        const s = sanitizeEconomyData({
            activeSubscription: 'bogus',
            rentals: 'not-an-object',
            todayQuestsCompleted: ['impossible', 'easy'],
            todayExportHashes: [42, 'ok-hash'],
            todayCashbacks: 'many',
        })
        expect(s?.activeSubscription).toBeNull()
        expect(s?.rentals).toEqual({ text3d: null, extendedPalette: null, disableBanner: null })
        expect(s?.todayQuestsCompleted).toEqual(['easy'])
        expect(s?.todayExportHashes).toEqual(['ok-hash'])
        expect(s?.todayCashbacks).toBe(0)
    })

    it('возвращает null для не-объекта', () => {
        expect(sanitizeEconomyData(null)).toBeNull()
        expect(sanitizeEconomyData(42)).toBeNull()
        expect(sanitizeEconomyData('x')).toBeNull()
    })

    it('валидирует квесты: отбрасывает невалидные, корректные оставляет', () => {
        const s = sanitizeEconomyData({
            todayQuests: [
                { difficulty: 'easy', trigger: 'count_cubes', category: 'composition', target: 5, progress: 3, reward: 20, completed: false },
                { difficulty: 'nope', trigger: 'count_cubes', category: 'composition', target: 5, progress: 3, reward: 20, completed: false },
            ],
        })
        expect(s?.todayQuests).toHaveLength(1)
        expect(s?.todayQuests?.[0].difficulty).toBe('easy')
    })
})

// ─── createExportHash ────────────────────────────────────────────────

describe('createExportHash', () => {
    it('стабилен к порядку ключей и различается при изменении данных', () => {
        const a = createExportHash({ x: 1, y: 2 })
        const b = createExportHash({ y: 2, x: 1 })
        expect(a).toBe(b)
        expect(createExportHash({ x: 1, y: 3 })).not.toBe(a)
    })

    // P1-3: хэш кэшбэка обязан различаться при изменении CSG-структуры (operations)
    it('различается при изменении порядка операндов в operations (P1-3)', () => {
        const objects = [
            { shapeType: 'cube', params: { width: 10 }, transform: { x: 1 } },
            { shapeType: 'cube', params: { width: 10 }, transform: { x: 2 } },
        ]
        const opsA = [
            { type: 'group', ids: ['a', 'b'], resultId: 'r', treeOperation: 'union' },
        ]
        const opsB = [
            { type: 'group', ids: ['b', 'a'], resultId: 'r', treeOperation: 'union' },
        ]
        const hashA = createExportHash({ objects, operations: opsA })
        const hashB = createExportHash({ objects, operations: opsB })
        expect(hashA).not.toBe(hashB)
    })

    it('различается при изменении типа булевой операции (P1-3)', () => {
        const objects = [{ shapeType: 'cube', params: {}, transform: {} }]
        const opsUnion = [{ type: 'group', ids: ['a', 'b'], resultId: 'r', treeOperation: 'union' }]
        const opsSubtract = [{ type: 'group', ids: ['a', 'b'], resultId: 'r', treeOperation: 'subtract' }]
        expect(createExportHash({ objects, operations: opsUnion }))
            .not.toBe(createExportHash({ objects, operations: opsSubtract }))
    })
})

// ─── P1-2: единый подсчёт объектов ──────────────────────────────────

describe('countSceneObjects (P1-2)', () => {
    it('считает ВСЕ объекты, включая import_mesh и text3d', () => {
        const objects = {
            '1': { shapeType: 'cube' },
            '2': { shapeType: 'import_mesh' },
            '3': { shapeType: 'text3d' },
            '4': { shapeType: 'csg' },
        }
        expect(countSceneObjects(objects)).toBe(4)
    })

    it('пустая сцена = 0', () => {
        expect(countSceneObjects({})).toBe(0)
    })
})

// ─── P1-5: единый RO-доступ к 3D-тексту ─────────────────────────────

describe('canUseText3dRO (P1-5)', () => {
    it('без подписки и аренды — false', () => {
        useEconomyStore.setState({
            activeSubscription: null,
            subscriptionExpiresAt: null,
            rentals: { text3d: null, extendedPalette: null, disableBanner: null },
        })
        expect(useEconomyStore.getState().canUseText3dRO()).toBe(false)
    })

    it('активная подписка — true', () => {
        h.setServerTime(1_700_000_000_000)
        useEconomyStore.setState({
            activeSubscription: 'weekly',
            subscriptionExpiresAt: 1_700_000_000_000 + 1000,
            rentals: { text3d: null, extendedPalette: null, disableBanner: null },
        })
        expect(useEconomyStore.getState().canUseText3dRO()).toBe(true)
    })

    it('аренда text3d по серверному времени — true, после expiry — false', () => {
        h.setServerTime(1_700_000_000_000)
        useEconomyStore.setState({
            activeSubscription: null,
            subscriptionExpiresAt: null,
            rentals: { text3d: 1_700_000_000_000 + 1000, extendedPalette: null, disableBanner: null },
        })
        expect(useEconomyStore.getState().canUseText3dRO()).toBe(true)

        // Серверное время перевалило expiry — перевод локальных часов не помогает
        h.setServerTime(1_700_000_000_000 + 2000)
        expect(useEconomyStore.getState().canUseText3dRO()).toBe(false)
    })
})

// ─── P2-3: онбординг через store (persist + syncToCloud) ────────────

describe('completeOnboarding (P2-3)', () => {
    it('устанавливает onboardingDone = true и синхронизирует с облаком', async () => {
        useEconomyStore.setState({ onboardingDone: false })
        useEconomyStore.getState().completeOnboarding()
        expect(useEconomyStore.getState().onboardingDone).toBe(true)
        // Флаг попадает в облако через syncToCloud (debounce).
        await new Promise((r) => setTimeout(r, 0))
        expect(h.saveData).toHaveBeenCalled()
    })

    it('sanitizeEconomyData сохраняет валидный булевый флаг onboardingDone', () => {
        expect(sanitizeEconomyData({ onboardingDone: true })?.onboardingDone).toBe(true)
        expect(sanitizeEconomyData({ onboardingDone: 'yes' })?.onboardingDone).toBe(false)
        expect(sanitizeEconomyData({})?.onboardingDone).toBe(false)
    })

    it('loadFromCloud восстанавливает onboardingDone из облака', async () => {
        useEconomyStore.setState({ onboardingDone: false })
        h.loadData.mockResolvedValueOnce({ onboardingDone: true })
        await useEconomyStore.getState().loadFromCloud()
        expect(useEconomyStore.getState().onboardingDone).toBe(true)
    })
})

// ─── P2-5: событийные квесты показывают полный прогресс ─────────────

describe('completeEventQuest прогресс событийных квестов (P2-5)', () => {
    const quest = {
        difficulty: 'medium' as const,
        trigger: 'export_stl' as const,
        category: 'output' as const,
        target: 1,
        progress: 0,
        reward: 30,
        completed: false,
    }

    it('completeEventQuest ставит progress = target для событийного квеста', () => {
        useEconomyStore.setState({ todayQuests: [quest], todayQuestsCompleted: [] })
        useEconomyStore.getState().completeEventQuest('export_stl', 1)
        const q = useEconomyStore.getState().todayQuests[0]
        expect(q.progress).toBe(q.target)
        expect(q.completed).toBe(true)
    })

    it('evaluateQuests НЕ сбрасывает прогресс событийного квеста (UI показывает target/target)', () => {
        useEconomyStore.setState({ todayQuests: [quest], todayQuestsCompleted: [] })
        useEconomyStore.getState().completeEventQuest('export_stl', 1)
        // Оценка по состоянию проекта (событийные квесты здесь не обновляются —
        // их «прогресс» не должен затираться)
        useEconomyStore.getState().evaluateQuests({}, [])
        const q = useEconomyStore.getState().todayQuests[0]
        expect(q.progress).toBe(1) // target/target → UI показывает 1/1
        expect(q.completed).toBe(true)
    })

    it('evaluateQuests для незавершённого событийного квеста оставляет прогресс 0', () => {
        useEconomyStore.setState({ todayQuests: [quest], todayQuestsCompleted: [] })
        useEconomyStore.getState().evaluateQuests({}, [])
        const q = useEconomyStore.getState().todayQuests[0]
        expect(q.progress).toBe(0)
        expect(q.completed).toBe(false)
    })
})

// ─── P1-1: refreshDayRollover (смена суток без перезагрузки) ────────

describe('refreshDayRollover (P1-1)', () => {
    const quest = {
        difficulty: 'easy' as const,
        trigger: 'count_cubes' as const,
        category: 'composition' as const,
        target: 5,
        progress: 5,
        reward: 20,
        completed: true,
    }

    it('сбрасывает дневные лимиты при смене суток по серверному времени', async () => {
        h.setServerTime(1_700_000_000_000)
        useEconomyStore.setState({
            todayQuests: [quest],
            todayQuestsCompleted: ['easy'],
            lastQuestResetDate: 1_700_000_000_000 - 2 * ONE_DAY_MS, // вчера
            todayAdsWatched: 2,
            todayActions: 5,
            todayCashbacks: 2,
            todayExportHashes: ['h1'],
            questTriggers: { count_cubes: 5 } as never,
        })

        await useEconomyStore.getState().refreshDayRollover()

        const s = useEconomyStore.getState()
        expect(s.todayAdsWatched).toBe(0)
        expect(s.todayActions).toBe(0)
        expect(s.todayCashbacks).toBe(0)
        expect(s.todayExportHashes).toEqual([])
        expect(s.todayQuestsCompleted).toEqual([])
        expect(s.todayQuests.length).toBeGreaterThan(0) // сгенерированы новые
    })

    it('НЕ сбрасывает лимиты, если день не сменился', async () => {
        h.setServerTime(1_700_000_000_000)
        useEconomyStore.setState({
            todayQuests: [quest],
            todayQuestsCompleted: ['easy'],
            lastQuestResetDate: 1_700_000_000_000, // сегодня
            todayAdsWatched: 2,
            todayActions: 5,
            todayCashbacks: 2,
            todayExportHashes: ['h1'],
        })

        await useEconomyStore.getState().refreshDayRollover()

        const s = useEconomyStore.getState()
        expect(s.todayAdsWatched).toBe(2)
        expect(s.todayActions).toBe(5)
        expect(s.todayCashbacks).toBe(2)
        expect(s.todayExportHashes).toEqual(['h1'])
        expect(s.todayQuests[0].trigger).toBe('count_cubes') // квесты не пересозданы
    })
})

// ─── P1-6: частичный просмотр рекламы импорта ───────────────────────

describe('watchAdsForImport частичная серия (P1-6)', () => {
    it('начисляет +50 за КАЖДЫЙ показанный ролик, даже если серия не завершена', async () => {
        h.setServerTime(1_700_000_000_000)
        useEconomyStore.setState({ tokens: 100, todayAdsWatched: 0, lastAdTimestamp: null })
        h.platform.showRewardedVideo.mockReset()

        // 1-я реклама успешно просмотрена, 2-я — отказ
        h.platform.showRewardedVideo
            .mockResolvedValueOnce(true)
            .mockResolvedValueOnce(false)

        const ok = await useEconomyStore.getState().watchAdsForImport(2)
        expect(ok).toBe(false) // серия не завершена — импорт не оплачен

        const s = useEconomyStore.getState()
        expect(s.tokens).toBe(100 + EARNINGS_AD_REWARDED) // первая начислена
        expect(s.todayAdsWatched).toBe(1) // учтён 1 показ
    })

    it('полная серия (2 показа) — начисляет 2×+50 и возвращает true', async () => {
        h.setServerTime(1_700_000_000_000)
        useEconomyStore.setState({ tokens: 100, todayAdsWatched: 0, lastAdTimestamp: null })
        h.platform.showRewardedVideo.mockReset()

        h.platform.showRewardedVideo
            .mockResolvedValueOnce(true)
            .mockResolvedValueOnce(true)

        const ok = await useEconomyStore.getState().watchAdsForImport(2)
        expect(ok).toBe(true)

        const s = useEconomyStore.getState()
        expect(s.tokens).toBe(100 + EARNINGS_AD_REWARDED * 2)
        expect(s.todayAdsWatched).toBe(2)
    })

    it('уважает дневной лимит 3/день: при todayAdsWatched=3 не показывает рекламу', async () => {
        useEconomyStore.setState({ tokens: 100, todayAdsWatched: LIMITS.adsPerDay, lastAdTimestamp: null })
        const ok = await useEconomyStore.getState().watchAdsForImport(2)
        expect(ok).toBe(false)
        expect(useEconomyStore.getState().tokens).toBe(100)
    })
})

// ─── P1-7: реклама баннера и общий лимит 3/день ─────────────────────

describe('watchAdForBanner лимит (P1-7)', () => {
    it('увеличивает todayAdsWatched и активирует аренду disableBanner', async () => {
        h.setServerTime(1_700_000_000_000)
        useEconomyStore.setState({ todayAdsWatched: 1, lastAdTimestamp: null, rentals: { text3d: null, extendedPalette: null, disableBanner: null } })

        h.platform.showRewardedVideo.mockResolvedValueOnce(true)

        const res = await useEconomyStore.getState().watchAdForBanner()
        expect(res.ok).toBe(true)

        const s = useEconomyStore.getState()
        expect(s.todayAdsWatched).toBe(2) // учтён в общем лимите 3/день
        expect(s.rentals.disableBanner).not.toBeNull()
    })

    it('отклоняет рекламу баннера при исчерпанном лимите 3/день', async () => {
        useEconomyStore.setState({ todayAdsWatched: LIMITS.adsPerDay, lastAdTimestamp: null })
        h.platform.showRewardedVideo.mockClear() // изолируем от предыдущих тестов
        const res = await useEconomyStore.getState().watchAdForBanner()
        expect(res.ok).toBe(false)
        expect(h.platform.showRewardedVideo).not.toHaveBeenCalled()
    })
})

// ─── P1-9: csg_complex учитывает subtract/intersect ─────────────────

describe('evaluateQuests csg_complex (P1-9)', () => {
    const makeObj = (id: string, shapeType: string, children?: string[]): SceneObject => ({
        id,
        shapeType: shapeType as SceneObject['shapeType'],
        params: {},
        color: '#89b4fa',
        transform: { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 },
        visible: true,
        locked: false,
        vertices: new Float32Array(),
        indices: new Uint32Array(),
        ...(children ? { children } : {}),
    })

    it('учитывает дерево из операций group с intersect/subtract', () => {
        h.setServerTime(1_700_000_000_000)
        const objects: Record<string, SceneObject> = {
            'abc': makeObj('abc', 'csg'),
            'c': makeObj('c', 'cube'),
        }
        // (A∪B) ∩ C — итоговый CSG 'abc' имеет 3 листа-операнда
        const operations: TinkerCraftOperation[] = [
            { type: 'group', ids: ['a', 'b'], resultId: 'ab', treeOperation: 'union' },
            { type: 'group', ids: ['ab', 'c'], resultId: 'abc', treeOperation: 'intersect' },
        ] as unknown as TinkerCraftOperation[]

        useEconomyStore.setState({
            todayQuests: [{
                difficulty: 'hard',
                trigger: 'csg_complex',
                category: 'boolean',
                target: 1,
                progress: 0,
                reward: 50,
                completed: false,
            }],
            todayQuestsCompleted: [],
        })

        useEconomyStore.getState().evaluateQuests(objects, operations)

        const quest = useEconomyStore.getState().todayQuests[0]
        expect(quest.progress).toBeGreaterThanOrEqual(1)
        expect(quest.completed).toBe(true)
    })

    it('учитывает SceneObject.children (subtract создаёт CSG-результат с детьми)', () => {
        const objects: Record<string, SceneObject> = {
            'r': makeObj('r', 'csg', ['a', 'b', 'c']),
        }
        useEconomyStore.setState({
            todayQuests: [{
                difficulty: 'hard',
                trigger: 'csg_complex',
                category: 'boolean',
                target: 1,
                progress: 0,
                reward: 50,
                completed: false,
            }],
            todayQuestsCompleted: [],
        })

        useEconomyStore.getState().evaluateQuests(objects, [])

        const quest = useEconomyStore.getState().todayQuests[0]
        expect(quest.completed).toBe(true)
    })
})
