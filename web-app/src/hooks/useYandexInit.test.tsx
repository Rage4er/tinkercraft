// src/hooks/useYandexInit.test.tsx — Gameplay API: пауза при ЛЮБОЙ открытой модалке
// (текст, проекты, экспорт, импорт, аренда, онбординг).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react-dom/test-utils'

const h = vi.hoisted(() => ({
    platform: {
        startGameplay: vi.fn(),
        stopGameplay: vi.fn(),
        loadingReady: vi.fn(),
    },
}))

vi.mock('../platform', () => ({
    getPlatform: () => h.platform,
    initPlatform: async () => true,
    isEconomyAvailable: () => true,
}))
vi.mock('../platform/sdk', () => ({ getInitDonePromise: () => Promise.resolve() }))
vi.mock('../platform/debug-mode', () => ({
    applyDebugTokensGrant: async () => { },
    installEconomyDebugHelper: async () => { },
}))
vi.mock('../store/economy-store', () => ({
    useEconomyStore: {
        getState: () => ({
            loadFromCloud: async () => { },
            initDailyQuests: async () => { },
            checkSubscriptionExpiry: () => { },
            shouldShowBannerRO: () => false,
            setBannerVisible: () => { },
            syncPlatformBanner: async () => { },
            syncToCloud: async () => { },
            refreshDayRollover: async () => { },
        }),
    },
}))

import { useUiStore } from '../store/ui-store'
import { useYandexInit, isAnyModalOpen, type ModalFlags } from './useYandexInit'

const closed: ModalFlags = {
    showTextModal: false, showPM: false, showExportModal: false,
    showImportModal: false, rentalModalKey: null, onboardingOpen: false,
}

describe('isAnyModalOpen', () => {
    it('все закрыты → false', () => {
        expect(isAnyModalOpen(closed)).toBe(false)
    })

    it.each([
        ['showTextModal', true],
        ['showPM', true],
        ['showExportModal', true],
        ['showImportModal', true],
        ['rentalModalKey', 'text3d'],
        ['rentalModalKey', 'extendedPalette'],
        ['onboardingOpen', true],
    ] as const)('%s=%s → true', (key, value) => {
        expect(isAnyModalOpen({ ...closed, [key]: value })).toBe(true)
    })
})

describe('useYandexInit: Gameplay API', () => {
    function Harness() {
        useYandexInit()
        return null
    }
    const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve() })

    const roots: Array<{ unmount: () => void }> = []
    afterEach(() => {
        act(() => { roots.splice(0).forEach(r => r.unmount()) })
    })

    beforeEach(() => {
        document.body.innerHTML = ''
        h.platform.startGameplay.mockClear()
        h.platform.stopGameplay.mockClear()
        useUiStore.setState({
            showTextModal: false, showPM: false, showExportModal: false,
            showImportModal: false, rentalModalKey: null, onboardingOpen: false,
        })
    })

    async function mount() {
        const root = createRoot(document.body.appendChild(document.createElement('div')))
        await act(async () => { root.render(<Harness />) })
        await flush()
        roots.push(root)
        return root
    }

    it('без модалок вызывает startGameplay', async () => {
        await mount()
        expect(h.platform.startGameplay).toHaveBeenCalled()
        expect(h.platform.stopGameplay).not.toHaveBeenCalled()
    })

    it.each([
        ['импорт', { showImportModal: true }],
        ['аренда', { rentalModalKey: 'text3d' as const }],
        ['онбординг', { onboardingOpen: true }],
        ['экспорт', { showExportModal: true }],
    ])('модалка «%s» → stopGameplay, закрытие → startGameplay', async (_n, flags) => {
        await mount()
        h.platform.startGameplay.mockClear()
        await act(async () => { useUiStore.setState(flags) })
        await flush()
        expect(h.platform.stopGameplay).toHaveBeenCalledTimes(1)

        const reset = Object.fromEntries(Object.keys(flags).map(k => [k, k === 'rentalModalKey' ? null : false]))
        await act(async () => { useUiStore.setState(reset) })
        await flush()
        expect(h.platform.startGameplay).toHaveBeenCalledTimes(1)
    })
})
