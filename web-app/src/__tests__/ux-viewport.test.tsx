// ============================================================
// ux-viewport.test.tsx — UX-VIEWPORT: навигация, адаптивная сетка, рамка выделения
// ============================================================
// VIEWPORT-NAV: F и двойной клик СКМ — «Вписать в экран»; кнопки мыши — ЛКМ выбор / рамка,
// ПКМ вращение, СКМ сдвиг. Браузер (камера, сетка на экране, рамка мышью) — e2e/ux-viewport.mjs.

import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { resolveHotkey } from '../hotkeys'
import { createMiddleDoubleClick, VIEWPORT_MOUSE_BUTTONS, MIDDLE_DOUBLE_CLICK_MS } from '../components/viewport-nav'

describe('VIEWPORT-NAV — «Вписать в экран»: F и двойной клик средней кнопкой', () => {
  it('F — по-прежнему «Вписать в экран»', () => {
    expect(resolveHotkey({ code: 'KeyF' })).toBe('fitView')
  })

  it('двойной клик СКМ: два нажатия рядом и быстро — да; медленно, далеко — нет; тройной — один', () => {
    const press = createMiddleDoubleClick()
    expect(press(100, 100, 1000)).toBe(false)
    expect(press(103, 102, 1250)).toBe(true)                  // второе нажатие — двойной клик
    expect(press(103, 102, 1400)).toBe(false)                 // третье — начало нового
    expect(press(104, 102, 1400 + MIDDLE_DOUBLE_CLICK_MS + 1)).toBe(false)   // слишком медленно
    expect(press(160, 102, 1400 + MIDDLE_DOUBLE_CLICK_MS + 100)).toBe(false) // далеко — это сдвиг
    expect(press(161, 103, 1400 + MIDDLE_DOUBLE_CLICK_MS + 300)).toBe(true)
  })

  it('кнопки мыши: ЛКМ не вращает (выбор и рамка), ПКМ — вращение, СКМ — сдвиг', () => {
    expect(VIEWPORT_MOUSE_BUTTONS.LEFT).toBeNull()
    expect(VIEWPORT_MOUSE_BUTTONS.RIGHT).toBe(THREE.MOUSE.ROTATE)
    expect(VIEWPORT_MOUSE_BUTTONS.MIDDLE).toBe(THREE.MOUSE.PAN)
  })
})
