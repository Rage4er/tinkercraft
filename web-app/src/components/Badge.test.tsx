// src/components/Badge.test.tsx — UB2-3b: иконка 14px ВНУТРИ контейнера (без overflow)
import { describe, it, expect } from 'vitest'
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import Badge from './Badge'

/** Рендер компонента в DOM-контейнер (без @testing-library) */
function renderToContainer(el: React.ReactElement): { container: HTMLElement; root: Root } {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    act(() => { root.render(el) })
    return { container, root }
}

/** Размеры SVG-иконок внутри бейджа */
function iconSizes(container: HTMLElement): number[] {
    return Array.from(container.querySelectorAll('svg'))
        .map((svg) => [Number(svg.getAttribute('width')), Number(svg.getAttribute('height'))])
        .flat()
}

describe('Badge (UB2-3b: иконка 14px внутри контейнера)', () => {
    it('рендерит корону 14×14 при активном доступе', () => {
        const { container, root } = renderToContainer(<Badge type="tokens" value="75" isActive />)
        expect(iconSizes(container)).toEqual([14, 14])
        act(() => { root.unmount() })
    })

    it('рендерит TokenIcon 14×14 и число при отсутствии доступа', () => {
        const { container, root } = renderToContainer(<Badge type="tokens" value="75" />)
        expect(iconSizes(container)).toEqual([14, 14])
        expect(container.textContent).toContain('75')
        act(() => { root.unmount() })
    })

    it('рендерит AdFilmIcon 14×14 и число без доступа к рекламе', () => {
        const { container, root } = renderToContainer(<Badge type="ad" value="1" />)
        expect(iconSizes(container)).toEqual([14, 14])
        expect(container.textContent).toContain('1')
        act(() => { root.unmount() })
    })

    it('рендерит ClockIcon 14×14 при кулдауне', () => {
        const { container, root } = renderToContainer(<Badge type="cooldown" value="0:30" />)
        expect(iconSizes(container)).toEqual([14, 14])
        act(() => { root.unmount() })
    })

    it('рендерит CrownIcon 14×14 для pro-бейджа', () => {
        const { container, root } = renderToContainer(<Badge type="pro" />)
        expect(iconSizes(container)).toEqual([14, 14])
        act(() => { root.unmount() })
    })

    it('возвращает null без type', () => {
        const { container, root } = renderToContainer(<Badge type={undefined as never} />)
        expect(container.innerHTML).toBe('')
        act(() => { root.unmount() })
    })

    it('UB2-3b: контейнер вмещает иконку (шрифт 8px, padding 1px 3px, без overflow)', () => {
        const { container, root } = renderToContainer(<Badge type="tokens" value="75" />)
        const badge = container.querySelector('span[style]') as HTMLElement | null
        expect(badge?.style.fontSize).toBe('8px')
        expect(badge?.style.padding).toBe('1px 3px')
        expect(badge?.style.minWidth).toBe('14px')
        expect(badge?.style.minHeight).toBe('12px')
        // UB2-3b: иконка больше НЕ выходит за границы контейнера
        expect(badge?.style.overflow).not.toBe('visible')
        expect(iconSizes(container)).toEqual([14, 14])
        act(() => { root.unmount() })
    })

    it('C2: бейдж токенов использует золотой куб (TokenIcon), а не монету', () => {
        const { container, root } = renderToContainer(<Badge type="tokens" value="75" />)
        // TokenIcon — это svg с гранями куба; ищем первый svg
        const svg = container.querySelector('svg')
        // Токен-куб содержит path с fill rgba(251, 191, 36, …) — золотая заливка
        const goldPath = Array.from(container.querySelectorAll('path'))
            .some((p) => (p.getAttribute('fill') ?? '').includes('rgba(251, 191, 36'))
        expect(svg).not.toBeNull()
        expect(goldPath).toBe(true)
        act(() => { root.unmount() })
    })

    // UB3-4: заливка убрана у ВСЕХ бейджей (перекрывали кнопки тулбара),
    // токен остаётся золотым за счёт intrinsic-заливки самого TokenIcon.
    it('UB3-4: ни один тип бейджа не имеет фона и тени', () => {
        const cases: Array<Parameters<typeof Badge>[0]> = [
            { type: 'tokens', value: '75' },
            { type: 'tokens', value: '75', isActive: true },
            { type: 'ad', value: '1' },
            { type: 'ad', value: '1', isActive: true },
            { type: 'cooldown', value: '0:30' },
            { type: 'pro' },
        ]
        for (const props of cases) {
            const { container, root } = renderToContainer(<Badge {...props} />)
            const badge = container.querySelector('span[style]') as HTMLElement | null
            expect(badge).not.toBeNull()
            expect(badge!.style.background).toBe('')
            expect(badge!.style.backgroundColor).toBe('')
            expect(badge!.style.boxShadow).toBe('')
            // читаемость цифры — двойная обводка (тёмная + светлая)
            expect(badge!.style.textShadow).not.toBe('')
            act(() => { root.unmount() })
        }
    })
})
