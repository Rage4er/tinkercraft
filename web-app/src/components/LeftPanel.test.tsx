// src/components/LeftPanel.test.tsx — U4: бейдж 3D-текста (type:'text') показывается
import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import { ALL_SHAPES } from '../constants.tsx'

// ─── Мок экономики: useEconomyStore — хук с селектором ────────────────
const h = vi.hoisted(() => {
    const state = {
        tokens: 100,
        canUseText3dRO: () => false,
    }
    return {
        state,
        setTextActive: (v: boolean) => { state.canUseText3dRO = () => v },
    }
})

vi.mock('../store/economy-store', () => ({
    useEconomyStore: <T,>(selector: (s: typeof h.state) => T): T => selector(h.state),
}))

// LeftPanel импортирует isEconomyAvailable из '../platform'
vi.mock('../platform', () => ({
    isEconomyAvailable: () => true,
}))

// U3: левая вкладка «магазин» (EconomyShop) удалена — точек продаж слева больше нет
import LeftPanel from './LeftPanel'

/** Рендер LeftPanel с минимальными props */
function renderLeftPanel() {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    act(() => {
        root.render(
            <LeftPanel
                shapeSearch=""
                onShapeSearchChange={() => { }}
                workerOk
                busy={false}
                onAddShape={() => { }}
                onShowTextModal={() => { }}
                objectList={[]}
                selSet={new Set()}
                activeTab="objects"
                onTabChange={() => { }}
                onSelect={() => { }}
                onRename={() => { }}
                onToggleVis={() => { }}
                onDeleteObject={() => { }}
                historyIndex={0}
                operations={[]}
                tlFilters={{}}
                onFilterChange={() => { }}
                onJumpHistory={() => { }}
            />
        )
    })
    return { container, root }
}

describe('LeftPanel (U4: бейдж 3D-текста)', () => {
    beforeEach(() => {
        h.setTextActive(false)
    })

    it('ALL_SHAPES содержит фигуру с type:"text" (палитра)', () => {
        const textShape = ALL_SHAPES.find((s) => s.type === 'text')
        expect(textShape).toBeTruthy()
        // В палитре фигур тип — "text", не "text3d"
        expect(ALL_SHAPES.some((s) => s.type === 'text3d')).toBe(false)
    })

    it('рендерит бейдж с 75 токенами у кнопки 3D-текста', () => {
        const { container, root } = renderLeftPanel()
        // Найти кнопку с label "Text" (shapes.text → en: "Text")
        const buttons = Array.from(container.querySelectorAll('.shape-btn'))
        const textBtn = buttons.find((b) => b.textContent?.includes('Text'))
        expect(textBtn).toBeTruthy()
        // Бейдж с числом 75 присутствует
        expect(textBtn?.textContent).toContain('75')
        act(() => { root.unmount() })
    })

    it('бейдж НЕ показывается на других фигурах', () => {
        const { container, root } = renderLeftPanel()
        const buttons = Array.from(container.querySelectorAll('.shape-btn'))
        const nonText = buttons.filter((b) => !b.textContent?.includes('Text'))
        for (const btn of nonText) {
            expect(btn.textContent).not.toContain('75')
        }
        act(() => { root.unmount() })
    })
})
