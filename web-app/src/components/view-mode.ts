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
  /** depthTest рёбер: true — задние рёбра скрыты заливкой (hidden-line) */
  edgeDepthTest: boolean
}

export function viewModeRender(mode: ViewMode): ViewModeRender {
  if (mode === 'wireframe') {
    return { materialVisible: false, useBackgroundColor: false, transparent: false, opacity: 1, shadows: false, edges: true, edgeDepthTest: false }
  }
  if (mode === 'hidden-line') {
    return { materialVisible: true, useBackgroundColor: true, transparent: false, opacity: 1, shadows: false, edges: true, edgeDepthTest: true }
  }
  return { materialVisible: true, useBackgroundColor: false, transparent: false, opacity: 1, shadows: true, edges: false, edgeDepthTest: false }
}
