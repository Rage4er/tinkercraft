// ============================================================
// view-modes.test.tsx — VIEW-MODES: режимы отображения (state, меню, настройки)
// ============================================================

import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import i18n from '../i18n'
import ViewModeMenu from '../components/ViewModeMenu'
import { viewModeRender } from '../components/view-mode'
import { useUiStore, VIEW_MODE_STORAGE_KEY, VIEW_MODES } from '../store/ui-store'

beforeAll(async () => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  await i18n.changeLanguage('ru')
})

let root: Root | null = null
let host: HTMLDivElement | null = null
beforeEach(() => {
  localStorage.clear()
  act(() => { useUiStore.getState().setViewMode('realistic') })
})
afterEach(() => {
  if (root) act(() => root!.unmount())
  root = null; host?.remove(); host = null
})

const mount = () => {
  host = document.body.appendChild(document.createElement('div'))
  root = createRoot(host)
  act(() => { root!.render(<ViewModeMenu />) })
  return host
}

describe('VIEW-MODES — state и меню', () => {
  it('viewMode: 3 режима, setViewMode сохраняет в localStorage', () => {
    expect(VIEW_MODES).toEqual(['realistic', 'wireframe', 'hidden-line'])
    expect(useUiStore.getState().viewMode).toBe('realistic')
    act(() => { useUiStore.getState().setViewMode('wireframe') })
    expect(useUiStore.getState().viewMode).toBe('wireframe')
    expect(localStorage.getItem(VIEW_MODE_STORAGE_KEY)).toBe('wireframe')
    act(() => { useUiStore.getState().setViewMode('hidden-line') })
    expect(localStorage.getItem(VIEW_MODE_STORAGE_KEY)).toBe('hidden-line')
  })

  it('меню: кнопка → три пункта, выбор применяется и отмечается галочкой', () => {
    mount()
    const btn = host!.querySelector<HTMLButtonElement>('[data-testid=view-mode-button]')!
    expect(btn.getAttribute('aria-label')).toBe('Режим отображения')
    act(() => { btn.click() })
    const menu = document.querySelector('[data-testid=view-mode-menu]')!
    expect(menu).toBeTruthy()
    const items = menu.querySelectorAll('[role=menuitemradio]')
    expect(items.length).toBe(3)
    expect(Array.from(items).map((i) => i.textContent)).toEqual([
      '✓Реалистичный', 'Каркас', 'Скрытые линии',
    ])
    act(() => { (menu.querySelector('[data-testid=view-mode-wireframe]') as HTMLButtonElement).click() })
    expect(useUiStore.getState().viewMode).toBe('wireframe')
    expect(localStorage.getItem(VIEW_MODE_STORAGE_KEY)).toBe('wireframe')
    act(() => { host!.querySelector<HTMLButtonElement>('[data-testid=view-mode-button]')!.click() })
    const menu2 = document.querySelector('[data-testid=view-mode-menu]')!
    expect(menu2.querySelector('[data-testid=view-mode-wireframe]')!.getAttribute('aria-checked')).toBe('true')
    expect(menu2.querySelector('[data-testid=view-mode-realistic]')!.getAttribute('aria-checked')).toBe('false')
  })
})

describe('VIEW-MODES — настройки отрисовки', () => {
  it('realistic: заливка, тени, рёбра UB2-4 видны, но с depthTest (сквозь грани не просвечивают)', () => {
    expect(viewModeRender('realistic')).toMatchObject({
      materialVisible: true, useBackgroundColor: false, shadows: true,
      edges: true, edgeDepthTest: true, edgeDepthWrite: true, edgeRenderOrder: 0,
    })
  })

  it('wireframe: без заливки и теней, рёбра без depthTest (задние видны)', () => {
    expect(viewModeRender('wireframe')).toMatchObject({
      materialVisible: false, shadows: false, edges: true, edgeDepthTest: false,
    })
  })

  it('hidden-line: заливка цветом фона, без теней, рёбра с depthTest (задние скрыты)', () => {
    expect(viewModeRender('hidden-line')).toMatchObject({
      materialVisible: true, useBackgroundColor: true, shadows: false, edges: true, edgeDepthTest: true,
    })
  })
})
