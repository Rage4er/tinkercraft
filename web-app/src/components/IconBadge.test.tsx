// src/components/IconBadge.test.tsx — C1: компактный контейнер, иконка 20px
import { describe, it, expect } from 'vitest'
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import IconBadge from './IconBadge'

function renderToContainer(el: React.ReactElement): { container: HTMLElement; root: Root } {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    act(() => { root.render(el) })
    return { container, root }
}

function iconSizes(container: HTMLElement): number[] {
    return Array.from(container.querySelectorAll('svg'))
        .map((svg) => [Number(svg.getAttribute('width')), Number(svg.getAttribute('height'))])
        .flat()
}

describe('IconBadge (C1: компактный контейнер, иконка 20px)', () => {
    it('рендерит TokenIcon 20×20', () => {
        const { container, root } = renderToContainer(<IconBadge type="tokens" label="75" />)
        expect(iconSizes(container)).toEqual([20, 20])
        act(() => { root.unmount() })
    })

    it('рендерит AdFilmIcon 20×20', () => {
        const { container, root } = renderToContainer(<IconBadge type="ad" />)
        expect(iconSizes(container)).toEqual([20, 20])
        act(() => { root.unmount() })
    })

    it('рендерит ClockIcon 20×20 для timer', () => {
        const { container, root } = renderToContainer(<IconBadge type="timer" label="0:30" />)
        expect(iconSizes(container)).toEqual([20, 20])
        expect(container.textContent).toContain('0:30')
        act(() => { root.unmount() })
    })

    it('рендерит CrownIcon 20×20 для crown', () => {
        const { container, root } = renderToContainer(<IconBadge type="crown" />)
        expect(iconSizes(container)).toEqual([20, 20])
        act(() => { root.unmount() })
    })

    it('C1: шрифт и padding компактные (10px, 2px 4px)', () => {
        const { container, root } = renderToContainer(<IconBadge type="timer" label="0:30" />)
        const badge = container.querySelector('.icon-badge') as HTMLElement | null
        expect(badge?.style.fontSize).toBe('10px')
        expect(badge?.style.padding).toBe('2px 4px')
        act(() => { root.unmount() })
    })

    it('C1: pointer-events none на контейнере', () => {
        const { container, root } = renderToContainer(<IconBadge type="tokens" label="75" />)
        const badge = container.querySelector('.icon-badge') as HTMLElement | null
        expect(badge?.style.pointerEvents).toBe('none')
        act(() => { root.unmount() })
    })
})
