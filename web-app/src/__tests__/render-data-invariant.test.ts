// ============================================================
// RENDER = DATA — CI-инвариант (Фаза 8.5, Этап 8.5.3)
// ============================================================
// После удаления centerGeometry во вьюпорте конвенция становится плоской:
//
//   world_render(i) = matrixWorld · vertices[i]   (Three.js)
//   world_data(i)   = R(XYZ) · S · vertices[i] + pos   (SceneObject.transform)
//
//   vertices — ВСЕГДА в origin (COM), transform — мировой pivot.
//
// Тест берёт ПРОДАКШН-функцию applyTransformToPivot (viewport-hooks.ts) —
// единственное место, где transform превращается в матрицу рендера.
// data-сторона считается через computeRSMatrix (общая математика worker/STL) —
// независимо от Three.js. Если конвенции разойдутся, тест упадёт.
//
// Этап 8.5.5: расширение на import_mesh / csg / mirror / fillet / resize.
// ============================================================

import { describe, it, expect, afterAll } from 'vitest'
import * as THREE from 'three'
import { applyTransformToPivot } from '../components/viewport-hooks'
import {
  workerBuildShape,
  workerClearAll,
  workerBuildImportedMesh,
  workerCsgBooleanWithSync,
  workerMirrorObject,
  workerApplyFillet,
} from './worker-bridge'
import { computeRSMatrix } from '../csg/worker-matrix'
import type { ShapeType, ShapeParams, TransformNR } from '../csg/types'

const IDENTITY: TransformNR = {
  x: 0, y: 0, z: 0,
  rotX: 0, rotY: 0, rotZ: 0,
  scaleX: 1, scaleY: 1, scaleZ: 1,
}

function tr(over: Partial<TransformNR>): TransformNR {
  return { ...IDENTITY, ...over }
}

// data-world = applyTRS(transform, v) через ПРОДАКШН-математику worker/STL
// (computeRSMatrix: Three.js XYZ Euler = Rx·Ry·Rz, углы в градусах).
function dataWorld(x: number, y: number, z: number, t: TransformNR): [number, number, number] {
  const [r00, r01, r02, r10, r11, r12, r20, r21, r22] = computeRSMatrix(
    { rotX: t.rotX, rotY: t.rotY, rotZ: t.rotZ },
    { scaleX: t.scaleX, scaleY: t.scaleY, scaleZ: t.scaleZ },
  )
  return [
    r00 * x + r01 * y + r02 * z + t.x,
    r10 * x + r11 * y + r12 * z + t.y,
    r20 * x + r21 * y + r22 * z + t.z,
  ]
}

// Ровно то же дерево Three.js, что useMeshSync (create-путь):
// geometry = vertices БЕЗ translate, mesh внутри pivot, pivot = transform.
function buildRenderTree(
  vertices: Float32Array,
  indices: Uint32Array,
  transform: TransformNR,
): THREE.Mesh {
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
  geometry.setIndex(new THREE.BufferAttribute(indices, 1))
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial())
  const pivot = new THREE.Object3D()
  pivot.add(mesh)
  applyTransformToPivot(pivot, transform)   // ← ПРОДАКШН-функция вьюпорта
  pivot.updateMatrixWorld(true)
  return mesh
}

function maxRenderDataDiff(
  mesh: THREE.Mesh,
  transform: TransformNR,
): number {
  const pos = mesh.geometry.getAttribute('position') as THREE.BufferAttribute
  const arr = pos.array as Float32Array
  const out = new THREE.Vector3()
  let maxDiff = 0
  for (let i = 0; i < arr.length; i += 3) {
    out.set(arr[i], arr[i + 1], arr[i + 2]).applyMatrix4(mesh.matrixWorld)
    const [dx, dy, dz] = dataWorld(arr[i], arr[i + 1], arr[i + 2], transform)
    const diff = Math.sqrt((out.x - dx) ** 2 + (out.y - dy) ** 2 + (out.z - dz) ** 2)
    if (diff > maxDiff) maxDiff = diff
  }
  return maxDiff
}

describe('Render = data (Этап 8.5.3)', () => {
  afterAll(() => {
    workerClearAll()
  })

  // 7 примитивов: симметричные (куб/сфера/цилиндр/тор) и асимметричные
  // по Y (конус/пирамида) — именно на последних раньше «съедался»
  // bbox-центр через centerGeometry.
  const PRIMITIVES: Array<{ shapeType: ShapeType; params: ShapeParams }> = [
    { shapeType: 'cube', params: { width: 10, height: 10, depth: 10 } },
    { shapeType: 'sphere', params: { radius: 5 } },
    { shapeType: 'cylinder', params: { radius: 5, height: 10 } },
    { shapeType: 'cone', params: { radius: 5, height: 10 } },
    { shapeType: 'torus', params: { torusRadius: 8, tubeRadius: 3 } },
    { shapeType: 'prism', params: { radius: 5, height: 10, sides: 6 } },
    { shapeType: 'pyramid', params: { radius: 5, height: 10, sides: 4 } },
  ]

  for (const { shapeType, params } of PRIMITIVES) {
    it(`${shapeType}: mesh.matrixWorld · v === applyTRS(transform, v)`, async () => {
      const res = await workerBuildShape(`rd_${shapeType}`, shapeType, params, tr({}))
      const transform = tr({ x: 12, y: 34, z: 56 })
      const mesh = buildRenderTree(res.vertices, res.indices, transform)

      const diff = maxRenderDataDiff(mesh, transform)
      console.log(`  ${shapeType}: max |render − data| = ${diff.toExponential(3)}`)
      expect(diff).toBeLessThan(1e-4)
    })
  }

  it.each([
    ['spawn + поворот', tr({ x: 20, y: 5, z: -7, rotX: 30, rotY: 45, rotZ: 0 })],
    ['spawn + неравномерный scale', tr({ x: -15, y: 2, z: 8, scaleX: 2, scaleY: 0.5, scaleZ: 1.5 })],
    ['поворот + scale вместе', tr({ x: 3, y: -4, z: 9, rotX: 10, rotY: 20, rotZ: 30, scaleX: 0.7, scaleY: 1.3, scaleZ: 2 })],
  ])('%s: render world === data world (cube)', async (_label, transform) => {
    const res = await workerBuildShape('rd_cube_xform', 'cube', { width: 10, height: 10, depth: 10 }, tr({}))
    const mesh = buildRenderTree(res.vertices, res.indices, transform)

    const diff = maxRenderDataDiff(mesh, transform)
    console.log(`  ${_label}: max |render − data| = ${diff.toExponential(3)}`)
    expect(diff).toBeLessThan(1e-4)
  })

  // Асимметричный примитив с полным TRS — главный регресс-тест на
  // centerGeometry: раньше вьюпорт вычитал bbox-центр, и render расходился
  // с данными на |bboxCenter(origin)| (для конуса h=10 → 2.5 по Y).
  it('cone + TRS: без bbox-компенсации (регресс centerGeometry)', async () => {
    const res = await workerBuildShape('rd_cone_trs', 'cone', { radius: 5, height: 10 }, tr({}))
    const transform = tr({ x: 10, y: 20, z: 30, rotX: 25, rotY: 15, rotZ: 5, scaleX: 1.5, scaleY: 0.8, scaleZ: 1.2 })
    const mesh = buildRenderTree(res.vertices, res.indices, transform)

    const diff = maxRenderDataDiff(mesh, transform)
    console.log(`  cone+TRS: max |render − data| = ${diff.toExponential(3)}`)
    expect(diff).toBeLessThan(1e-4)
  })

  // Геометрия в буфере равна данным без изменений (никакого translate в
  // create/update-пути): arr[i] === vertices[i]. COM ≈ 0 обеспечивает
  // worker (8.5.1), здесь проверяется, что рендер его не портит.
  it.each(PRIMITIVES.map((p) => [p.shapeType, p.params] as const))(
    '%s: geometry.position === SceneObject.vertices (translate нет)',
    async (shapeType, params) => {
      const res = await workerBuildShape(`rdcom_${shapeType}`, shapeType, params, tr({}))
      const mesh = buildRenderTree(res.vertices, res.indices, tr({ x: 5, y: 5, z: 5 }))

      const pos = mesh.geometry.getAttribute('position') as THREE.BufferAttribute
      const arr = pos.array as Float32Array
      expect(arr.length).toBe(res.vertices.length)
      for (let i = 0; i < arr.length; i++) {
        expect(arr[i]).toBe(res.vertices[i])
      }
    },
  )
})

// ============================================================
// Этап 8.5.5: расширение на import_mesh / csg / mirror / fillet
// ============================================================

describe('Render = data (Этап 8.5.5 — import_mesh / csg / mirror / fillet)', () => {
  afterAll(() => {
    workerClearAll()
  })

  // ── import_mesh ──────────────────────────────────────────
  // store (importStl, 8.5.3) центрирует vertices по COM и ставит
  // pivot = COM исходного меша. Проверяем, что render == data.
  it('import_mesh: render world === data world', async () => {
    // Сырой меш со смещением (как STL с pivot не в центре)
    const rawVerts = [
      100, 200, 300, 110, 200, 300, 100, 210, 300,  // треугольник
      100, 200, 300, 100, 210, 300, 100, 200, 310,
    ]
    const rawIdx = [0, 1, 2, 3, 4, 5]
    const res = await workerBuildImportedMesh('rd_import', rawVerts, rawIdx)

    // store-логика (document-store.ts importStl): COM-центрирование
    // centerMassAtOrigin мутирует vertices in-place, pivot = COM
    // Здесь воспроизводим вычисление COM и pivot
    const verts = new Float32Array(res.vertices)
    const idx = new Uint32Array(res.indices)
    // COM = sum(вершин треугольников × площадь) / sum(площадей)
    // Для теста достаточно bbox-центра (в реальном store — centerMassAtOrigin)
    // Но workerBuildImportedMesh НЕ центрирует, поэтому pivot = COM(verts)
    // Воспользуемся тем, что vertices здесь = rawVerts (worker не центрирует)
    const comX = 100 + 10 / 3  // среднее X трёх уникальных вершин ≈ 103.33
    const comY = 200 + 10 / 3
    const comZ = 300 + 10 / 3
    // pivot = COM, vertices = verts − COM (store центрирует)
    const centeredVerts = new Float32Array(verts.length)
    for (let i = 0; i < verts.length; i += 3) {
      centeredVerts[i] = verts[i] - comX
      centeredVerts[i + 1] = verts[i + 1] - comY
      centeredVerts[i + 2] = verts[i + 2] - comZ
    }
    const pivot = tr({ x: comX, y: comY, z: comZ })
    const mesh = buildRenderTree(centeredVerts, idx, pivot)

    const diff = maxRenderDataDiff(mesh, pivot)
    console.log(`  import_mesh: max |render − data| = ${diff.toExponential(3)}`)
    expect(diff).toBeLessThan(1e-4)
  })

  // ── CSG union ────────────────────────────────────────────
  it('CSG union (cube+prism): render world === data world', async () => {
    const cubeT = tr({ x: 0, y: 0, z: 0 })
    const prismT = tr({ x: 10, y: 0, z: 0 })
    // Синхронизируем operands в воркер через workerCsgBooleanWithSync
    const csgRes = await workerCsgBooleanWithSync(
      'cube', 'prism', 'union', 'rd_csg_u',
      cubeT, prismT,
      { shapeType: 'cube', params: { width: 10, height: 10, depth: 10 } as ShapeParams },
      { shapeType: 'prism', params: { radius: 5, height: 10, sides: 3 } as ShapeParams },
    )
    // CSG-конвенция: pivot = transformA, vertices = world − transformA
    // (store.csgBoolean: pivot = tA, vertices COM-центрированы + (COM − tA))
    // Проверяем что рендер с pivot = cubeT == data world
    const mesh = buildRenderTree(csgRes.vertices, csgRes.indices, cubeT)
    const diff = maxRenderDataDiff(mesh, cubeT)
    console.log(`  CSG union: max |render − data| = ${diff.toExponential(3)}`)
    expect(diff).toBeLessThan(1e-4)
  })

  // ── CSG difference ───────────────────────────────────────
  it('CSG difference (cube-sphere): render world === data world', async () => {
    const cubeT = tr({ x: 20, y: 5, z: 0 })
    const sphereT = tr({ x: 25, y: 5, z: 0 })
    const csgRes = await workerCsgBooleanWithSync(
      'cube', 'sphere', 'subtract', 'rd_csg_d',
      cubeT, sphereT,
      { shapeType: 'cube', params: { width: 12, height: 12, depth: 12 } as ShapeParams },
      { shapeType: 'sphere', params: { radius: 5 } as ShapeParams },
    )
    const mesh = buildRenderTree(csgRes.vertices, csgRes.indices, cubeT)
    const diff = maxRenderDataDiff(mesh, cubeT)
    console.log(`  CSG difference: max |render − data| = ${diff.toExponential(3)}`)
    expect(diff).toBeLessThan(1e-4)
  })

  // ── Mirror ───────────────────────────────────────────────
  it('mirror (YZ): render world === data world', async () => {
    const srcT = tr({ x: 30, y: 0, z: 0 })
    await workerBuildShape('rd_mirror_src', 'cube', { width: 10, height: 10, depth: 10 } as ShapeParams, srcT)
    // workerMirrorObject(objId, plane, shapeType?, params?, transform?, mirrorCenter?)
    const mirrorT = tr({ x: -30, y: 0, z: 0 })
    const mirrored = await workerMirrorObject('rd_mirror_src', 'YZ', 'cube', { width: 10, height: 10, depth: 10 }, mirrorT)
    const mesh = buildRenderTree(mirrored.vertices, mirrored.indices, mirrorT)
    const diff = maxRenderDataDiff(mesh, mirrorT)
    console.log(`  mirror YZ: max |render − data| = ${diff.toExponential(3)}`)
    expect(diff).toBeLessThan(1e-4)
  })

  // ── Fillet (cube) ────────────────────────────────────────
  it('fillet (cube, r=2): render world === data world', async () => {
    const filletRes = await workerApplyFillet('rd_fillet', 'cube', { width: 10, height: 10, depth: 10 } as ShapeParams, 2, tr({}))
    const transform = tr({ x: 15, y: 15, z: 15 })
    const mesh = buildRenderTree(filletRes.vertices, filletRes.indices, transform)
    const diff = maxRenderDataDiff(mesh, transform)
    console.log(`  fillet cube r=2: max |render − data| = ${diff.toExponential(3)}`)
    expect(diff).toBeLessThan(1e-4)
  })

  // ── Resize (scale в transform, vertices不变) ──────────────
  // resizeObject в store меняет только transform.scaleX/Y/Z — vertices остаются.
  // Проверяем, что scale в transform корректно отражается в рендере.
  it('resize (cube scale 0.5,2,1.5): render world === data world', async () => {
    const res = await workerBuildShape('rd_resize', 'cube', { width: 10, height: 10, depth: 10 } as ShapeParams, tr({}))
    const transform = tr({ x: 25, y: 0, z: 0, scaleX: 0.5, scaleY: 2, scaleZ: 1.5 })
    const mesh = buildRenderTree(res.vertices, res.indices, transform)
    const diff = maxRenderDataDiff(mesh, transform)
    console.log(`  resize scale(0.5,2,1.5): max |render − data| = ${diff.toExponential(3)}`)
    expect(diff).toBeLessThan(1e-4)
  })

  // ── CSG инварианты (восстановление из 8.5.2.5) ──────────
  // CSG-union двух непересекающихся объектов: все вершины
  // операндов должны присутствовать в результате (drift < 1e-6).
  it('CSG union (cube+prism): vertex count invariant (14 = 8 + 6)', async () => {
    const cubeT = tr({ x: 0, y: 0, z: 0 })
    const prismT = tr({ x: 15, y: 0, z: 0 }) // не пересекаются: cube bbox=[-5,5], prism bbox=[10,20]
    const csgRes = await workerCsgBooleanWithSync(
      'cube', 'prism', 'union', 'rd_csg_union_vc',
      cubeT, prismT,
      { shapeType: 'cube', params: { width: 10, height: 10, depth: 10 } as ShapeParams },
      { shapeType: 'prism', params: { radius: 5, height: 10, sides: 3 } as ShapeParams },
    )
    // cube: 8 вершин, prism: 6 вершин, union: 14 = 8 + 6
    const csgVertCount = csgRes.vertices.length / 3
    const expectedVertCount = 8 + 6 // 14
    console.log(`  CSG union vertex count: ${csgVertCount} (expected ${expectedVertCount})`)
    expect(csgVertCount).toBe(expectedVertCount)
  })

  // CSG world-вершины = world-вершины операндов (outside).
  // Для непересекающихся объектов union = набор всех world-вершин.
  it('CSG union (cube+prism): all operand world-vertices present', async () => {
    const cubeT = tr({ x: 0, y: 0, z: 0 })
    const prismT = tr({ x: 15, y: 0, z: 0 })
    const csgRes = await workerCsgBooleanWithSync(
      'cube', 'prism', 'union', 'rd_csg_union_wp',
      cubeT, prismT,
      { shapeType: 'cube', params: { width: 10, height: 10, depth: 10 } as ShapeParams },
      { shapeType: 'prism', params: { radius: 5, height: 10, sides: 3 } as ShapeParams },
    )

    // Генерируем эталонные world-вершины операндов напрямую через worker
    const cubeRes = await workerBuildShape('rd_wp_cube', 'cube', { width: 10, height: 10, depth: 10 } as ShapeParams, tr({}))
    const prismRes = await workerBuildShape('rd_wp_prism', 'prism', { radius: 5, height: 10, sides: 3 } as ShapeParams, tr({}))

    // World-вершины операндов
    const cubeWorld = new Set<string>()
    for (let i = 0; i < cubeRes.vertices.length; i += 3) {
      const [wx, wy, wz] = dataWorld(cubeRes.vertices[i], cubeRes.vertices[i + 1], cubeRes.vertices[i + 2], cubeT)
      cubeWorld.add(`${wx.toFixed(4)},${wy.toFixed(4)},${wz.toFixed(4)}`)
    }
    const prismWorld = new Set<string>()
    for (let i = 0; i < prismRes.vertices.length; i += 3) {
      const [wx, wy, wz] = dataWorld(prismRes.vertices[i], prismRes.vertices[i + 1], prismRes.vertices[i + 2], prismT)
      prismWorld.add(`${wx.toFixed(4)},${wy.toFixed(4)},${wz.toFixed(4)}`)
    }

    // Проверяем что все world-вершины операндов найдены в CSG
    const csgPos = csgRes.vertices
    let foundCube = 0, foundPrism = 0
    const tolerance = 0.01
    for (const key of cubeWorld) {
      const [tx, ty, tz] = key.split(',').map(Number)
      let found = false
      for (let i = 0; i < csgPos.length; i += 3) {
        const dx = csgPos[i] - tx, dy = csgPos[i + 1] - ty, dz = csgPos[i + 2] - tz
        if (Math.sqrt(dx * dx + dy * dy + dz * dz) < tolerance) { found = true; break }
      }
      if (found) foundCube++
    }
    for (const key of prismWorld) {
      const [tx, ty, tz] = key.split(',').map(Number)
      let found = false
      for (let i = 0; i < csgPos.length; i += 3) {
        const dx = csgPos[i] - tx, dy = csgPos[i + 1] - ty, dz = csgPos[i + 2] - tz
        if (Math.sqrt(dx * dx + dy * dy + dz * dz) < tolerance) { found = true; break }
      }
      if (found) foundPrism++
    }

    console.log(`  CSG union vertex truth: cube=${foundCube}/8, prism=${foundPrism}/6`)
    expect(foundCube).toBe(8)
    expect(foundPrism).toBe(6)
  })
})
