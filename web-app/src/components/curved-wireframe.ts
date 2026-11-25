// ============================================================
// curved-wireframe.ts — VIEW-MODES: чистый каркас гладких фигур
// ============================================================
// Без треугольников WireframeGeometry: только окружности, образующие и
// радиусы (как в CAD). Позиция — локальная система объекта (как основной
// меш, COM в origin): конус — база −h/4 / вершина 3h/4, капсула — полная
// высота h, цилиндр/труба — ±h/2, сфера/тор — центр.

import * as THREE from 'three'
import type { ShapeParams, ShapeType } from '../csg/types'
import { threadMinorDiameter, threadSizeOf, type ThreadParams } from '../csg/thread-table'

/** Гладкие фигуры: для каркаса нужна сетка, а не EdgesGeometry */
export const CURVED_WIREFRAME: ReadonlySet<ShapeType> = new Set<ShapeType>([
  'sphere', 'cylinder', 'cone', 'torus', 'capsule', 'tube', 'spring',
])

/** CSG-результат: полный triangle-wireframe допустим только для небольших мешей */
export const CSG_WIREFRAME_MAX_TRIS = 20_000

/** Сегментов на виток резьбы в упрощённом каркасе */
export const THREAD_WIREFRAME_SEGMENTS_PER_TURN = 6

type Point3 = [number, number, number]

const num = (v: number | undefined, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : fallback

/** Полилинии → LineSegments-геометрия (только рёбра, без треугольников). */
function linesGeometry(polylines: Point3[][]): THREE.BufferGeometry {
  const positions: number[] = []
  for (const line of polylines) {
    for (let i = 0; i + 1 < line.length; i++) {
      positions.push(...line[i], ...line[i + 1])
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  return geo
}

/** Окружность в плоскости XY на высоте z. */
function circlePoints(radius: number, z: number, segments = 24): Point3[] {
  const pts: Point3[] = []
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2
    pts.push([radius * Math.cos(a), radius * Math.sin(a), z])
  }
  return pts
}

function radialLines(radius: number, z: number, count: number): Point3[][] {
  const out: Point3[][] = []
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2
    out.push([[0, 0, z], [radius * Math.cos(a), radius * Math.sin(a), z]])
  }
  return out
}

function verticalLines(radius: number, z0: number, z1: number, count: number): Point3[][] {
  const out: Point3[][] = []
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2
    const x = radius * Math.cos(a), y = radius * Math.sin(a)
    out.push([[x, y, z0], [x, y, z1]])
  }
  return out
}

/** Спираль пружины — осевая линия проволоки. */
function springWireframe(params: ShapeParams): THREE.BufferGeometry {
  const R = num(params.radius, 10)
  const h = num(params.height, 30)
  const turns = Math.max(0.5, Math.min(100, num(params.turns, 5)))
  const wire = num(params.wireRadius, 1.5)
  const perTurn = 12
  const n = Math.max(12, Math.ceil(turns * perTurn))
  const point = (i: number): Point3 => {
    const t = (i / n) * turns * Math.PI * 2
    const z = -h / 2 + wire + (i / n) * Math.max(0.001, h - 2 * wire)
    return [R * Math.cos(t), R * Math.sin(t), z]
  }
  const pts: Point3[] = []
  for (let i = 0; i <= n; i++) pts.push(point(i))
  return linesGeometry([pts])
}

/**
 * Упрощённый каркас резьбы: контур витка (6 сегментов на виток) по среднему
 * радиусу, для каждого захода; направление — правое/левое. `null` — нет размера.
 */
export function threadWireframe(params: ThreadParams): THREE.BufferGeometry | null {
  const size = threadSizeOf(params.series, params.sizeId)
  if (!size) return null
  const minor = threadMinorDiameter(size)
  const radius = (size.d / 2 + minor / 2) / 2
  const length = Math.max(0.1, params.length)
  const pitch = Math.max(0.01, size.pitch)
  const turns = Math.max(0.25, length / pitch)
  const starts = Math.max(1, Math.round(params.starts ?? 1))
  const dir = params.hand === 'left' ? -1 : 1
  const segments = Math.max(6, Math.ceil(turns * THREAD_WIREFRAME_SEGMENTS_PER_TURN))
  const polylines: Point3[][] = []
  for (let s = 0; s < starts; s++) {
    const phase = (s / starts) * Math.PI * 2
    const pts: Point3[] = []
    for (let i = 0; i <= segments; i++) {
      const t = (i / segments) * turns * Math.PI * 2
      const z = -length / 2 + (i / segments) * length
      pts.push([radius * Math.cos(phase + dir * t), radius * Math.sin(phase + dir * t), z])
    }
    polylines.push(pts)
  }
  return linesGeometry(polylines)
}

function cylinderWireframe(params: ShapeParams): THREE.BufferGeometry {
  const r = num(params.radius, 10)
  const h = num(params.height, 20)
  const z0 = -h / 2, z1 = h / 2
  return linesGeometry([
    circlePoints(r, z0), circlePoints(r, z1),
    ...verticalLines(r, z0, z1, 8),
    ...radialLines(r, z0, 4), ...radialLines(r, z1, 4),
  ])
}

function coneWireframe(params: ShapeParams): THREE.BufferGeometry {
  const r = num(params.radius, 10)
  const h = num(params.height, 24)
  // COM-центрирование (как Manifold centerManifoldToCOM): база −h/4, вершина 3h/4
  const zBase = -h / 4, zApex = (3 * h) / 4
  const polylines: Point3[][] = [circlePoints(r, zBase)]
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2
    polylines.push([[r * Math.cos(a), r * Math.sin(a), zBase], [0, 0, zApex]])
  }
  polylines.push(...radialLines(r, zBase, 4))
  return linesGeometry(polylines)
}

function sphereWireframe(params: ShapeParams): THREE.BufferGeometry {
  const r = num(params.radius, 12)
  const polylines: Point3[][] = []
  const meridianStep = Math.PI / 12
  for (let m = 0; m < 12; m++) {
    const a = (m / 12) * Math.PI * 2
    const pts: Point3[] = []
    for (let i = 0; i <= 12; i++) {
      const phi = -Math.PI / 2 + i * meridianStep
      pts.push([r * Math.cos(phi) * Math.cos(a), r * Math.cos(phi) * Math.sin(a), r * Math.sin(phi)])
    }
    polylines.push(pts)
  }
  for (const deg of [-75, -45, -15, 15, 45, 75]) {
    const phi = (deg * Math.PI) / 180
    polylines.push(circlePoints(r * Math.cos(phi), r * Math.sin(phi), 24))
  }
  return linesGeometry(polylines)
}

function torusWireframe(params: ShapeParams): THREE.BufferGeometry {
  const R = num(params.torusRadius, 15)
  const tr = num(params.tubeRadius, 4)
  const polylines: Point3[][] = []
  // Кольца по окружности (вокруг оси Z)
  for (let k = 0; k < 8; k++) {
    const phi = (k / 8) * Math.PI * 2
    polylines.push(circlePoints(R + tr * Math.cos(phi), tr * Math.sin(phi), 24))
  }
  // Кольца по сечению (вокруг трубки)
  for (let k = 0; k < 8; k++) {
    const th = (k / 8) * Math.PI * 2
    const pts: Point3[] = []
    for (let i = 0; i <= 12; i++) {
      const phi = (i / 12) * Math.PI * 2
      const rr = R + tr * Math.cos(phi)
      pts.push([rr * Math.cos(th), rr * Math.sin(th), tr * Math.sin(phi)])
    }
    polylines.push(pts)
  }
  return linesGeometry(polylines)
}

function capsuleWireframe(params: ShapeParams): THREE.BufferGeometry {
  const r = num(params.radius, 8)
  const h = Math.max(2 * r, num(params.height, 30))
  const a = h / 2 - r
  const polylines: Point3[][] = []
  // Окружности: стыки цилиндра и полусфер (+30°/+60°)
  polylines.push(circlePoints(r, -a), circlePoints(r, a))
  for (const deg of [-60, -30, 30, 60]) {
    const phi = (deg * Math.PI) / 180
    const z = Math.sign(deg) * (a + r * Math.sin(Math.abs(phi)))
    polylines.push(circlePoints(r * Math.cos(phi), z))
  }
  // Образующие: полный меридиан (низ → цилиндр → верх)
  for (let m = 0; m < 12; m++) {
    const th = (m / 12) * Math.PI * 2
    const pts: Point3[] = []
    for (let i = 0; i <= 6; i++) {
      const phi = -Math.PI / 2 + (i / 6) * (Math.PI / 2)
      pts.push([r * Math.cos(phi) * Math.cos(th), r * Math.cos(phi) * Math.sin(th), -a + r * Math.sin(phi)])
    }
    for (let i = 1; i < 4; i++) {
      const z = -a + (i / 4) * 2 * a
      pts.push([r * Math.cos(th), r * Math.sin(th), z])
    }
    for (let i = 0; i <= 6; i++) {
      const phi = (i / 6) * (Math.PI / 2)
      pts.push([r * Math.cos(phi) * Math.cos(th), r * Math.cos(phi) * Math.sin(th), a + r * Math.sin(phi)])
    }
    polylines.push(pts)
  }
  return linesGeometry(polylines)
}

function tubeWireframe(params: ShapeParams): THREE.BufferGeometry {
  const R = num(params.radius, 12)
  const inner = Math.min(R - 0.1, num(params.innerRadius, 8))
  const h = num(params.height, 20)
  const z0 = -h / 2, z1 = h / 2
  const polylines: Point3[][] = [
    circlePoints(R, z0), circlePoints(R, z1),
    circlePoints(inner, z0), circlePoints(inner, z1),
    ...verticalLines(R, z0, z1, 8),
    ...verticalLines(inner, z0, z1, 8),
  ]
  // Радиальные перемычки на торцах (между внешней и внутренней стенкой)
  for (const z of [z0, z1]) {
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2
      polylines.push([
        [inner * Math.cos(a), inner * Math.sin(a), z],
        [R * Math.cos(a), R * Math.sin(a), z],
      ])
    }
  }
  return linesGeometry(polylines)
}

/**
 * Чистый каркас фигуры (без треугольников), локальные координаты объекта.
 * `null` — фигура не из набора.
 */
export function curvedWireframeGeometry(shapeType: ShapeType, params: ShapeParams): THREE.BufferGeometry | null {
  if (shapeType === 'sphere') return sphereWireframe(params)
  if (shapeType === 'cylinder') return cylinderWireframe(params)
  if (shapeType === 'cone') return coneWireframe(params)
  if (shapeType === 'torus') return torusWireframe(params)
  if (shapeType === 'capsule') return capsuleWireframe(params)
  if (shapeType === 'tube') return tubeWireframe(params)
  if (shapeType === 'spring') return springWireframe(params)
  return null
}

/**
 * CSG-результат: triangle-wireframe всего меша (для небольших CSG).
 * `null` — меш слишком тяжёлый (остаются EdgesGeometry-рёбра).
 */
export function csgWireframeGeometry(geometry: THREE.BufferGeometry): THREE.BufferGeometry | null {
  const tris = (geometry.index?.count ?? geometry.attributes.position.count) / 3
  if (!Number.isFinite(tris) || tris <= 0 || tris > CSG_WIREFRAME_MAX_TRIS) return null
  return new THREE.WireframeGeometry(geometry)
}
