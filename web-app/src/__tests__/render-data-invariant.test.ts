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
// Этап 8.5.5 расширит покрытие на import_mesh / csg / mirror / fillet / resize.
// ============================================================

import { describe, it, expect, afterAll } from 'vitest'
import * as THREE from 'three'
import { applyTransformToPivot } from '../components/viewport-hooks'
import { workerBuildShape, workerClearAll } from './worker-bridge'
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
