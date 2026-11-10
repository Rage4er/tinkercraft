// ============================================================
// viewport-nav.ts — навигация вьюпорта (VIEWPORT-NAV)
// ============================================================
// Кнопки мыши (как в подсказке вьюпорта и как в AutoCAD / Tinkercad):
//  • ЛКМ — выбор (клик) и рамка выделения (перетаскивание, SELECTION-RECT) — камеру НЕ вращает;
//  • ПКМ — вращать вид (перетаскивание); клик ПКМ — выход из режимов (как раньше);
//  • СКМ — сдвиг вида (перетаскивание); двойной клик СКМ — «Вписать в экран» (как F);
//  • колесо — масштаб.
// Двойной клик СКМ определяется по двум нажатиям средней кнопки: не дольше
// MIDDLE_DOUBLE_CLICK_MS между ними и не дальше MIDDLE_DOUBLE_CLICK_PX (иначе — это сдвиг).

import * as THREE from 'three'

/** Двойной клик СКМ: окно между нажатиями, мс. */
export const MIDDLE_DOUBLE_CLICK_MS = 400
/** Двойной клик СКМ: смещение между нажатиями не больше, px. */
export const MIDDLE_DOUBLE_CLICK_PX = 6

/** Кнопки мыши OrbitControls: ЛКМ свободна (выбор, рамка), СКМ — сдвиг, ПКМ — вращение. */
export const VIEWPORT_MOUSE_BUTTONS = {
  LEFT: null,
  MIDDLE: THREE.MOUSE.PAN,
  RIGHT: THREE.MOUSE.ROTATE,
} as const

/**
 * Детектор двойного клика средней кнопкой: `press(x, y, t)` на каждое нажатие СКМ —
 * true, если это второе нажатие двойного клика (тогда счёт начинается заново:
 * тройной клик — один двойной). `t` — время нажатия (event.timeStamp).
 */
export function createMiddleDoubleClick(
  windowMs = MIDDLE_DOUBLE_CLICK_MS,
  maxPx = MIDDLE_DOUBLE_CLICK_PX,
): (x: number, y: number, t: number) => boolean {
  let last: { x: number; y: number; t: number } | null = null
  return (x, y, t) => {
    if (last && t - last.t >= 0 && t - last.t <= windowMs && Math.hypot(x - last.x, y - last.y) <= maxPx) {
      last = null
      return true
    }
    last = { x, y, t }
    return false
  }
}
