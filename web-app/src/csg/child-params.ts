// ============================================================
// child-params — поля параметров примитива для правки ребёнка CSG (Фаза 9.2)
// ============================================================
// Те же поля, минимумы и умолчания, что у блока «Размеры» в PropertiesPanel
// для обычных примитивов (не дублируем смысл — только данные для формы).

import type { ShapeParams, ShapeType } from './types'

export interface ParamField {
  key: keyof ShapeParams
  /** Ключ i18n подписи (properties.*) */
  labelKey: string
  min: number
  /** Значение, если params не содержит ключ */
  fallback: number
  /** Целое (число граней) */
  integer?: boolean
}

const RADIUS = (fallback: number, min = 0.1): ParamField => ({ key: 'radius', labelKey: 'properties.radius', min, fallback })
// AXIS-LABELS: подпись — по оси (вверх — Z): высота цилиндра / конуса / призмы / пирамиды — вдоль Z
const HEIGHT = (fallback: number): ParamField => ({ key: 'height', labelKey: 'properties.sizeZ', min: 0.1, fallback })

export function getParamFields(shapeType: ShapeType | undefined): ParamField[] {
  switch (shapeType) {
    case 'cube':
      return [
        // AXIS-LABELS: куб — Manifold.cube([width, height, depth]): width — X, height — Y, depth — Z
        // (ключи params не меняются — они в файлах и истории; меняется только подпись)
        { key: 'width', labelKey: 'properties.sizeX', min: 0.1, fallback: 20 },
        { key: 'height', labelKey: 'properties.sizeY', min: 0.1, fallback: 20 },
        { key: 'depth', labelKey: 'properties.sizeZ', min: 0.1, fallback: 20 },
      ]
    case 'sphere':
      return [RADIUS(12)]
    case 'cylinder':
      return [RADIUS(10), HEIGHT(30)]
    case 'cone':
      return [RADIUS(10), HEIGHT(24)]
    case 'torus':
      return [
        { key: 'torusRadius', labelKey: 'properties.torusRadius', min: 1, fallback: 15 },
        { key: 'tubeRadius', labelKey: 'properties.tubeRadius', min: 0.5, fallback: 4 },
      ]
    case 'prism':
    case 'pyramid':
      return [
        RADIUS(12, 0.5),
        HEIGHT(20),
        { key: 'sides', labelKey: 'properties.sides', min: 3, fallback: shapeType === 'prism' ? 6 : 4, integer: true },
      ]
    default:
      return []
  }
}

/** Приводит введённое значение к допустимому для поля (min, целое). */
export function clampFieldValue(field: ParamField, v: number): number {
  const c = Math.max(field.min, v)
  return field.integer ? Math.round(c) : c
}
