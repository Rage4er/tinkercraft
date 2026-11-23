// ============================================================
// settings-button.test.tsx — UI-SETTINGS-BUTTON: «Настройки» в тулбаре + язык в окне
// ============================================================
// Тулбар: кнопка «Тема» убрана, вместо неё «Настройки» (шестерёнка) — открывает окно.
// Окно: язык — выпадающий список с флагом и названием (🇷🇺 Русский / 🇬🇧 English),
// выбор идёт через i18n.changeLanguage и сохраняется в localStorage (`i18nextLng`).

import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import i18n from '../i18n'
import Toolbar from '../components/Toolbar'
import SettingsModal from '../components/SettingsModal'
import { LANGUAGES, LANGUAGE_FLAGS, currentLanguage, useSettingsStore } from '../store/settings'

beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  if (!('ResizeObserver' in globalThis)) {
    class RO { observe(): void {} unobserve(): void {} disconnect(): void {} }
    ;(globalThis as unknown as { ResizeObserver: typeof RO }).ResizeObserver = RO
  }
})

let root: Root | null = null
let host: HTMLDivElement | null = null
const noop = (): void => {}
const mount = (el: React.ReactElement) => {
  host = document.body.appendChild(document.createElement('div'))
  root = createRoot(host)
  act(() => root!.render(el))
  return host
}
const buttons = () => Array.from(host!.querySelectorAll<HTMLButtonElement>('[role="toolbar"] button'))
const byName = (name: string) => buttons().find((b) => b.getAttribute('aria-label') === name)

beforeEach(async () => {
  localStorage.clear()
  useSettingsStore.getState().reset()
  await i18n.changeLanguage('ru')
})
afterEach(() => { if (root) act(() => root!.unmount()); root = null; host?.remove() })

describe('Тулбар — «Настройки» вместо «Тема»', () => {
  it('кнопки «Тема» нет, «Настройки» открывает окно', async () => {
    let opened = 0
    mount(
      <Toolbar
        objectCount={0} selectedCount={0} canUndo={false} canRedo={false} hasCopied={false} busy={false} workerOk
        cameraMode="perspective" gizmoMode="none" rulerActive={false} dimensionActive={false} dimensionsVisible
        canMirror={false} canAlign={false} canCsg={false} alignActive={false}
        onOpen={noop} onSave={noop} onExportStl={noop} onImportStl={noop} onShowProjects={noop}
        onUndo={noop} onRedo={noop} onCopy={noop} onPaste={noop} onDelete={noop}
        onFitView={noop} onResetView={noop} onToggleCamera={noop} onGizmo={noop} onToggleRuler={noop}
        onDimensionMode={noop} onDimensionSettings={noop} onToggleDimensions={noop}
        onMirror={noop} onPreviewMirror={noop} onPreviewMirrorEnd={noop}
        onAlignMode={noop} onCsg={noop} onSettings={() => { opened++ }} onClearScene={noop}
      />,
    )
    const names = buttons().map((b) => b.getAttribute('aria-label'))
    expect(names).toContain('Настройки')
    expect(names).not.toContain('Сменить тему')
    expect(names).not.toContain('Тёмная тема')
    expect(names).not.toContain('Светлая тема')
    act(() => byName('Настройки')!.click())
    expect(opened).toBe(1)
  })
})

describe('Настройки — язык (флаг + текст)', () => {
  it('в списке RU и EN с флагами; каждый язык — флаг в LANGUAGE_FLAGS', () => {
    mount(<SettingsModal onClose={noop} />)
    const select = host!.querySelector<HTMLSelectElement>('[data-testid=settings-language]')!
    expect(Array.from(select.options).map((o) => o.value)).toEqual([...LANGUAGES])
    expect(Array.from(select.options).map((o) => o.textContent)).toEqual([
      `${LANGUAGE_FLAGS.ru} Русский`,
      `${LANGUAGE_FLAGS.en} English`,
    ])
    expect(select.value).toBe('ru')
  })

  it('выбор EN — i18n.changeLanguage, окно и localStorage', () => {
    mount(<SettingsModal onClose={noop} />)
    const select = host!.querySelector<HTMLSelectElement>('[data-testid=settings-language]')!
    act(() => {
      select.value = 'en'
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(currentLanguage()).toBe('en')
    expect(i18n.language).toBe('en')
    expect(localStorage.getItem('i18nextLng')).toBe('en')
    expect(host!.querySelector('#settings-title')!.textContent).toBe('Settings')
    expect(host!.querySelector<HTMLSelectElement>('[data-testid=settings-language]')!.value).toBe('en')
  })

  it('язык сохраняется между сессиями (localStorage → currentLanguage)', async () => {
    await i18n.changeLanguage('en')
    localStorage.setItem('i18nextLng', 'en')
    expect(currentLanguage()).toBe('en')
    mount(<SettingsModal onClose={noop} />)
    expect(host!.querySelector<HTMLSelectElement>('[data-testid=settings-language]')!.value).toBe('en')
  })
})
