// ============================================================
// toolbar-aria.test.tsx — ALIGN-REVIT: доступное имя у каждой кнопки тулбара
// ============================================================
// Раньше IconButton без явного ariaLabel/title давал aria-label="" — кнопки тулбара
// были безымянными, e2e брали их по индексу (зеркало — 17-я, импорт STL — 4-я).
// Теперь имя — подпись тултипа (labelKey): непустое, уникальное в тулбаре, ru/en.

import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import i18n from '../i18n'
import Toolbar from '../components/Toolbar'

beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  if (!('ResizeObserver' in globalThis)) {
    class RO { observe(): void {} unobserve(): void {} disconnect(): void {} }
    ;(globalThis as unknown as { ResizeObserver: typeof RO }).ResizeObserver = RO
  }
})

let root: Root | null = null
let host: HTMLDivElement | null = null
afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = null; host = null
})

const noop = (): void => {}

async function renderToolbar(lang: 'ru' | 'en'): Promise<HTMLButtonElement[]> {
  await i18n.changeLanguage(lang)
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => {
    root!.render(
      <Toolbar
        objectCount={2} selectedCount={2} canUndo canRedo hasCopied busy={false} workerOk
        cameraMode="perspective" gizmoMode="translate" rulerActive={false} dimensionActive={false} dimensionsVisible
        canMirror canAlign canCsg theme="dark"
        onOpen={noop} onSave={noop} onExportStl={noop} onImportStl={noop} onShowProjects={noop}
        onUndo={noop} onRedo={noop} onCopy={noop} onPaste={noop} onDelete={noop}
        onFitView={noop} onResetView={noop} onToggleCamera={noop} onGizmo={noop} onToggleRuler={noop}
        onDimensionMode={noop} onDimensionSettings={noop} onToggleDimensions={noop}
        onMirror={noop} onPreviewMirror={noop} onPreviewMirrorEnd={noop}
        alignActive={false} onAlignMode={noop} onCsg={noop} onToggleTheme={noop} onClearScene={noop}
      />,
    )
  })
  return Array.from(host.querySelectorAll<HTMLButtonElement>('[role="toolbar"] button'))
}

describe('Toolbar aria-label (ALIGN-REVIT)', () => {
  for (const lang of ['ru', 'en'] as const) {
    it(`${lang}: у всех кнопок тулбара непустой и уникальный aria-label`, async () => {
      const buttons = await renderToolbar(lang)
      // file 5 + edit 2+3 + view 3 + gizmo 4 (с «выход») + ruler 1 + «Размер» 1 (DIMENSIONS, меню) + mirror 3 + align 1 (ALIGN-UI-REVIT) + «Массив» 1 (ARRAY-TOOL) + csg 3 + theme 1 + clear 1
      expect(buttons.length).toBe(29)
      const names = buttons.map((b) => b.getAttribute('aria-label') ?? '')
      const empty = buttons.filter((b) => !(b.getAttribute('aria-label') ?? '').trim()).map((b) => b.outerHTML.slice(0, 80))
      expect(empty).toEqual([])
      expect(new Set(names).size).toBe(names.length)
      // ключ i18n не должен утекать вместо перевода
      expect(names.filter((n) => /^[a-z]+\.[a-z_]+$/i.test(n))).toEqual([])
    })
  }

  it('ru: список имён — снимок (перестановка кнопок не ломает e2e, переименование видно здесь)', async () => {
    const names = (await renderToolbar('ru')).map((b) => b.getAttribute('aria-label'))
    expect(names).toMatchSnapshot()
  })

  it('кнопки, на которые опираются e2e, находятся по имени', async () => {
    const names = new Set((await renderToolbar('ru')).map((b) => b.getAttribute('aria-label')))
    for (const key of ['mirror.yz', 'actions.import', 'alignMode.button', 'csg.union', 'dimensions.button', 'array.button']) {
      expect(names.has(i18n.t(key))).toBe(true)
    }
  })
})
