// ============================================================
// Worker buildShape — vertices в origin (COM)
// Фаза 8.5, Этап 8.5.1: worker возвращает vertices в origin
// ============================================================

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { centerMassAtOrigin } from './geometry-utils'
import { workerBuildShape, workerClearAll } from '../__tests__/worker-bridge'

describe('Worker buildShape — vertices в origin (COM)', () => {
  beforeAll(async () => {
    // worker-bridge инициализирует WASM при первом вызове
  })

  afterAll(async () => {
    await workerClearAll()
  })

  const IDENTITY = { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 }

  const cases = [
    { shapeType: 'cube' as const, params: { width: 20, height: 20, depth: 20 } },
    { shapeType: 'sphere' as const, params: { radius: 10, segments: 32 } },
    { shapeType: 'cylinder' as const, params: { radiusTop: 10, radiusBottom: 10, height: 20, segments: 32 } },
    { shapeType: 'cone' as const, params: { radiusTop: 0, radiusBottom: 10, height: 20, segments: 32 } },
    { shapeType: 'torus' as const, params: { radius: 10, tube: 3, segments: 32 } },
    { shapeType: 'prism' as const, params: { radius: 12, height: 20, sides: 3 } },
    { shapeType: 'pyramid' as const, params: { radius: 12, height: 20, sides: 4 } },
  ]

  for (const { shapeType, params } of cases) {
    it(`${shapeType}: COM(vertices) ≈ (0,0,0) при identity transform`, async () => {
      const mesh = await workerBuildShape(`test-${shapeType}`, shapeType, params, IDENTITY)

      // Копия вершин — centerMassAtOrigin мутирует in-place
      const verts = new Float32Array(mesh.vertices)
      const tris = new Uint32Array(mesh.indices)

      // Если vertices уже в origin — COM должен быть ≈ (0,0,0)
      const com = centerMassAtOrigin(verts, tris)
      expect(Math.abs(com.cx)).toBeLessThan(1e-4)
      expect(Math.abs(com.cy)).toBeLessThan(1e-4)
      expect(Math.abs(com.cz)).toBeLessThan(1e-4)
    })
  }
})

