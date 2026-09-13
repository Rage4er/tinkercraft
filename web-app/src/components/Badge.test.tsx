// src/components/Badge.test.tsx — U7: иконки бейджей увеличены в 2 раза (10 → 20px)
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

describe('Badge (U7: иконки 20px)', () => {
    it('рендерит корону 20×20 при активном доступе', () => {
        const { container, root } = renderToContainer(<Badge type="tokens" value="75" isActive />)
        expect(iconSizes(container)).toEqual([20, 20])
        act(() => { root.unmount() })
    })

    it('рендерит MoneyIcon 20×20 и число при отсутствии доступа', () => {
        const { container, root } = renderToContainer(<Badge type="tokens" value="75" />)
        expect(iconSizes(container)).toEqual([20, 20])
        expect(container.textContent).toContain('75')
        act(() => { root.unmount() })
    })

    it('рендерит AdFilmIcon 20×20 без доступа к рекламе', () => {
        const { container, root } = renderToContainer(<Badge type="ad" value="1" />)
        expect(iconSizes(container)).toEqual([20, 20])
        act(() => { root.unmount() })
    })

    it('рендерит ClockIcon 20×20 при кулдауне', () => {
        const { container, root } = renderToContainer(<Badge type="cooldown" value="0:30" />)
        expect(iconSizes(container)).toEqual([20, 20])
        act(() => { root.unmount() })
    })

    it('рендерит CrownIcon 20×20 для pro-бейджа', () => {
        const { container, root } = renderToContainer(<Badge type="pro" />)
        expect(iconSizes(container)).toEqual([20, 20])
        act(() => { root.unmount() })
    })

    it('возвращает null без type', () => {
        const { container, root } = renderToContainer(<Badge type={undefined as never} />)
        expect(container.innerHTML).toBe('')
        act(() => { root.unmount() })
    })

    it('шрифт текста увеличен до 16px (вместо 10px)', () => {
        const { container, root } = renderToContainer(<Badge type="tokens" value="75" />)
        const badge = container.querySelector('span[style]') as HTMLElement | null
        expect(badge?.style.fontSize).toBe('16px')
        act(() => { root.unmount() })
    })
})
