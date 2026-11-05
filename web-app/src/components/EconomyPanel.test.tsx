// src/components/EconomyPanel.test.tsx — Y.1: режим экономики в правой панели
// (EconomyModeSection + useEconomyModeReset), вынесенные из PropertiesPanel.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react-dom/test-utils'

vi.mock('../platform', () => ({
    getPlatform: () => null,
    isEconomyAvailable: () => true,
    getPlatformType: () => 'yandex',
    initPlatform: async () => true,
}))
vi.mock('../platform/server-time', () => ({
    getServerTime: async () => 1_700_000_000_000,
    getCachedServerTime: () => 1_700_000_000_000,
    resetServerTimeCache: () => { },
    getServerTimeOffset: () => 0,
}))
vi.mock('../platform/ad-timers', () => ({
    useAdCooldown: () => ({ remainingMs: 0, formatted: null, active: false }),
    useDailyReset: () => ({ remainingMs: 0, formatted: null }),
}))

import { useUiStore } from '../store/ui-store'
import { EconomyModeSection, useEconomyModeReset } from './EconomyPanel'

function Harness({ selectedId }: { selectedId: string | null }) {
    useEconomyModeReset(selectedId)
    return <EconomyModeSection />
}

function mount(selectedId: string | null) {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    const render = (id: string | null) => act(() => { root.render(<Harness selectedId={id} />) })
    render(selectedId)
    return { container, render }
}

describe('EconomyModeSection / useEconomyModeReset', () => {
    beforeEach(() => {
        document.body.innerHTML = ''
        useUiStore.setState({ economyPanelOpen: false })
    })

    it('не рендерит кнопку «назад», пока economyPanelOpen = false', () => {
        const { container } = mount('a')
        expect(container.querySelector('button.btn-compact')).toBeNull()
    })

    it('показывает режим экономики и закрывает его по кнопке «назад»', () => {
        // «Купить» из LeftPanel/палитры выставляет флаг при уже выбранном объекте
        const { container } = mount('a')
        act(() => { useUiStore.getState().setEconomyPanelOpen(true) })
        const back = container.querySelector('button.btn-compact') as HTMLButtonElement | null
        expect(back).not.toBeNull()
        act(() => { back!.click() })
        expect(useUiStore.getState().economyPanelOpen).toBe(false)
    })

    it('сохраняет режим экономики при том же выделении', () => {
        const { render } = mount('a')
        act(() => { useUiStore.getState().setEconomyPanelOpen(true) })
        render('a')
        expect(useUiStore.getState().economyPanelOpen).toBe(true)
    })

    it('закрывает режим экономики при смене выбранного объекта (B3)', () => {
        const { render } = mount('a')
        act(() => { useUiStore.getState().setEconomyPanelOpen(true) })
        render('b')
        expect(useUiStore.getState().economyPanelOpen).toBe(false)
    })
})
