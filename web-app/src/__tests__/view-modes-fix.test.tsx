// ============================================================
// view-modes-fix.test.tsx — FIX: реалистичный режим после каркаса/скрытых линий
// ============================================================
// После wireframe/hidden-line realistic обязан вернуть заливку: непрозрачный
// материал, тени, без принудительных рёбер. Кнопка режима не накладывается
// (позиция — над ViewCube, z-index 12).

import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import i18n from '../i18n'
import ViewModeMenu from '../components/ViewModeMenu'
import { viewModeRender } from '../components/view-mode'
import { useUiStore } from '../store/ui-store'

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

describe('VIEW-MODES — реалистичный после wireframe / hidden-line', () => {
  it('возвращает непрозрачную заливку, тени и рёбра UB2-4 с depthTest (без просвечивания)', () => {
    act(() => { useUiStore.getState().setViewMode('wireframe') })
    act(() => { useUiStore.getState().setViewMode('hidden-line') })
    act(() => { useUiStore.getState().setViewMode('realistic') })
    expect(useUiStore.getState().viewMode).toBe('realistic')
    const s = viewModeRender('realistic')
    expect(s).toMatchObject({
      materialVisible: true,
      transparent: false,
      opacity: 1,
      shadows: true,
      // UB2-4: рёбра намеренно видны в реалистичном виде, но обычная глубина —
      // задние/сквозь грани не просвечивают (в wireframe depthTest выключен)
      edges: true,
      edgeDepthTest: true,
      edgeDepthWrite: true,
      edgeRenderOrder: 0,
    })
    expect(viewModeRender('wireframe')).toMatchObject({ edges: true, edgeDepthTest: false, edgeDepthWrite: false, edgeRenderOrder: 2 })
    expect(viewModeRender('hidden-line')).toMatchObject({ edges: true, edgeDepthTest: true, edgeDepthWrite: false, edgeRenderOrder: 2 })
  })

  it('кнопка режима — над ViewCube, z-index 12 (не накладывается на панель шага)', () => {
    host = document.body.appendChild(document.createElement('div'))
    root = createRoot(host)
    act(() => { root!.render(<ViewModeMenu />) })
    const wrap = host.querySelector<HTMLElement>('[data-testid=view-mode-menu-wrap]')!
    expect(wrap.style.bottom).toBe('148px')
    expect(wrap.style.right).toBe('8px')
    expect(wrap.style.zIndex).toBe('12')
  })
})
