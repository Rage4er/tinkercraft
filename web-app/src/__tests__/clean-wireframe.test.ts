// ============================================================
// clean-wireframe.test.ts — CLEAN-WIREFRAME: каркас без треугольников
// ============================================================
// Окружности + образующие + радиусы; сфера — меридианы/параллели; тор —
// кольца; капсула — окружности + меридианы; труба — внешняя и внутренняя
// стенки; резьба — упрощённый контур витка (6 сегментов на виток).

import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import {
  CURVED_WIREFRAME, THREAD_WIREFRAME_SEGMENTS_PER_TURN,
  curvedWireframeGeometry, threadWireframe, csgWireframeGeometry,
} from '../components/curved-wireframe'
import type { ShapeParams, ShapeType } from '../csg/types'
import type { ThreadParams } from '../csg/thread-table'

const params: Record<string, ShapeParams> = {
  sphere: { radius: 12 },
  cylinder: { radius: 10, height: 20 },
  cone: { radius: 10, height: 24 },
  torus: { torusRadius: 15, tubeRadius: 4 },
  capsule: { radius: 8, height: 30 },
  tube: { radius: 12, innerRadius: 8, height: 20 },
  spring: { radius: 10, height: 30, turns: 5, wireRadius: 1.5 },
}

const bbox = (geo: THREE.BufferGeometry) => {
  geo.computeBoundingBox()
  return geo.boundingBox!
}
const radial = (geo: THREE.BufferGeometry): number[] => {
  const p = geo.attributes.position.array as Float32Array
  const out: number[] = []
  for (let i = 0; i < p.length; i += 3) out.push(Math.hypot(p[i], p[i + 1]))
  return out
}
const isPairsOnly = (geo: THREE.BufferGeometry): boolean =>
  geo.index === null && geo.attributes.position.count % 2 === 0

describe('Чистый каркас — цилиндр, конус, сфера', () => {
  it('цилиндр: окружности/образующие/радиусы, bbox r=10 h=20, только пары вершин', () => {
    const geo = curvedWireframeGeometry('cylinder', params.cylinder)!
    expect(isPairsOnly(geo)).toBe(true)
    const b = bbox(geo)
    expect(b.min.z).toBeCloseTo(-10, 5)
    expect(b.max.z).toBeCloseTo(10, 5)
    expect(Math.max(...radial(geo))).toBeCloseTo(10, 5)
    // радиусы на основаниях: линии от оси (r≈0) до rim (r≈10)
    expect(Math.min(...radial(geo))).toBeCloseTo(0, 5)
    geo.dispose()
  })

  it('конус: окружность основания + образующие + радиусы, COM-сдвиг −h/4…3h/4', () => {
    const geo = curvedWireframeGeometry('cone', params.cone)!
    const b = bbox(geo)
    expect(b.min.z).toBeCloseTo(-6, 4)      // −24/4
    expect(b.max.z).toBeCloseTo(18, 4)      // 3·24/4
    expect(Math.max(...radial(geo))).toBeCloseTo(10, 4)
    expect(isPairsOnly(geo)).toBe(true)
    geo.dispose()
  })

  it('сфера: меридианы и параллели (без треугольников), радиус 12', () => {
    const geo = curvedWireframeGeometry('sphere', params.sphere)!
    expect(isPairsOnly(geo)).toBe(true)
    for (const r of radial(geo)) expect(r).toBeLessThanOrEqual(12.0001)
    expect(Math.max(...radial(geo))).toBeCloseTo(12, 4)
    const b = bbox(geo)
    expect(b.min.z).toBeCloseTo(-12, 4)
    expect(b.max.z).toBeCloseTo(12, 4)
    geo.dispose()
  })
})

describe('Чистый каркас — труба, резьба, CSG', () => {
  it('труба: внешняя (12) и внутренняя (8) стенки, кольца сверху/снизу', () => {
    const geo = curvedWireframeGeometry('tube', params.tube)!
    const rs = radial(geo)
    expect(Math.max(...rs)).toBeCloseTo(12, 4)
    expect(Math.min(...rs)).toBeCloseTo(8, 4)     // внутренний цилиндр есть
    const b = bbox(geo)
    expect(b.min.z).toBeCloseTo(-10, 4)
    expect(b.max.z).toBeCloseTo(10, 4)
    expect(isPairsOnly(geo)).toBe(true)
    geo.dispose()
  })

  it('резьба: упрощённый контур витка — 6 сегментов на виток, заходы удваивают', () => {
    const p: ThreadParams = { series: 'metric', sizeId: 'M6', length: 20, kind: 'bolt', hand: 'right', starts: 1 }
    const geo = threadWireframe(p)!
    expect(geo).not.toBeNull()
    expect(isPairsOnly(geo)).toBe(true)
    const turns = 20 / 1 // M6 крупный шаг 1 мм
    const segments = Math.ceil(turns * THREAD_WIREFRAME_SEGMENTS_PER_TURN)
    expect(geo.attributes.position.count).toBe(segments * 2)
    const b = bbox(geo)
    expect(b.min.z).toBeCloseTo(-10, 4)
    expect(b.max.z).toBeCloseTo(10, 4)
    geo.dispose()

    const multi = threadWireframe({ ...p, starts: 2 })!
    expect(multi.attributes.position.count).toBe(segments * 4)
    multi.dispose()
  })

  it('CSG: небольшой — triangle-wireframe; тяжёлый — null', () => {
    const small = new THREE.BoxGeometry(10, 10, 10)
    const wire = csgWireframeGeometry(small)
    expect(wire).not.toBeNull()
    wire!.dispose(); small.dispose()
    const heavy = new THREE.PlaneGeometry(10, 10, 200, 200)
    expect(csgWireframeGeometry(heavy)).toBeNull()
    heavy.dispose()
  })

  it('все гладкие фигуры — непустые пары вершин; плоские — без сетки', () => {
    for (const type of CURVED_WIREFRAME) {
      const geo = curvedWireframeGeometry(type as ShapeType, params[type])
      expect(geo, type).not.toBeNull()
      expect(isPairsOnly(geo!), type).toBe(true)
      expect(geo!.attributes.position.count, type).toBeGreaterThan(0)
      geo!.dispose()
    }
    expect(curvedWireframeGeometry('cube', { width: 20, height: 20, depth: 20 })).toBeNull()
  })
})
