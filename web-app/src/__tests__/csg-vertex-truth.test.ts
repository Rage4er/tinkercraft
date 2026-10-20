// ============================================================
// csg-vertex-truth.test.ts — Независимая проверка world-координат CSG
// ============================================================
//
// Все предыдущие тесты зелёные, но пользователь видит сдвиг.
// Причина: oracle = тот же worker → оба сдвинуты, diff = 0.
//
// Этот тест: полностью независимая реализация (НЕ worker).
// Школьнический подход: вручную применяем TRS к каждой вершине,
// затем проверяем, что вершины операндов, оказавшиеся снаружи
// другого операнда, присутствуют в мировом мешу CSG-результата.
//
// Если pivot CSG = COM (а не transformA) — все CSG world vertices
// сдвинуты, outside-вершины НЕ найдутся → тест упадёт с точными числами.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useDocumentStore } from '../store/document-store'
import { clearSnapshots } from '../store/snapshots'
import { clearTree } from '../csg/history-tree'
import * as THREE from 'three'
import { createElement, useRef, act, type MutableRefObject } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { useMeshSync } from '../components/viewport-hooks'
import * as bridge from './worker-bridge'
import type { TransformNR, SceneObject, GroupOperation } from '../csg/types'

  // React 18 требует флаг окружения для act()
  ; (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

vi.mock('../csg/worker-client', async () => {
  const b = await import('./worker-bridge')
  return {
    workerBuildShape: b.workerBuildShape,
    workerApplyFillet: b.workerApplyFillet,
    workerBuildImportedMesh: b.workerBuildImportedMesh,
    workerSyncObjects: b.workerSyncObjects,
    workerSyncMesh: b.workerSyncMesh,
    workerCsgBoolean: b.workerCsgBoolean,
    workerCsgBooleanWithSync: b.workerCsgBooleanWithSync,
    workerMirrorObject: b.workerMirrorObject,
    workerRebuildScene: b.workerRebuildScene,
    workerDeleteObjects: b.workerDeleteObjects,
    workerClearAll: b.workerClearAll,
    workerRebuildNode: b.workerRebuildNode,
    isWorkerReady: b.isWorkerReady,
    disposeWorker: b.disposeWorker,
  }
})

vi.mock('../csg/worker-client', async () => {
  const b = await import('./worker-bridge')
  return {
    workerBuildShape: b.workerBuildShape,
    workerApplyFillet: b.workerApplyFillet,
    workerBuildImportedMesh: b.workerBuildImportedMesh,
    workerSyncObjects: b.workerSyncObjects,
    workerSyncMesh: b.workerSyncMesh,
    workerCsgBoolean: b.workerCsgBoolean,
    workerCsgBooleanWithSync: b.workerCsgBooleanWithSync,
    workerMirrorObject: b.workerMirrorObject,
    workerRebuildScene: b.workerRebuildScene,
    workerDeleteObjects: b.workerDeleteObjects,
    workerClearAll: b.workerClearAll,
    workerRebuildNode: b.workerRebuildNode,
    isWorkerReady: b.isWorkerReady,
    disposeWorker: b.disposeWorker,
  }
})

const st = () => useDocumentStore.getState()

// ============================================================
// Независимая TRS-математика (НЕ worker)
// ============================================================

/**
 * Применить TRS (Translation → Rotation → Scale) к вершине.
 * Порядок: scale → rotation (Euler XYZ, R = Rx·Ry·Rz) → translation.
 * Матрица: column-major 4×4 [RS, 0; pos, 1].
 *
 * Это полная копия worker-matrix.ts computeRSMatrix + buildTransformMatrix,
 * но в виде простой функции v' = RS·v + pos.
 */
function applyTRS(v: [number, number, number], t: TransformNR): [number, number, number] {
  let [x, y, z] = v

  // 1. Scale
  x *= t.scaleX
  y *= t.scaleY
  z *= t.scaleZ

  // 2. Rotation — Euler XYZ (Three.js intrinsic): R = Rx · Ry · Rz
  const rx = t.rotX * Math.PI / 180
  const ry = t.rotY * Math.PI / 180
  const rz = t.rotZ * Math.PI / 180
  const cx = Math.cos(rx), sx = Math.sin(rx)
  const cy = Math.cos(ry), sy = Math.sin(ry)
  const cz = Math.cos(rz), sz = Math.sin(rz)

  // R = Rx · Ry · Rz, column-major multiply: v' = R · v
  const r00 = cy * cz
  const r01 = -cy * sz
  const r02 = sy
  const r10 = cx * sz + sx * sy * cz
  const r11 = cx * cz - sx * sy * sz
  const r12 = -sx * cy
  const r20 = -cx * sy * cz + sx * sz
  const r21 = cx * sy * sz + sx * cz
  const r22 = cx * cy

  const x2 = r00 * x + r01 * y + r02 * z
  const y2 = r10 * x + r11 * y + r12 * z
  const z2 = r20 * x + r21 * y + r22 * z

  // 3. Translation
  return [x2 + t.x, y2 + t.y, z2 + t.z]
}

/** CSG-результат: world = pivot + vertex (pivot rot/scale = identity). */
function csgWorldVerts(obj: SceneObject): Float32Array {
  const out = new Float32Array(obj.vertices.length)
  for (let i = 0; i < obj.vertices.length; i += 3) {
    out[i] = obj.vertices[i] + obj.transform.x
    out[i + 1] = obj.vertices[i + 1] + obj.transform.y
    out[i + 2] = obj.vertices[i + 2] + obj.transform.z
  }
  return out
}

// ============================================================
// Независимая геометрия (НЕ worker)
// ============================================================

/** 8 вершин куба 20×20×20, центрированного в origin. */
function cube8Verts(): Float32Array {
  const s = 10
  return new Float32Array([
    -s, -s, -s, s, -s, -s, s, s, -s, -s, s, -s,
    -s, -s, s, s, -s, s, s, s, s, -s, s, s,
  ])
}

/** 6 вершин треугольной призмы (radius=12, height=20, center=true).
 *  Manifold.cylinder(h, r, r, 3, true).
 *  3 вершины на z = -h/2 = -10, 3 на z = h/2 = +10. */
function prism6Verts(): Float32Array {
  const r = 12
  const h2 = 10
  const a0 = 0, a1 = 2 * Math.PI / 3, a2 = 4 * Math.PI / 3
  return new Float32Array([
    // z = -10
    Math.cos(a0) * r, Math.sin(a0) * r, -h2,
    Math.cos(a1) * r, Math.sin(a1) * r, -h2,
    Math.cos(a2) * r, Math.sin(a2) * r, -h2,
    // z = +10
    Math.cos(a0) * r, Math.sin(a0) * r, h2,
    Math.cos(a1) * r, Math.sin(a1) * r, h2,
    Math.cos(a2) * r, Math.sin(a2) * r, h2,
  ])
}

/** AABB для набора точек. */
function bbox(pts: Float32Array) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < pts.length; i += 3) {
    for (let a = 0; a < 3; a++) {
      if (pts[i + a] < min[a]) min[a] = pts[i + a]
      if (pts[i + a] > max[a]) max[a] = pts[i + a]
    }
  }
  return { min, max }
}

/** Расстояние между двумя точками. */
function dist3(a: [number, number, number], b: [number, number, number]): number {
  const dx = a[0] - b[0], dy = a[1] - b[1], dz = a[2] - b[2]
  return Math.sqrt(dx * dx + dy * dy + dz * dz)
}

/** Ближайшая точка в списке вершин. */
function nearestInList(pt: [number, number, number], verts: Float32Array): number {
  let d = Infinity
  for (let i = 0; i < verts.length; i += 3) {
    const dx = pt[0] - verts[i], dy = pt[1] - verts[i + 1], dz = pt[2] - verts[i + 2]
    const dd = dx * dx + dy * dy + dz * dz
    if (dd < d) d = dd
  }
  return Math.sqrt(d)
}

// ============================================================
// Point-in-mesh (raycasting, independent)
// ============================================================

/** Raycast vs треугольник (Möller–Trumbore). */
function rayTriangleIntersect(
  orig: [number, number, number], dir: [number, number, number],
  v0: [number, number, number], v1: [number, number, number], v2: [number, number, number],
): boolean {
  const EPS = 1e-10
  const e1 = [v1[0] - v0[0], v1[1] - v0[1], v1[2] - v0[2]]
  const e2 = [v2[0] - v0[0], v2[1] - v0[1], v2[2] - v0[2]]
  const h = [dir[1] * e2[2] - dir[2] * e2[1], dir[2] * e2[0] - dir[0] * e2[2], dir[0] * e2[1] - dir[1] * e2[0]]
  const a = e1[0] * h[0] + e1[1] * h[1] + e1[2] * h[2]
  if (a > -EPS && a < EPS) return false // parallel
  const f = 1 / a
  const s = [orig[0] - v0[0], orig[1] - v0[1], orig[2] - v0[2]]
  const u = f * (s[0] * h[0] + s[1] * h[1] + s[2] * h[2])
  if (u < 0 || u > 1) return false
  const q = [
    s[1] * e1[2] - s[2] * e1[1],
    s[2] * e1[0] - s[0] * e1[2],
    s[0] * e1[1] - s[1] * e1[0],
  ]
  const v = f * (dir[0] * q[0] + dir[1] * q[1] + dir[2] * q[2])
  if (v < 0 || u + v > 1) return false
  return true
}

/** Raycasting point-in-polyhedron через чётность пересечений с лучом +X. */
function isPointInsideMesh(
  pt: [number, number, number],
  verts: Float32Array, indices: Uint32Array,
): boolean {
  const dir: [number, number, number] = [1, 0, 0]
  let hits = 0
  for (let i = 0; i < indices.length; i += 3) {
    const i0 = indices[i] * 3, i1 = indices[i + 1] * 3, i2 = indices[i + 2] * 3
    if (rayTriangleIntersect(
      pt, dir,
      [verts[i0], verts[i0 + 1], verts[i0 + 2]] as [number, number, number],
      [verts[i1], verts[i1 + 1], verts[i1 + 2]] as [number, number, number],
      [verts[i2], verts[i2 + 1], verts[i2 + 2]] as [number, number, number],
    )) hits++
  }
  return hits % 2 === 1
}

// ============================================================
// Независимая призма: вершины + индексы (для point-in-mesh)
// ============================================================

/** Независимая треугольная призма: вершины + индексы для raycasting.
 *  6 вершин, 3 прямоугольные грани + 2 треугольные крышки = 9 треугольников. */
function independentPrismMesh(r: number, h: number) {
  const h2 = h / 2
  const a0 = 0, a1 = 2 * Math.PI / 3, a2 = 4 * Math.PI / 3
  const cos = [Math.cos(a0), Math.cos(a1), Math.cos(a2)]
  const sin = [Math.sin(a0), Math.sin(a1), Math.sin(a2)]
  const verts: number[] = []
  for (let k = 0; k < 3; k++) {
    verts.push(cos[k] * r, sin[k] * r, -h2)
    verts.push(cos[k] * r, sin[k] * r, h2)
  }
  // 3 side quads → 6 tris, 2 caps → 2 tris = 8 tris = 24 indices
  const indices = [
    // side quad 0 (verts 0,1, 2,3)
    0, 2, 1, 0, 1, 3,
    // side quad 1 (verts 2,3, 4,5)
    2, 4, 3, 3, 4, 5,
    // side quad 2 (verts 4,5, 0,1)
    4, 0, 5, 5, 0, 1,
    // top cap (verts 3,4,5)
    3, 4, 5,
    // bottom cap (verts 1,2,0) — flipped winding
    1, 0, 2,
  ]
  return { verts: new Float32Array(verts), indices: new Uint32Array(indices) }
}

// ============================================================
// Тесты
// ============================================================

describe('CSG vertex truth — независимая проверка world-координат', () => {
  beforeEach(async () => {
    useDocumentStore.setState({ objects: {}, operations: [], historyIndex: 0, selectedIds: [], busy: false })
    clearSnapshots()
    clearTree()
    await bridge.workerClearAll()
  }, 30000)

  it('CSG union: outside vertices preserved (independent TRS + raycast)', async () => {
    // ── 1. Куб (20,20,20) identity на (20,20,20) ──
    await st().addShape('cube', { width: 20, height: 20, depth: 20 })
    const cubeId = Object.keys(st().objects).find(id => st().objects[id].shapeType === 'cube')!
    await st().moveObject(cubeId, { x: 20, y: 20, z: 20, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 })
    const cubeTransform: TransformNR = { ...st().objects[cubeId].transform }

    // ── 2. Призма sides=3 на (20,20,20) rot(20,20,20) scale(1,1,0.5) ──
    await st().addShape('prism', { radius: 12, height: 20, sides: 3 })
    const prismId = Object.keys(st().objects).find(id => st().objects[id].shapeType === 'prism')!
    const prismTransform: TransformNR = { x: 20, y: 20, z: 20, rotX: 20, rotY: 20, rotZ: 20, scaleX: 1, scaleY: 1, scaleZ: 0.5 }
    await st().moveObject(prismId, prismTransform)

    // ── 3. Независимые world-вершины (НЕ worker) ──
    const cubeOrigVerts = cube8Verts()
    const cubeWorldVerts: [number, number, number][] = []
    for (let i = 0; i < cubeOrigVerts.length; i += 3) {
      cubeWorldVerts.push(applyTRS([cubeOrigVerts[i], cubeOrigVerts[i + 1], cubeOrigVerts[i + 2]], cubeTransform))
    }

    const prismOrigVerts = prism6Verts()
    const prismWorldVerts: [number, number, number][] = []
    for (let i = 0; i < prismOrigVerts.length; i += 3) {
      prismWorldVerts.push(applyTRS([prismOrigVerts[i], prismOrigVerts[i + 1], prismOrigVerts[i + 2]], prismTransform))
    }

    // ── 4. CSG union (production) ──
    st().selectObjects([cubeId, prismId], false)
    await st().csgBoolean('union')
    const ops = st().operations
    let csgId = ''
    for (let i = ops.length - 1; i >= 0; i--) if (ops[i].type === 'group') csgId = (ops[i] as GroupOperation).resultId!
    const csg = st().objects[csgId]
    expect(csg).toBeTruthy()

    // ── 5. CSG world-вершины: world = pivot + vertex ──
    const csgWorld = csgWorldVerts(csg)

    // ── 6. Независимая призма (mesh для raycasting) ──
    const primMesh = independentPrismMesh(12, 20)
    const primWorldMesh: number[] = []
    for (let i = 0; i < primMesh.verts.length; i += 3) {
      const w = applyTRS([primMesh.verts[i], primMesh.verts[i + 1], primMesh.verts[i + 2]], prismTransform)
      primWorldMesh.push(w[0], w[1], w[2])
    }
    const primWorldIndices = primMesh.indices

    // ── 7. Куб AABB (без rot/scale → bbox точный) ──
    const cubeBBox = bbox(new Float32Array(cubeWorldVerts.flatMap(v => v)))

    // ── 8. Проверка: вершины куба, оказавшиеся ПРИЗМОЙ, должны быть в CSG ──
    const TOL = 1e-3
    const cubeOutsidePrism: [number, number, number][] = []
    for (const v of cubeWorldVerts) {
      if (!isPointInsideMesh(v, new Float32Array(primWorldMesh), primWorldIndices)) {
        cubeOutsidePrism.push(v)
      }
    }

    const cubeOutsidePrismMissing: { pt: [number, number, number]; dist: number }[] = []
    for (const v of cubeOutsidePrism) {
      const d = nearestInList(v, csgWorld)
      if (d > TOL) {
        cubeOutsidePrismMissing.push({ pt: v, dist: d })
      }
    }

    // ── 9. Проверка: вершины призмы, оказавшиеся ВНЕ КУБА, должны быть в CSG ──
    const prismOutsideCube: [number, number, number][] = []
    for (const v of prismWorldVerts) {
      if (v[0] < cubeBBox.min[0] || v[0] > cubeBBox.max[0] ||
        v[1] < cubeBBox.min[1] || v[1] > cubeBBox.max[1] ||
        v[2] < cubeBBox.min[2] || v[2] > cubeBBox.max[2]) {
        prismOutsideCube.push(v)
      }
    }

    const prismOutsideCubeMissing: { pt: [number, number, number]; dist: number }[] = []
    for (const v of prismOutsideCube) {
      const d = nearestInList(v, csgWorld)
      if (d > TOL) {
        prismOutsideCubeMissing.push({ pt: v, dist: d })
      }
    }

    // ── 10. Отчёт ──
    console.log('=== CSG VERTEX TRUTH ===')
    console.log(`Cube transformA: [${cubeTransform.x}, ${cubeTransform.y}, ${cubeTransform.z}]`)
    console.log(`Prism transform: [${prismTransform.x}, ${prismTransform.y}, ${prismTransform.z}] rot(${prismTransform.rotX},${prismTransform.rotY},${prismTransform.rotZ}) scale(1,1,0.5)`)
    console.log(`Cube world corners (8): ${cubeWorldVerts.map(v => `[${v[0].toFixed(2)},${v[1].toFixed(2)},${v[2].toFixed(2)}]`).join(', ')}`)
    console.log(`Prism world corners (6): ${prismWorldVerts.map(v => `[${v[0].toFixed(2)},${v[1].toFixed(2)},${v[2].toFixed(2)}]`).join(', ')}`)
    console.log(`CSG pivot: [${csg.transform.x.toFixed(6)}, ${csg.transform.y.toFixed(6)}, ${csg.transform.z.toFixed(6)}]`)
    console.log(`CSG world vertices (first 5): ${Array.from(csgWorld.slice(0, 15)).map(n => n.toFixed(4)).join(', ')}`)
    console.log(`Cube world bbox: [${(cubeBBox.min as number[]).map(n => n.toFixed(2)).join(',')}] → [${(cubeBBox.max as number[]).map(n => n.toFixed(2)).join(',')}]`)
    console.log(`Cube corners outside prism: ${cubeOutsidePrism.length} of ${cubeWorldVerts.length}`)
    console.log(`Prism corners outside cube: ${prismOutsideCube.length} of ${prismWorldVerts.length}`)
    console.log(`CSG world vertex count: ${csgWorld.length / 3}`)
    console.log(`Missing cube→CSG: ${cubeOutsidePrismMissing.length}`)
    console.log(`Missing prism→CSG: ${prismOutsideCubeMissing.length}`)

    if (cubeOutsidePrismMissing.length > 0) {
      for (const m of cubeOutsidePrismMissing.slice(0, 3)) {
        console.log(`  MISSING cube vertex: [${m.pt[0].toFixed(4)}, ${m.pt[1].toFixed(4)}, ${m.pt[2].toFixed(4)}] dist to CSG = ${m.dist.toFixed(6)}`)
      }
    }
    if (prismOutsideCubeMissing.length > 0) {
      for (const m of prismOutsideCubeMissing.slice(0, 3)) {
        console.log(`  MISSING prism vertex: [${m.pt[0].toFixed(4)}, ${m.pt[1].toFixed(4)}, ${m.pt[2].toFixed(4)}] dist to CSG = ${m.dist.toFixed(6)}`)
      }
    }

    // ── 11. Asserts ──
    // Все куб-вершины вне призмы должны быть найдены в CSG result
    expect(cubeOutsidePrismMissing.length).toBe(0)
    expect(cubeOutsidePrism.length).toBeGreaterThan(0) // cube corners should be outside prism

    // Все призменные вершины вне куба должны быть найдены в CSG result
    expect(prismOutsideCubeMissing.length).toBe(0)
    expect(prismOutsideCube.length).toBeGreaterThan(0) // some prism corners should be outside cube
  }, 30000)

  // ──────────────────────────────────────────────────────────
  // RENDER PATH — проверяем то, что пользователь ВИДИТ в браузере
  // ──────────────────────────────────────────────────────────
  // useMeshSync монтирует THREE.Mesh в THREE.Scene, затем матрицы world
  // применяются Three.js рендерером. Мы извлекаем world-вершины из scene graph
  // (matrixWorld) и сверяем с независимым эталоном.

  type MeshMap = Map<string, { mesh: THREE.Mesh; pivot: THREE.Object3D }>
  let lastScene: THREE.Scene | null = null
  let lastMap: MeshMap | null = null
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => { root.unmount() })
    container.remove()
    lastScene = null
    lastMap = null
  })

  function renderMeshes(objects: SceneObject[]) {
    function Harness(props: { objects: SceneObject[] }) {
      const sceneRef: MutableRefObject<THREE.Scene | null> = useRef(new THREE.Scene())
      const mapRef: MutableRefObject<MeshMap> = useRef(new Map())
      useMeshSync(props.objects, true, sceneRef, mapRef, new Set<string>())
      lastScene = sceneRef.current
      lastMap = mapRef.current
      return null
    }
    act(() => { root.render(createElement(Harness, { objects })) })
    lastScene!.updateMatrixWorld(true)
  }

  function meshWorldVerts(id: string): Float32Array {
    const entry = lastMap!.get(id)!
    const pos = entry.mesh.geometry.getAttribute('position') as THREE.BufferAttribute
    const out = new Float32Array(pos.count * 3)
    const v = new THREE.Vector3()
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(entry.mesh.matrixWorld)
      out[i * 3] = v.x; out[i * 3 + 1] = v.y; out[i * 3 + 2] = v.z
    }
    return out
  }

  it('RENDER: CSG world vertices match independent TRS (real useMeshSync)', async () => {
    // ── 1. Создаём сцену (production) ──
    await st().addShape('cube', { width: 20, height: 20, depth: 20 })
    const cubeId = Object.keys(st().objects).find(id => st().objects[id].shapeType === 'cube')!
    await st().moveObject(cubeId, { x: 20, y: 20, z: 20, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 })
    const cubeTransform: TransformNR = { ...st().objects[cubeId].transform } // сохраняем ДО union

    await st().addShape('prism', { radius: 12, height: 20, sides: 3 })
    const prismId = Object.keys(st().objects).find(id => st().objects[id].shapeType === 'prism')!
    const prismTransform: TransformNR = { x: 20, y: 20, z: 20, rotX: 20, rotY: 20, rotZ: 20, scaleX: 1, scaleY: 1, scaleZ: 0.5 }
    await st().moveObject(prismId, prismTransform)

    st().selectObjects([cubeId, prismId], false)
    await st().csgBoolean('union')

    const ops = st().operations
    let csgId = ''
    for (let i = ops.length - 1; i >= 0; i--) if (ops[i].type === 'group') csgId = (ops[i] as GroupOperation).resultId!
    const csg = st().objects[csgId]
    expect(csg).toBeTruthy()

    // ── 2. Независимые world-вершины (НЕ worker) — cubeTransform уже сохранён выше ──
    const cubeOrigVerts = cube8Verts()
    const cubeWorldVerts: [number, number, number][] = []
    for (let i = 0; i < cubeOrigVerts.length; i += 3) {
      cubeWorldVerts.push(applyTRS([cubeOrigVerts[i], cubeOrigVerts[i + 1], cubeOrigVerts[i + 2]], cubeTransform))
    }

    const prismOrigVerts = prism6Verts()
    const prismWorldVerts: [number, number, number][] = []
    for (let i = 0; i < prismOrigVerts.length; i += 3) {
      prismWorldVerts.push(applyTRS([prismOrigVerts[i], prismOrigVerts[i + 1], prismOrigVerts[i + 2]], prismTransform))
    }

    // ── 3. Монтируем реальный useMeshSync → THREE.Mesh в scene graph ──
    renderMeshes(Object.values(st().objects))
    expect(lastMap).toBeTruthy()

    // ── 4. Извлекаем world-вершины CSG из scene graph (matrixWorld) ──
    const renderWorld = meshWorldVerts(csgId)

    // ── 5. Независимая призма для raycasting ──
    const primMesh = independentPrismMesh(12, 20)
    const primWorldMesh: number[] = []
    for (let i = 0; i < primMesh.verts.length; i += 3) {
      const w = applyTRS([primMesh.verts[i], primMesh.verts[i + 1], primMesh.verts[i + 2]], prismTransform)
      primWorldMesh.push(w[0], w[1], w[2])
    }

    const cubeBBox = bbox(new Float32Array(cubeWorldVerts.flatMap(v => v)))

    // ── 6. Cube vertices outside prism → must be in render ──
    const TOL = 1e-3
    const cubeOutsidePrism: [number, number, number][] = []
    for (const v of cubeWorldVerts) {
      if (!isPointInsideMesh(v, new Float32Array(primWorldMesh), primMesh.indices)) {
        cubeOutsidePrism.push(v)
      }
    }

    const cubeRenderMissing: { pt: [number, number, number]; dist: number }[] = []
    for (const v of cubeOutsidePrism) {
      const d = nearestInList(v, renderWorld)
      if (d > TOL) {
        cubeRenderMissing.push({ pt: v, dist: d })
      }
    }

    // ── 7. Prism vertices outside cube → must be in render ──
    const prismOutsideCube: [number, number, number][] = []
    for (const v of prismWorldVerts) {
      if (v[0] < cubeBBox.min[0] || v[0] > cubeBBox.max[0] ||
        v[1] < cubeBBox.min[1] || v[1] > cubeBBox.max[1] ||
        v[2] < cubeBBox.min[2] || v[2] > cubeBBox.max[2]) {
        prismOutsideCube.push(v)
      }
    }

    const prismRenderMissing: { pt: [number, number, number]; dist: number }[] = []
    for (const v of prismOutsideCube) {
      const d = nearestInList(v, renderWorld)
      if (d > TOL) {
        prismRenderMissing.push({ pt: v, dist: d })
      }
    }

    // ── 8. Отчёт ──
    console.log('=== CSG VERTEX TRUTH — RENDER PATH ===')
    console.log(`CSG pivot: [${csg.transform.x.toFixed(6)}, ${csg.transform.y.toFixed(6)}, ${csg.transform.z.toFixed(6)}]`)
    console.log(`Cube corners outside prism: ${cubeOutsidePrism.length} of ${cubeWorldVerts.length}`)
    console.log(`Prism corners outside cube: ${prismOutsideCube.length} of ${prismWorldVerts.length}`)
    console.log(`Render CSG vertex count: ${renderWorld.length / 3}`)
    console.log(`Missing cube→render: ${cubeRenderMissing.length}`)
    console.log(`Missing prism→render: ${prismRenderMissing.length}`)

    if (cubeRenderMissing.length > 0) {
      for (const m of cubeRenderMissing.slice(0, 3)) {
        console.log(`  MISSING cube vertex: [${m.pt[0].toFixed(4)}, ${m.pt[1].toFixed(4)}, ${m.pt[2].toFixed(4)}] dist to render = ${m.dist.toFixed(6)}`)
      }
    }
    if (prismRenderMissing.length > 0) {
      for (const m of prismRenderMissing.slice(0, 3)) {
        console.log(`  MISSING prism vertex: [${m.pt[0].toFixed(4)}, ${m.pt[1].toFixed(4)}, ${m.pt[2].toFixed(4)}] dist to render = ${m.dist.toFixed(6)}`)
      }
    }

    // ── 9. Asserts ──
    expect(cubeRenderMissing.length).toBe(0)
    expect(prismRenderMissing.length).toBe(0)
  }, 30000)
})
