// ============================================================
// view-mode.ts — VIEW-MODES: настройки отрисовки для 3 режимов
// ============================================================
// Чистая функция: какие свойства материала/теней/рёбер применить.
//   realistic   — заливка цветом объекта, тени;
//   wireframe   — без заливки (material.visible=false), только рёбра, без теней;
//   hidden-line — заливка цветом фона (непрозрачная), рёбра с depthTest (задние скрыты).

import type { ViewMode } from '../store/ui-store'

export interface ViewModeRender {
  /** Заливка граней видна (false — материал не рисуется, остаются только рёбра) */
  materialVisible: boolean
  /** Красить грани цветом фона сцены (hidden-line) */
  useBackgroundColor: boolean
  transparent: boolean
  opacity: number
  /** Тени (castShadow / receiveShadow) */
  shadows: boolean
  /** Рисовать рёбра (EdgesGeometry) */
  edges: boolean
  /** depthTest рёбер: true — задние рёбра скрыты заливкой (realistic / hidden-line) */
  edgeDepthTest: boolean
  /** depthWrite рёбер: true — только realistic (обычные рёбра); в режимах — false */
  edgeDepthWrite: boolean
  /** Очередь отрисовки рёбер: 0 — как раньше (UB2-4), 2 — поверх граней */
  edgeRenderOrder: number
}

export function viewModeRender(mode: ViewMode): ViewModeRender {
  if (mode === 'wireframe') {
    // все рёбра, включая задние; граней нет
    return {
      materialVisible: false, useBackgroundColor: false, transparent: false, opacity: 1,
      shadows: false, edges: true, edgeDepthTest: false, edgeDepthWrite: false, edgeRenderOrder: 2,
    }
  }
  if (mode === 'hidden-line') {
    // задние рёбра скрыты заливкой фона
    return {
      materialVisible: true, useBackgroundColor: true, transparent: false, opacity: 1,
      shadows: false, edges: true, edgeDepthTest: true, edgeDepthWrite: false, edgeRenderOrder: 2,
    }
  }
  // UB2-4: рёбра фигур видны и на реалистичном виде (визуальное восприятие формы),
  // но depthTest/depthWrite — как у обычной геометрии: сквозь грани НЕ просвечивают
  return {
    materialVisible: true, useBackgroundColor: false, transparent: false, opacity: 1,
    shadows: true, edges: true, edgeDepthTest: true, edgeDepthWrite: true, edgeRenderOrder: 0,
  }
}
