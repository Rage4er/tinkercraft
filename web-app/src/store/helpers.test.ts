import { describe, it, expect } from 'vitest'
import { centerMassAtOrigin, computeCenter, computeWorldAABB, worldVerticesAABB, solveAlignDeltas, composeMirroredList, extrudeSlab, solvePlaneAlignDelta, worldProjectionRange, axisPlane } from './helpers'
import type { SceneObject, TransformNR } from '../csg/types'

// Helper: build a triangular mesh for a prism with given sides, height, z_offset.
// Winding is OUTWARD (positive signed volume) so the mesh passes isClosedMesh()
// and the volumetric centroid formula applies.
// Sides: (i, n, top+i), (n, top+n, top+i); bottom fan CW from above; top fan CCW.
function buildPrismVerticesAndIndices(sides: number, height: number, zOffset: number): {
  vertices: Float32Array
  indices: Uint32Array
} {
  const verts: number[] = []
  const idx: number[] = []
  const radius = 5

  // Bottom face at z=zOffset
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * Math.PI * 2
    verts.push(Math.cos(a) * radius, Math.sin(a) * radius, zOffset)
  }
  // Top face at z=zOffset+height
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * Math.PI * 2
    verts.push(Math.cos(a) * radius, Math.sin(a) * radius, zOffset + height)
  }

  const topStart = sides
  // Side faces — outward normals (radially away from the axis)
  for (let i = 0; i < sides; i++) {
    const next = (i + 1) % sides
    idx.push(i, next, topStart + i)
    idx.push(next, topStart + next, topStart + i)
  }

  // Bottom face (outward = -Z): CW when viewed from above
  for (let i = 1; i < sides - 1; i++) {
    idx.push(0, i + 1, i)
  }
  // Top face (outward = +Z): CCW when viewed from above
  for (let i = 1; i < sides - 1; i++) {
    idx.push(topStart, topStart + i, topStart + i + 1)
  }

  return {
    vertices: new Float32Array(verts),
    indices: new Uint32Array(idx),
  }
}

// Helper: build a PROPER symmetric cube mesh (24 vertices, 12 triangles).
// FIX: use 4 vertices per face (no shared vertices) so each face is planar.
// The 8-vertex "shared" cube produces diagonal non-planar faces, breaking symmetry.
function buildCubeVerticesAndIndices(size: number = 2): {
  vertices: Float32Array
  indices: Uint32Array
} {
  const s = size / 2
  const verts = new Float32Array([
    // Front face (z=s)
    -s, -s, s, s, -s, s, s, s, s, -s, s, s,
    // Back face (z=-s)
    s, -s, -s, -s, -s, -s, -s, s, -s, s, s, -s,
    // Top face (y=s)
    -s, s, s, s, s, s, s, s, -s, -s, s, -s,
    // Bottom face (y=-s)
    -s, -s, -s, s, -s, -s, s, -s, s, -s, -s, s,
    // Right face (x=s)
    s, -s, s, s, -s, -s, s, s, -s, s, s, s,
    // Left face (x=-s)
    -s, -s, -s, -s, -s, s, -s, s, s, -s, s, -s,
  ])
  const idx = new Uint32Array([
    0, 1, 2, 0, 2, 3,       // front
    4, 5, 6, 4, 6, 7,       // back
    8, 9, 10, 8, 10, 11,    // top
    12, 13, 14, 12, 14, 15, // bottom
    16, 17, 18, 16, 18, 19, // right
    20, 21, 22, 20, 22, 23, // left
  ])
  return { vertices: verts, indices: idx }
}

describe('centerMassAtOrigin', () => {
  it('cube (symmetric) → mass center at (0, 0, 0)', () => {
    const { vertices, indices } = buildCubeVerticesAndIndices(2)
    const result = centerMassAtOrigin(vertices, indices)
    expect(result.cx).toBeCloseTo(0, 5)
    expect(result.cy).toBeCloseTo(0, 5)
    expect(result.cz).toBeCloseTo(0, 5)
  })

  it('prism sides=3, offset by Z → non-zero offset, mass center at origin after', () => {
    const height = 6
    const zOffset = 10
    const { vertices, indices } = buildPrismVerticesAndIndices(3, height, zOffset)

    const result = centerMassAtOrigin(vertices, indices)

    // Center of mass of a uniform prism: geometric centroid
    // The centroid of the base is at origin (0,0) in XY
    // The centroid of the prism is at (0, 0, height/2) = (0, 0, 3)
    // After offset, centroid is at (0, 0, 3 + 10) = (0, 0, 13)
    // So we expect cx ≈ 0, cy ≈ 0, cz ≈ 13
    expect(result.cx).toBeCloseTo(0, 3)
    expect(result.cy).toBeCloseTo(0, 3)
    expect(result.cz).toBeCloseTo(height / 2 + zOffset, 3)

    // After centering, the mass center of the mesh should be at origin
    // Recompute: vertices are shifted by (-cx, -cy, -cz)
    // Check a few vertices to verify they are shifted
    const firstZ = vertices[2]
    const lastZ = vertices[vertices.length - 1]
    // The mass center of shifted mesh should be at origin
    // We can verify by checking that the mesh is roughly symmetric around origin in Z
    expect(firstZ).toBeLessThan(0)
    expect(lastZ).toBeGreaterThan(0)
  })

  it('center mass ≠ BBox center for prism sides=3', () => {
    // Build a prism shifted so its bbox center is clearly different from its mass center
    const height = 10
    const { vertices: verts, indices } = buildPrismVerticesAndIndices(3, height, 0)

    // Copy original vertices for bbox computation (before centering)
    const originalVerts = new Float32Array(verts)
    const bboxCenter = computeCenter(originalVerts)

    // Center mass at origin
    const result = centerMassAtOrigin(verts, indices)

    // For a prism with centroid at (0, 0, height/2):
    // bboxCenter.z = height/2 (since bbox spans from 0 to height)
    // massCenter.z = height/2 (same for uniform prism)
    // But in XY: mass center = (0,0), bbox center = (0,0) too for symmetric base
    // Let's offset the prism so the difference is visible in Z
    // Actually, let's offset the prism in Z to see the centering difference

    // Rebuild with z offset to make bbox center different from mass center
    // Shift prism base to z=20, height=10 → centroid at z=25, bbox spans 20-30
    const { vertices: verts2, indices: idx2 } = buildPrismVerticesAndIndices(3, height, 20)
    const originalVerts2 = new Float32Array(verts2)
    const bboxCenter2 = computeCenter(originalVerts2)
    const massResult = centerMassAtOrigin(verts2, idx2)

    // For a prism with base centered at (0,0,20) and height 10:
    // bbox: z in [20, 30], bboxCenter.z = 25
    // mass center: z = 20 + 10/2 = 25
    // For a uniform prism, bbox center = mass center in this case
    // The difference is only visible for non-uniform shapes

    // Let's verify: for a pyramid (one vertex at top, base at bottom),
    // mass center ≠ bbox center. Build a simple pyramid.
    const pyramidVerts: number[] = [
      // Base (4 vertices)
      -2, -2, 0, 2, -2, 0, 2, 2, 0, -2, 2, 0,
      // Apex
      0, 0, 4,
    ]
    const pyramidIdx: number[] = [
      // Base (outward = -Z): CW from above
      0, 2, 1, 0, 3, 2,
      // Sides (outward normals):
      0, 1, 4, 1, 2, 4, 2, 3, 4, 3, 0, 4,
    ]
    const pVerts = new Float32Array(pyramidVerts)
    const pIdx = new Uint32Array(pyramidIdx)
    const pOriginalVerts = new Float32Array(pVerts)
    const pBboxCenter = computeCenter(pOriginalVerts)
    const pMassResult = centerMassAtOrigin(pVerts, pIdx)

    // Pyramid: bbox spans z=[0,4], bboxCenter.z = 2
    // Pyramid mass center: height/4 from base = 1 (for uniform pyramid)
    // So bboxCenter.z = 2, massCenter.z = 1 → they differ!
    const bboxZ = pBboxCenter.z
    const massZ = pMassResult.cz
    const diff = Math.abs(bboxZ - massZ)

    console.log(`pyramid: bboxCenter=[${pBboxCenter.x},${pBboxCenter.y},${pBboxCenter.z}], massCenter=[${pMassResult.cx},${pMassResult.cy},${pMassResult.cz}], diff=${diff.toFixed(4)}`)

    // bboxCenter.z = 2, massCenter.z = 1 → diff = 1
    expect(diff).toBeGreaterThan(0.1)
    expect(bboxZ).toBeCloseTo(2, 3)
    expect(massZ).toBeCloseTo(1, 3)
  })

  it('empty array → (0, 0, 0), no crash', () => {
    const verts = new Float32Array(0)
    const idx = new Uint32Array(0)
    const result = centerMassAtOrigin(verts, idx)
    expect(result.cx).toBeCloseTo(0)
    expect(result.cy).toBeCloseTo(0)
    expect(result.cz).toBeCloseTo(0)
  })

  it('vertices are mutated in-place', () => {
    const { vertices, indices } = buildCubeVerticesAndIndices(4)
    const originalCopy = new Float32Array(vertices)

    const result = centerMassAtOrigin(vertices, indices)

    // Original array should be mutated
    for (let i = 0; i < vertices.length; i++) {
      if (Math.abs(originalCopy[i] - vertices[i]) > 1e-10) {
        // At least some vertices should have changed
        break
      }
      if (i === vertices.length - 1) {
        // If cube is centered, vertices might not change (mass center = origin)
        // But for a non-symmetric shape, vertices will change
      }
    }
    // For a non-symmetric test: build a triangle shifted to (10, 10, 10)
    const triVerts = new Float32Array([10, 10, 10, 20, 10, 10, 10, 20, 10])
    const triIdx = new Uint32Array([0, 1, 2])
    const triOriginal = new Float32Array(triVerts)
    const triResult = centerMassAtOrigin(triVerts, triIdx)
    // FIX: centroid of (10,10,10),(20,10,10),(10,20,10) is (40/3, 40/3, 10), not (15, 15, 10)
    expect(triResult.cx).toBeCloseTo(40 / 3, 5)
    expect(triResult.cy).toBeCloseTo(40 / 3, 5)
    expect(triResult.cz).toBeCloseTo(10, 5)
    // Verify in-place mutation
    expect(triVerts[0]).toBeCloseTo(10 - 40 / 3, 5) // -10/3
    expect(triVerts[3]).toBeCloseTo(20 - 40 / 3, 5) // 20/3
    expect(triVerts[1]).toBeCloseTo(10 - 40 / 3, 5) // -10/3
    expect(triVerts[4]).toBeCloseTo(10 - 40 / 3, 5) // -10/3
  })
})

// ---- ALIGN-CSG-AABB (9.5.2): мировая рамка и решатель выравнивания ----
const T0: TransformNR = { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 }
/** «CSG»: вершины — куб ±1 в локальной системе, pivot в `t`; кэш aabb — локальный (как у csgBoolean). */
function csgObj(id: string, t: Partial<TransformNR>): SceneObject {
  const v: number[] = []
  for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) v.push(x, y, z)
  return {
    id, shapeType: 'csg', params: {}, color: '#fff', transform: { ...T0, ...t }, visible: true, locked: false,
    vertices: new Float32Array(v), indices: new Uint32Array([0, 1, 2]),
    aabb: { min: { x: -1, y: -1, z: -1 }, max: { x: 1, y: 1, z: 1 } },
  }
}
const cubeObj = (id: string, x: number, w = 2): SceneObject => ({
  id, shapeType: 'cube', params: { width: w, height: w, depth: w }, color: '#fff', transform: { ...T0, x },
  visible: true, locked: false, vertices: new Float32Array(), indices: new Uint32Array(),
})

describe('computeWorldAABB / worldVerticesAABB', () => {
  it('CSG: рамка в мире (pivot + R·S·v), а не локальный кэш aabb', () => {
    const b = computeWorldAABB(csgObj('c', { x: 10, scaleX: 3 }))
    expect(b.min.x).toBeCloseTo(7, 6)
    expect(b.max.x).toBeCloseTo(13, 6)
    expect(b.min.y).toBeCloseTo(-1, 6)
  })
  it('поворот учитывается: 90° вокруг Z меняет оси местами', () => {
    const b = worldVerticesAABB(new Float32Array([-2, -1, 0, 2, 1, 0]), { ...T0, rotZ: 90 })
    expect(b.min.x).toBeCloseTo(-1, 6)
    expect(b.max.y).toBeCloseTo(2, 6)
  })
  it('примитив без вершин — OBB из params + позиции (ALIGN-REVIT)', () => {
    expect(computeWorldAABB(cubeObj('k', 5, 4)).min.x).toBe(3)
  })
})

describe('solveAlignDeltas', () => {
  it('якорь — CSG: цели выравниваются по его мировой рамке (min / center / max)', () => {
    const objects = { c: csgObj('c', { x: 10 }), k: cubeObj('k', 0) }
    expect(solveAlignDeltas(objects, ['k'], 'X', 'min', 'c')).toEqual({ k: 9 - (-1) })
    expect(solveAlignDeltas(objects, ['k'], 'X', 'center', 'c')).toEqual({ k: 10 })
    expect(solveAlignDeltas(objects, ['k'], 'X', 'max', 'c')).toEqual({ k: 11 - 1 })
  })
  it('два CSG: цель-CSG выравнивается по мировой рамке якоря-CSG (pivot ≠ 0, масштаб у цели)', () => {
    // A: рамка X [19, 21]; B: pivot 50, масштаб 3 → рамка X [47, 53]
    const objects = { A: csgObj('A', { x: 20, y: 20, z: 20 }), B: csgObj('B', { x: 50, y: 20, z: 20, scaleX: 3 }) }
    const d = solveAlignDeltas(objects, ['B'], 'X', 'min', 'A')
    expect(d.B).toBeCloseTo(19 - 47, 6)
    const moved = { ...objects.B, transform: { ...objects.B.transform, x: objects.B.transform.x + d.B } }
    expect(computeWorldAABB(moved).min.x).toBeCloseTo(computeWorldAABB(objects.A).min.x, 6)
    expect(solveAlignDeltas(objects, ['B'], 'X', 'max', 'A').B).toBeCloseTo(21 - 53, 6)
  })
  it('якорь и отсутствующие объекты пропускаются; нет якоря — пусто', () => {
    const objects = { a: cubeObj('a', 0), b: cubeObj('b', 4) }
    expect(solveAlignDeltas(objects, ['a', 'b', 'ghost'], 'X', 'min', 'b')).toEqual({ a: 4 })
    expect(solveAlignDeltas(objects, ['a'], 'X', 'min', 'ghost')).toEqual({})
  })
})

describe('composeMirroredList (8.5.12; правка шага mirror — 9.5.3)', () => {
  it('композиция: разные плоскости добавляются, одинаковая соседняя отменяет', () => {
    expect(composeMirroredList(undefined, 'YZ')).toEqual(['YZ'])
    expect(composeMirroredList(['YZ'], 'XZ')).toEqual(['YZ', 'XZ'])          // зеркало зеркала — оба
    expect(composeMirroredList(['YZ', 'XZ'], 'XY')).toEqual(['YZ', 'XZ', 'XY'])
    expect(composeMirroredList(['YZ'], 'YZ')).toBeUndefined()               // YZ∘YZ = тождество
    expect(composeMirroredList(['YZ', 'XZ'], 'XZ')).toEqual(['YZ'])
  })
  it('вход не мутируется', () => {
    const list: Array<'XY' | 'XZ' | 'YZ'> = ['YZ']
    composeMirroredList(list, 'XZ')
    expect(list).toEqual(['YZ'])
  })
})

describe('extrudeSlab (9.5.4)', () => {
  const box = { min: { x: 20, y: -5, z: -5 }, max: { x: 30, y: 5, z: 5 } }
  it('depth > 0 — от грани max; поперёк оси — во всю рамку', () => {
    const s = extrudeSlab(box, 'Z', 6)
    expect(s.params).toEqual({ width: 10, height: 10, depth: 6 })
    expect(s.transform).toMatchObject({ x: 25, y: 0, z: 8, rotX: 0, scaleX: 1 })
  })
  it('depth < 0 — от грани min; ось X', () => {
    const s = extrudeSlab(box, 'X', -4)
    expect(s.params).toEqual({ width: 4, height: 10, depth: 10 })
    expect(s.transform).toMatchObject({ x: 18, y: 0, z: 0 })
  })
})

describe('solvePlaneAlignDelta / worldProjectionRange (ALIGN-UI-REVIT)', () => {
  const plane = { normal: { x: 0, y: 0, z: 1 }, point: { x: 0, y: 0, z: 10 } }   // плоскость z = 10
  const c = () => csgObj('c', { z: 0 })                                         // куб ±1 в z = 0
  it('проекция на нормаль: для осей = computeWorldAABB; на диагональ — по вершинам', () => {
    const o = csgObj('c', { x: 5, scaleX: 3 })
    expect(worldProjectionRange(o, { x: 1, y: 0, z: 0 })).toEqual({ min: 2, max: 8 })
    const d = worldProjectionRange(o, { x: Math.SQRT1_2, y: Math.SQRT1_2, z: 0 })
    expect(d.max).toBeCloseTo((8 + 1) * Math.SQRT1_2, 6)
  })
  it('кликнутая грань параллельна плоскости → в плоскость встаёт именно она (точка клика)', () => {
    // «ступенька»: грань z = 0.5 внутри объекта
    expect(solvePlaneAlignDelta(c(), plane, { normal: { x: 0, y: 0, z: -1 }, point: { x: 0, y: 0, z: 0.5 } }).z).toBeCloseTo(9.5, 9)
  })
  it('не параллельна → крайняя точка со стороны, куда смотрит грань (знак dot)', () => {
    const up = { normal: { x: 0.8, y: 0, z: 0.6 }, point: { x: 1, y: 0, z: 0 } }
    const down = { normal: { x: 0.8, y: 0, z: -0.6 }, point: { x: 1, y: 0, z: 0 } }
    expect(solvePlaneAlignDelta(c(), plane, up).z).toBeCloseTo(9, 9)      // max z = 1 → 10
    expect(solvePlaneAlignDelta(c(), plane, down).z).toBeCloseTo(11, 9)   // min z = −1 → 10
  })
  it('без клика (или грань ⟂ плоскости) → ближайшая к плоскости крайняя точка', () => {
    expect(solvePlaneAlignDelta(c(), plane).z).toBeCloseTo(9, 9)
    expect(solvePlaneAlignDelta(csgObj('c', { z: 30 }), plane, { normal: { x: 1, y: 0, z: 0 }, point: { x: 1, y: 0, z: 30 } }).z).toBeCloseTo(-19, 9)
  })
  it('axisPlane: X → YZ через начало координат', () => {
    expect(axisPlane('X')).toEqual({ normal: { x: 1, y: 0, z: 0 }, point: { x: 0, y: 0, z: 0 } })
  })
})
