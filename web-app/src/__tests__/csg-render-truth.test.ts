// ============================================================
// csg-render-truth.test.ts — финальная проверка RENDER PATH
// ============================================================
//
// Data-тесты зелёные, но пользователь видит сдвиг. Значит, сдвиг в RENDER
// (useMeshSync → THREE.Scene → экран).
//
// Тест:
//   1. Создаёт куб + призму через реальный store.
//   2. Делает union через реальный store.
//   3. Монтирует реальный useMeshSync → THREE.Scene.
//   4. Извлекает world-вершины CSG из scene graph: v_world = matrixWorld @ v_local.
//   5. Вычисляет data world: v_data = applyTRS(csg.transform, csg.vertices).
//   6. Сравнивает renderWorld vs dataWorld покомпонентно (tolerance 1e-6).
//   7. Логирует mesh.position, mesh.rotation, mesh.scale, matrixWorld.elements,
//      geometry.attributes.position[0] — то, что видит браузер.
//
// Если diff > 1e-6 — баг в render (useMeshSync центрует CSG, или pivot
// получает неправильный transform).

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as THREE from 'three'
import { act } from 'react'
import { createElement, useRef, type MutableRefObject } from 'react'
import { createRoot, type Root } from 'react-dom/client'

import { useDocumentStore } from '../store/document-store'
import { clearSnapshots } from '../store/snapshots'
import { clearTree } from '../csg/history-tree'
import { useMeshSync } from '../components/viewport-hooks'
import * as bridge from './worker-bridge'
import type { TransformNR, SceneObject, GroupOperation } from '../csg/types'

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
// Независимая TRS (точная копия worker-matrix.ts)
// ============================================================

function applyTRS(v: [number, number, number], t: TransformNR): [number, number, number] {
  let [x, y, z] = v
  x *= t.scaleX; y *= t.scaleY; z *= t.scaleZ
  const rx = t.rotX * Math.PI / 180, ry = t.rotY * Math.PI / 180, rz = t.rotZ * Math.PI / 180
  const cx = Math.cos(rx), sx = Math.sin(rx), cy = Math.cos(ry), sy = Math.sin(ry), cz = Math.cos(rz), sz = Math.sin(rz)
  const x2 = (cy * cz) * x + (-cy * sz) * y + (sy) * z
  const y2 = (cx * sz + sx * sy * cz) * x + (cx * cz - sx * sy * sz) * y + (-sx * cy) * z
  const z2 = (-cx * sy * cz + sx * sz) * x + (cx * sy * sz + sx * cz) * y + (cx * cy) * z
  return [x2 + t.x, y2 + t.y, z2 + t.z]
}

function nearestDist(pt: [number, number, number], verts: Float32Array): number {
  let d = Infinity
  for (let i = 0; i < verts.length; i += 3) {
    const dx = pt[0] - verts[i], dy = pt[1] - verts[i + 1], dz = pt[2] - verts[i + 2]
    const dd = dx * dx + dy * dy + dz * dz
    if (dd < d) d = dd
  }
  return Math.sqrt(d)
}

function computeBBox(verts: Float32Array) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < verts.length; i += 3) {
    for (let a = 0; a < 3; a++) {
      if (verts[i + a] < min[a]) min[a] = verts[i + a]
      if (verts[i + a] > max[a]) max[a] = verts[i + a]
    }
  }
  return { min, max }
}

// ============================================================
// Тест
// ============================================================

describe('CSG RENDER TRUTH — matrixWorld @ v_local == data world', () => {
  type MeshMap = Map<string, { mesh: THREE.Mesh; pivot: THREE.Object3D }>
  let lastScene: THREE.Scene | null = null
  let lastMap: MeshMap | null = null
  let container: HTMLDivElement
  let root: Root

  beforeEach(async () => {
    useDocumentStore.setState({ objects: {}, operations: [], historyIndex: 0, selectedIds: [], busy: false })
    clearSnapshots()
    clearTree()
    await bridge.workerClearAll()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  }, 30000)

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

  it('RENDER: matrixWorld @ v_local == applyTRS(transform, raw)', async () => {
    // ── 1. Создать куб и призму через реальный store ──
    await st().addShape('cube', { width: 20, height: 20, depth: 20 })
    const cubeId = Object.keys(st().objects).find(id => st().objects[id].shapeType === 'cube')!
    await st().moveObject(cubeId, { x: 20, y: 20, z: 20, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 })

    await st().addShape('prism', { radius: 12, height: 20, sides: 3 })
    const prismId = Object.keys(st().objects).find(id => st().objects[id].shapeType === 'prism')!
    await st().moveObject(prismId, { x: 20, y: 20, z: 20, rotX: 20, rotY: 20, rotZ: 20, scaleX: 1, scaleY: 1, scaleZ: 0.5 })

    // ── 2. Union через реальный store ──
    st().selectObjects([cubeId, prismId], false)
    await st().csgBoolean('union')

    const ops = st().operations
    let csgId = ''
    for (let i = ops.length - 1; i >= 0; i--) if (ops[i].type === 'group') csgId = (ops[i] as GroupOperation).resultId!
    const csg = st().objects[csgId]
    expect(csg).toBeTruthy()

    // ── 3. Render path: монтируем реальный useMeshSync ──
    renderMeshes(Object.values(st().objects))
    expect(lastMap).toBeTruthy()
    expect(lastMap!.has(csgId)).toBe(true)

    // ── 4. DIAG: логируем mesh/pivot/matrixWorld — то, что видит браузер ──
    const entry = lastMap!.get(csgId)!
    const pos = entry.mesh.geometry.getAttribute('position') as THREE.BufferAttribute
    const mwe = entry.mesh.matrixWorld.elements

    console.log('═══════════════════════════════════════════')
    console.log('  CSG RENDER TRUTH — matrixWorld vs data')
    console.log('═══════════════════════════════════════════')
    console.log()
    console.log('── DATA (store) ──')
    console.log(`  csg.shapeType: ${csg.shapeType}`)
    console.log(`  csg.transform: [${csg.transform.x.toFixed(6)}, ${csg.transform.y.toFixed(6)}, ${csg.transform.z.toFixed(6)}] rot(${csg.transform.rotX},${csg.transform.rotY},${csg.transform.rotZ}) scale(${csg.transform.scaleX},${csg.transform.scaleY},${csg.transform.scaleZ})`)
    console.log(`  csg.vertices[0]: [${csg.vertices[0].toFixed(6)}, ${csg.vertices[1].toFixed(6)}, ${csg.vertices[2].toFixed(6)}]`)
    console.log(`  csg.vertices count: ${csg.vertices.length / 3}`)
    console.log()
    console.log('── RENDER (scene graph) ──')
    console.log(`  mesh.position: [${entry.mesh.position.x.toFixed(6)}, ${entry.mesh.position.y.toFixed(6)}, ${entry.mesh.position.z.toFixed(6)}]`)
    console.log(`  mesh.rotation: [${entry.mesh.rotation.x.toFixed(6)}, ${entry.mesh.rotation.y.toFixed(6)}, ${entry.mesh.rotation.z.toFixed(6)}]`)
    console.log(`  mesh.scale:    [${entry.mesh.scale.x.toFixed(6)}, ${entry.mesh.scale.y.toFixed(6)}, ${entry.mesh.scale.z.toFixed(6)}]`)
    console.log(`  pivot.position: [${entry.pivot.position.x.toFixed(6)}, ${entry.pivot.position.y.toFixed(6)}, ${entry.pivot.position.z.toFixed(6)}]`)
    console.log(`  pivot.rotation: [${entry.pivot.rotation.x.toFixed(6)}, ${entry.pivot.rotation.y.toFixed(6)}, ${entry.pivot.rotation.z.toFixed(6)}]`)
    console.log(`  pivot.scale:    [${entry.pivot.scale.x.toFixed(6)}, ${entry.pivot.scale.y.toFixed(6)}, ${entry.pivot.scale.z.toFixed(6)}]`)
    console.log(`  matrixWorld (col-major, 16 elements):`)
    for (let i = 0; i < 4; i++) {
      console.log(`    [${mwe[i * 4].toFixed(6)}, ${mwe[i * 4 + 1].toFixed(6)}, ${mwe[i * 4 + 2].toFixed(6)}, ${mwe[i * 4 + 3].toFixed(6)}]`)
    }
    console.log(`  geometry.attributes.position[0]: [${pos.getX(0).toFixed(6)}, ${pos.getY(0).toFixed(6)}, ${pos.getZ(0).toFixed(6)}]`)
    console.log(`  geometry.attributes.position count: ${pos.count}`)
    console.log()

    // ── 5. DATA world vs RENDER world — nearest-neighbor (не по индексу!)
    //
    // csg.vertices — компактное представление (24 вершины для CSG union).
    // mesh.geometry.attributes.position — развернутое (132: normals, edge splits).
    // Сравниваем nearest-neighbor: для каждой dataWorld вершины ищем ближайшую
    // в renderWorld. Если max nearest-neighbor diff < 1e-6 — геометрия идентична.
    //
    // Т.к. useMeshSync НЕ центрирует CSG (isPivotCenteredGeometry=true),
    // geometry.attributes.position == csg.vertices (raw).
    // pivot.position = csg.transform, mesh.position = (0,0,0).
    // matrixWorld = pivot.matrixWorld (identity * pivot).
    // renderWorld[i] = matrixWorld @ geometry.attributes.position[i].

    const dataWorld = new Float32Array(csg.vertices.length)
    for (let i = 0; i < csg.vertices.length; i += 3) {
      const w = applyTRS([csg.vertices[i], csg.vertices[i + 1], csg.vertices[i + 2]], csg.transform)
      dataWorld[i] = w[0]; dataWorld[i + 1] = w[1]; dataWorld[i + 2] = w[2]
    }
    const renderWorld = meshWorldVerts(csgId)

    let maxDiff = 0
    let maxIdx = -1
    let nearestMissing = 0
    for (let i = 0; i < dataWorld.length; i += 3) {
      const pt: [number, number, number] = [dataWorld[i], dataWorld[i + 1], dataWorld[i + 2]]
      const d = nearestDist(pt, renderWorld)
      if (d > maxDiff) { maxDiff = d; maxIdx = i }
      if (d > 1e-6) nearestMissing++
    }
    console.log(`  max nearest-neighbor diff: ${maxDiff.toExponential(4)} at vertex index ${Math.floor(maxIdx / 3)}`)
    console.log(`  nearest-neighbor missing (>1e-6): ${nearestMissing} of ${dataWorld.length / 3}`)

    // Явные первые 5 вершин для отчёта
    console.log(`  dataWorld[0]:   [${dataWorld[0].toFixed(6)}, ${dataWorld[1].toFixed(6)}, ${dataWorld[2].toFixed(6)}]`)
    console.log(`  renderWorld[0]: [${renderWorld[0].toFixed(6)}, ${renderWorld[1].toFixed(6)}, ${renderWorld[2].toFixed(6)}]`)
    console.log(`  dataWorld[1]:   [${dataWorld[3].toFixed(6)}, ${dataWorld[4].toFixed(6)}, ${dataWorld[5].toFixed(6)}]`)
    console.log(`  renderWorld[1]: [${renderWorld[3].toFixed(6)}, ${renderWorld[4].toFixed(6)}, ${renderWorld[5].toFixed(6)}]`)

    expect(maxDiff).toBeLessThan(1e-6)

    // ── 6. BBox сравнение ──
    const dataBBox = computeBBox(dataWorld)
    const renderBBox = computeBBox(renderWorld)
    const bboxDiff = Math.max(
      Math.abs(dataBBox.min[0] - renderBBox.min[0]), Math.abs(dataBBox.max[0] - renderBBox.max[0]),
      Math.abs(dataBBox.min[1] - renderBBox.min[1]), Math.abs(dataBBox.max[1] - renderBBox.max[1]),
      Math.abs(dataBBox.min[2] - renderBBox.min[2]), Math.abs(dataBBox.max[2] - renderBBox.max[2]),
    )
    console.log()
    console.log('── BBOX ──')
    console.log(`  data bbox:   [${dataBBox.min.map(n => n.toFixed(4)).join(',')}] → [${dataBBox.max.map(n => n.toFixed(4)).join(',')}]`)
    console.log(`  render bbox: [${renderBBox.min.map(n => n.toFixed(4)).join(',')}] → [${renderBBox.max.map(n => n.toFixed(4)).join(',')}]`)
    console.log(`  bbox diff: ${bboxDiff.toExponential(4)}`)
    expect(bboxDiff).toBeLessThan(1e-6)

    // ── 7. Fallback: содержит ли render world вершины операндов? ──
    // Сохраняем snapshot до union, сравниваем после (на всякий случай).
    // Здесь уже после union, поэтому проверяем только renderWorld vs independent эталон.
    // Все outside-вершины куба (все 8) и призмы (вне cube bbox) должны быть в renderWorld.

    // Независимые world-вершины куба (без spawn, т.к. куб на (0,0,0) + transform (20,20,20))
    const cubeOrig: [number, number, number][] = [
      [-10, -10, -10], [10, -10, -10], [10, 10, -10], [-10, 10, -10],
      [-10, -10, 10], [10, -10, 10], [10, 10, 10], [-10, 10, 10],
    ]
    const cubeWorld: [number, number, number][] = cubeOrig.map(v => applyTRS(v, {
      x: 20, y: 20, z: 20, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1,
    }))
    const cubeBBox = computeBBox(new Float32Array(cubeWorld.flatMap(v => v)))

    const prismT: TransformNR = { x: 20, y: 20, z: 20, rotX: 20, rotY: 20, rotZ: 20, scaleX: 1, scaleY: 1, scaleZ: 0.5 }
    const r = 12, h2 = 10
    const angles = [0, 2 * Math.PI / 3, 4 * Math.PI / 3]
    const prismOrig: [number, number, number][] = []
    for (const a of angles) {
      prismOrig.push([Math.cos(a) * r, Math.sin(a) * r, -h2])
      prismOrig.push([Math.cos(a) * r, Math.sin(a) * r, h2])
    }
    const prismWorld: [number, number, number][] = prismOrig.map(v => applyTRS(v, prismT))
    const prismBBox = computeBBox(new Float32Array(prismWorld.flatMap(v => v)))

    const TOL = 1e-3  // Float32 epsilon ~3.8e-6 при ~32; 1e-3 запас на mesh-центрирование
    let cubeMissing = 0
    for (const pt of cubeWorld) {
      if (nearestDist(pt, renderWorld) > TOL) cubeMissing++
    }
    let prismMissing = 0
    for (const pt of prismWorld) {
      // Пропускаем внутри cube bbox (поглощены union)
      if (pt[0] >= cubeBBox.min[0] && pt[0] <= cubeBBox.max[0] &&
        pt[1] >= cubeBBox.min[1] && pt[1] <= cubeBBox.max[1] &&
        pt[2] >= cubeBBox.min[2] && pt[2] <= cubeBBox.max[2]) continue
      if (nearestDist(pt, renderWorld) > TOL) prismMissing++
    }

    console.log()
    console.log('── OUTSIDE-VERTICES ──')
    console.log(`  cube outside render: ${cubeMissing} of 8`)
    console.log(`  prism outside cube bbox & render: ${prismMissing} of ${prismWorld.length}`)
    console.log(`  prism bbox: [${prismBBox.min.map(n => n.toFixed(4)).join(',')}] → [${prismBBox.max.map(n => n.toFixed(4)).join(',')}]`)

    expect(cubeMissing).toBe(0)
    expect(prismMissing).toBe(0)

    console.log()
    console.log('═══ RENDER TRUTH: ВСЕ ПРОВЕРКИ ПРОШЛИ ═══')
    console.log()
  }, 30000)
})
