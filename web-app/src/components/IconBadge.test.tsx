// src/components/IconBadge.test.tsx — UB2-3b: иконка 16px в контейнере под неё
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

describe('IconBadge (UB2-3b: иконка 16px, компактный контейнер)', () => {
    it('рендерит TokenIcon 16×16', () => {
        const { container, root } = renderToContainer(<IconBadge type="tokens" label="75" />)
        expect(iconSizes(container)).toEqual([16, 16])
        act(() => { root.unmount() })
    })

    it('рендерит AdFilmIcon 16×16', () => {
        const { container, root } = renderToContainer(<IconBadge type="ad" />)
        expect(iconSizes(container)).toEqual([16, 16])
        act(() => { root.unmount() })
    })

    it('рендерит ClockIcon 16×16 для timer', () => {
        const { container, root } = renderToContainer(<IconBadge type="timer" label="0:30" />)
        expect(iconSizes(container)).toEqual([16, 16])
        expect(container.textContent).toContain('0:30')
        act(() => { root.unmount() })
    })

    it('рендерит CrownIcon 16×16 для crown', () => {
        const { container, root } = renderToContainer(<IconBadge type="crown" />)
        expect(iconSizes(container)).toEqual([16, 16])
        act(() => { root.unmount() })
    })

    it('UB2-3b: шрифт и padding компактные (9px, 1px 3px)', () => {
        const { container, root } = renderToContainer(<IconBadge type="timer" label="0:30" />)
        const badge = container.querySelector('.icon-badge') as HTMLElement | null
        expect(badge?.style.fontSize).toBe('9px')
        expect(badge?.style.padding).toBe('1px 3px')
        act(() => { root.unmount() })
    })

    it('C1: pointer-events none на контейнере', () => {
        const { container, root } = renderToContainer(<IconBadge type="tokens" label="75" />)
        const badge = container.querySelector('.icon-badge') as HTMLElement | null
        expect(badge?.style.pointerEvents).toBe('none')
        act(() => { root.unmount() })
    })
})
