// ============================================================
// yandex-clean-mode.test.tsx — yandex-games без SDK (clean-режим, P0-6): экономики нет — платные
// функции без оплаты и без «экономических» уведомлений (v1.4.0, найдено e2e main в clean-режиме)
// ============================================================
// • экспорт STL: модалка оплаты не показывается, экспорт — без способа оплаты (раньше — как
//   «за токены»: тост «Кэшбэк учтён в стоимости», хотя ничего не списано);
// • цвет: поле цвета сразу, как в main v1.3.9 (раньше «Расширенный выбор» не открывался — модалка
//   аренды отвечала bypass, а picker не показывался: `showNativePicker && canUseExtendedPicker`).

import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react-dom/test-utils'

vi.mock('../platform', () => ({
  getPlatform: () => null,
  isEconomyAvailable: () => false,
  getPlatformType: () => 'clean',
  initPlatform: async () => false,
}))
vi.mock('../platform/ad-timers', () => ({
  useAdCooldown: () => ({ remainingMs: 0, formatted: null, active: false }),
  useDailyReset: () => ({ remainingMs: 0, formatted: null }),
}))

import ExportModal from '../components/ExportModal'
import PropertiesPanel from '../components/PropertiesPanel'
import { settleExport } from '../store/economy-integration'
import { useNotifications } from '../store/notifications'
import { useUiStore } from '../store/ui-store'
import i18n from '../i18n'
import type { SceneObject } from '../csg/types'

const cube = (): SceneObject => ({
  id: 'obj_1', shapeType: 'cube', params: { width: 10, height: 10, depth: 10 }, color: '#89b4fa',
  transform: { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 },
  visible: true, locked: false, vertices: new Float32Array(24), indices: new Uint32Array(36),
})

function mount(node: React.ReactElement) {
  const container = document.body.appendChild(document.createElement('div'))
  const root = createRoot(container)
  act(() => { root.render(node) })
  return { container, unmount: () => act(() => root.unmount()) }
}

beforeEach(() => {
  document.body.innerHTML = ''
  useNotifications.setState({ notifications: [] })
  useUiStore.setState({ rentalModalKey: null, palettePickerRequested: false })
})

describe('clean-режим: экспорт STL', () => {
  it('модалка оплаты не показывается — экспорт сразу и без способа оплаты', () => {
    const onClose = vi.fn()
    const onExport = vi.fn()
    const h = mount(<ExportModal objects={{ obj_1: cube() }} operations={[]} onClose={onClose} onExport={onExport} />)
    expect(h.container.querySelector('.text-modal-box')).toBeNull()
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onExport).toHaveBeenCalledTimes(1)
    expect(onExport).toHaveBeenCalledWith()
    h.unmount()
  })

  it('экспорт без способа оплаты — без тоста «Кэшбэк учтён в стоимости» (за токены — с ним)', () => {
    const download = vi.fn()
    settleExport({ objects: { obj_1: cube() }, operations: [], method: undefined }, download)
    expect(download).toHaveBeenCalledTimes(1)
    const msgs = () => useNotifications.getState().notifications.map((n) => n.message)
    expect(msgs()).not.toContain(i18n.t('export.cashbackIncluded'))
    settleExport({ objects: { obj_1: cube() }, operations: [], method: 'tokens' }, download)
    expect(msgs()).toContain(i18n.t('export.cashbackIncluded'))
  })
})

describe('clean-режим: «Расширенный выбор» цвета', () => {
  it('поле цвета — сразу, как в main (без аренды); кнопка переключает на палитру и обратно', () => {
    const obj = cube()
    const noop = () => { }
    const h = mount(
      <PropertiesPanel firstSelected={obj} busy={false} selectedIds={[obj.id]} canResize canCsg objectList={[obj]}
        operationsLength={0} fileName={null} currentProjectId={null} currentProjectName={null} modified={false}
        onMoveAxis={noop} onRotAxis={noop} onScaleAxis={noop} onResizeDim={noop} onResizeObject={noop} onCsg={noop}
        onSetColor={noop} onToggleVisible={noop} onShowProjects={noop} onSaveToProject={noop} />,
    )
    // первое поле панели — цвет, как в main (e2e читают поля по порядку)
    expect(h.container.querySelector('input')?.getAttribute('type')).toBe('color')
    const toPalette = [...h.container.querySelectorAll('button')].find((b) => b.textContent?.includes(i18n.t('palette.regular')))
    expect(toPalette).toBeTruthy()
    act(() => { toPalette!.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    expect(h.container.querySelector('input[type="color"]')).toBeNull()
    expect(h.container.querySelectorAll('.color-palette-swatch')).toHaveLength(16)
    const toPicker = [...h.container.querySelectorAll('button')].find((b) => b.textContent?.includes(i18n.t('properties.advancedPicker')))
    act(() => { toPicker!.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    expect(useUiStore.getState().rentalModalKey).toBeNull()
    expect(h.container.querySelector('input[type="color"]')).toBeTruthy()
    h.unmount()
  })
})
