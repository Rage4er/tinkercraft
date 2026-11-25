// ============================================================
// curved-wireframe.test.ts — VIEW-MODES: сетка гладких фигур
// ============================================================
// EdgesGeometry не даёт рёбер на сфере/цилиндре; для wireframe строим
// низкополигональную сетку (WireframeGeometry) из параметров фигуры.

import { describe, it, expect } from 'vitest'
import { CURVED_WIREFRAME, curvedWireframeGeometry } from '../components/curved-wireframe'
import type { ShapeParams, ShapeType } from '../csg/types'

const params: Record<string, ShapeParams> = {
  sphere: { radius: 12, segments: 32 },
  cylinder: { radius: 10, height: 20 },
  cone: { radius: 10, height: 24, segments: 32 },
  torus: { torusRadius: 15, tubeRadius: 4, segments: 32, tubeSegments: 16 },
  capsule: { radius: 8, height: 30 },
  tube: { radius: 12, innerRadius: 8, height: 20 },
}

describe('curvedWireframeGeometry — сетка гладких фигур', () => {
  it('сфера, цилиндр, конус, тор, капсула, труба — непустая сетка', () => {
    for (const type of CURVED_WIREFRAME) {
      const geo = curvedWireframeGeometry(type as ShapeType, params[type])
      expect(geo, type).not.toBeNull()
      expect(geo!.attributes.position.count, type).toBeGreaterThan(0)
      // WireframeGeometry: линии — пары вершин
      expect(geo!.attributes.position.count % 2, type).toBe(0)
      geo!.dispose()
    }
  })

  it('плоские фигуры — не гладкие (EdgesGeometry), сетка не нужна', () => {
    expect(CURVED_WIREFRAME.has('cube')).toBe(false)
    expect(CURVED_WIREFRAME.has('prism')).toBe(false)
    expect(curvedWireframeGeometry('cube', { width: 20, height: 20, depth: 20 })).toBeNull()
  })
})
