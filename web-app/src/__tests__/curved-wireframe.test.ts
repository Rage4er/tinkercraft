// ============================================================
// curved-wireframe.test.ts — VIEW-MODES: каркас всех фигур (+COM), пружина, CSG
// ============================================================
// EdgesGeometry не даёт рёбер на гладких поверхностях; сетка строится из
// параметров фигуры в локальной системе объекта (как основной меш): конус —
// COM (база −h/4, вершина 3h/4), цилиндр/капсула/пружина — bbox-центр.

import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import {
  CSG_WIREFRAME_MAX_TRIS, CURVED_WIREFRAME, csgWireframeGeometry, curvedWireframeGeometry,
} from '../components/curved-wireframe'
import type { ShapeParams, ShapeType } from '../csg/types'

const params: Record<string, ShapeParams> = {
  sphere: { radius: 12, segments: 32 },
  cylinder: { radius: 10, height: 20 },
  cone: { radius: 10, height: 24, segments: 32 },
  torus: { torusRadius: 15, tubeRadius: 4, segments: 32, tubeSegments: 16 },
  capsule: { radius: 8, height: 30 },
  tube: { radius: 12, innerRadius: 8, height: 20 },
  spring: { radius: 10, height: 30, turns: 5, wireRadius: 1.5 },
}

const bbox = (geo: THREE.BufferGeometry) => {
  geo.computeBoundingBox()
  return geo.boundingBox!
}

describe('curvedWireframeGeometry — все фигуры', () => {
  it('сфера, цилиндр, конус, тор, капсула, труба, пружина — непустая сетка', () => {
    for (const type of CURVED_WIREFRAME) {
      const geo = curvedWireframeGeometry(type as ShapeType, params[type])
      expect(geo, type).not.toBeNull()
      expect(geo!.attributes.position.count, type).toBeGreaterThan(0)
      expect(geo!.attributes.position.count % 2, type).toBe(0)
      geo!.dispose()
    }
    expect(CURVED_WIREFRAME.has('spring')).toBe(true)
  })

  it('позиция COM: конус −h/4…3h/4, цилиндр/капсула/пружина — ±h/2', () => {
    const cone = curvedWireframeGeometry('cone', { radius: 10, height: 24 })!
    const cb = bbox(cone)
    expect(cb.min.z).toBeCloseTo(-6, 0)     // −24/4
    expect(cb.max.z).toBeCloseTo(18, 0)     // 3·24/4
    cone.dispose()

    const cyl = curvedWireframeGeometry('cylinder', { radius: 10, height: 20 })!
    const yb = bbox(cyl)
    expect(yb.min.z).toBeCloseTo(-10, 0)
    expect(yb.max.z).toBeCloseTo(10, 0)
    cyl.dispose()

    const cap = curvedWireframeGeometry('capsule', { radius: 8, height: 30 })!
    const kb = bbox(cap)
    expect(kb.min.z).toBeCloseTo(-15, 0)
    expect(kb.max.z).toBeCloseTo(15, 0)
    cap.dispose()

    const spring = curvedWireframeGeometry('spring', params.spring)!
    const sb = bbox(spring)
    expect(sb.min.z).toBeCloseTo(-13.5, 0)  // −h/2 + wireRadius
    expect(sb.max.z).toBeCloseTo(13.5, 0)
    spring.dispose()
  })

  it('плоские фигуры — без сетки (EdgesGeometry достаточно)', () => {
    expect(CURVED_WIREFRAME.has('cube')).toBe(false)
    expect(CURVED_WIREFRAME.has('prism')).toBe(false)
    expect(CURVED_WIREFRAME.has('pyramid')).toBe(false)
    expect(curvedWireframeGeometry('cube', { width: 20, height: 20, depth: 20 })).toBeNull()
  })
})

describe('csgWireframeGeometry — каркас CSG', () => {
  it('небольшой CSG (union/subtract) — triangle-wireframe; тяжёлый — null', () => {
    const small = new THREE.BoxGeometry(10, 10, 10)
    const wire = csgWireframeGeometry(small)
    expect(wire).not.toBeNull()
    expect(wire!.attributes.position.count).toBeGreaterThan(0)
    wire!.dispose(); small.dispose()

    // 200×200 сегментов = 80 000 треугольников > лимита
    const heavy = new THREE.PlaneGeometry(10, 10, 200, 200)
    expect((heavy.index?.count ?? 0) / 3).toBeGreaterThan(CSG_WIREFRAME_MAX_TRIS)
    expect(csgWireframeGeometry(heavy)).toBeNull()
    heavy.dispose()
  })
})
