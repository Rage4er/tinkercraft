// ============================================================
// ux-viewport.test.tsx — UX-VIEWPORT: навигация, адаптивная сетка, рамка выделения
// ============================================================
// VIEWPORT-NAV: F и двойной клик СКМ — «Вписать в экран»; кнопки мыши — ЛКМ выбор / рамка,
// ПКМ вращение, СКМ сдвиг. GRID-ADAPTIVE: две сетки (тонкая + жирная ×10), шаг 1 / 5 / 10 / 50 / 100
// по масштабу, без края (следует за центром вида, радиус растёт с отдалением).
// Браузер (камера, сетка на экране, рамка мышью) — e2e/ux-viewport.mjs.

import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { resolveHotkey } from '../hotkeys'
import { createMiddleDoubleClick, VIEWPORT_MOUSE_BUTTONS, MIDDLE_DOUBLE_CLICK_MS } from '../components/viewport-nav'
import {
  GRID_MAJOR_FACTOR, GRID_STEPS, createAdaptiveGrid, gridStepFor, pixelsPerMm, updateAdaptiveGrid, viewHeightAt, setAdaptiveGridTheme, GRID_COLORS,
} from '../components/adaptive-grid'

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

describe('GRID-ADAPTIVE — две сетки, шаг 1 / 5 / 10 / 50 / 100 по масштабу, без края', () => {
  const H = 800                                                    // высота вьюпорта, px
  const stepAt = (distance: number) => gridStepFor(pixelsPerMm(viewHeightAt(45, distance), H))

  it('шаг по масштабу: приблизили — мельче, отдалили — крупнее (все пять ступеней)', () => {
    expect(GRID_STEPS).toEqual([1, 5, 10, 50, 100])
    const distances = [10, 100, 500, 1500, 4000]                   // от CONTROLS_MIN_DIST до почти максимума
    expect(distances.map(stepAt)).toEqual([1, 5, 10, 50, 100])
    const many = Array.from({ length: 200 }, (_, i) => 10 + i * 25).map(stepAt)
    for (let i = 1; i < many.length; i++) expect(many[i]).toBeGreaterThanOrEqual(many[i - 1])   // не скачет назад
    expect(gridStepFor(Infinity)).toBe(1)
    expect(gridStepFor(0)).toBe(100)
  })

  it('две сетки: тонкая — шаг, жирная — каждые 10 клеток; обе обновляются вместе', () => {
    const grid = createAdaptiveGrid('dark', -0.5)
    const u = (grid.material as THREE.ShaderMaterial).uniforms
    expect(u.uMajorFactor.value).toBe(GRID_MAJOR_FACTOR)
    expect(GRID_MAJOR_FACTOR).toBe(10)
    for (const d of [10, 100, 500, 1500, 4000]) {
      const st = updateAdaptiveGrid(grid, { target: { x: 0, y: 0 }, distance: d, viewHeightMm: viewHeightAt(45, d), viewportHeightPx: H })
      expect(u.uStep.value).toBe(st.step)
      expect(st.major).toBe(st.step * 10)
    }
    expect(grid.position.z).toBe(-0.5)
    expect(new THREE.Raycaster().intersectObject(grid)).toEqual([])   // не мешает выбору
    setAdaptiveGridTheme(grid, 'light')
    expect((u.uMajorColor.value as THREE.Color).getHex()).toBe(GRID_COLORS.light.major)
  })

  it('не обрывается: сетка следует за центром вида, видимая сетка внутри непрозрачной зоны', () => {
    const grid = createAdaptiveGrid('dark', -0.5)
    const camera = new THREE.PerspectiveCamera(45, 1.6, 0.1, 10000)
    camera.up.set(0, 0, 1)
    for (const target of [new THREE.Vector3(0, 0, 0), new THREE.Vector3(1500, -800, 0)]) {
      for (const off of [new THREE.Vector3(150, -200, 120), new THREE.Vector3(1200, -1600, 960)]) {
        camera.position.copy(target).add(off); camera.lookAt(target); camera.updateMatrixWorld(true)
        const d = off.length()
        const st = updateAdaptiveGrid(grid, { target, distance: d, viewHeightMm: viewHeightAt(45, d), viewportHeightPx: H })
        expect(st.center).toEqual({ x: target.x, y: target.y })       // следует за видом
        expect(grid.position.x).toBe(target.x)
        expect(grid.scale.x).toBe(st.radius * 2)                       // плоскость накрывает круг радиуса
        // нижние углы кадра и центр смотрят на плоскость — точки на ней в полностью видимой зоне (0.55 R)
        for (const ndc of [[-1, -1], [1, -1], [0, -1], [0, 0]]) {
          const rc = new THREE.Raycaster(); rc.setFromCamera(new THREE.Vector2(ndc[0], ndc[1]), camera)
          const hit = rc.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), 0.5), new THREE.Vector3())!
          expect(hit).not.toBeNull()
          expect(Math.hypot(hit.x - target.x, hit.y - target.y)).toBeLessThan(st.radius * 0.55)
        }
      }
    }
  })
})
