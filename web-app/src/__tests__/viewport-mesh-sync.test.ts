// ============================================================
// viewport-mesh-sync.test.ts — интеграционный тест РЕАЛЬНОГО рендера
// ============================================================
//
// FIX (VIEWPORT-DOUBLE-CENTERING): раньше useMeshSync вычитал bbox-центр из
// вершин ВСЕХ объектов. Для CSG это двойное центрирование (§5.4: вершины уже
// COM-центрированы, pivot = COM) — асимметричный CSG рендерился со сдвигом
// (измерено 4.2491 ед. для union куба и призмы).
//
// Тест вызывает НАСТОЯЩИЙ useMeshSync (не модель формулы) и сравнивает
// world-координаты меша из scene graph с data-world (§5.4).
// Браузер/WebGL не нужны: THREE.BufferGeometry/Matrix — чистый CPU.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as THREE from 'three'
import { createElement, useRef, act, type MutableRefObject } from 'react'
import { createRoot, type Root } from 'react-dom/client'

  // React 18 требует флаг окружения для act()
  ; (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// Мост подменяет только транспорт Worker (в jsdom его нет).
vi.mock('../csg/worker-client', async () => {
  const bridge = await import('./worker-bridge')
  return {
    workerBuildShape: bridge.workerBuildShape,
    workerApplyFillet: bridge.workerApplyFillet,
    workerBuildImportedMesh: bridge.workerBuildImportedMesh,
    workerSyncObjects: bridge.workerSyncObjects,
    workerSyncMesh: bridge.workerSyncMesh,
    workerCsgBoolean: bridge.workerCsgBoolean,
    workerCsgBooleanWithSync: bridge.workerCsgBooleanWithSync,
    workerMirrorObject: bridge.workerMirrorObject,
    workerRebuildScene: bridge.workerRebuildScene,
    workerDeleteObjects: bridge.workerDeleteObjects,
    workerClearAll: bridge.workerClearAll,
    workerRebuildNode: bridge.workerRebuildNode,
    isWorkerReady: bridge.isWorkerReady,
    disposeWorker: bridge.disposeWorker,
  }
})

import { useMeshSync } from '../components/viewport-hooks'
import * as bridge from './worker-bridge'
import { centerMassAtOrigin } from '../csg/geometry-utils'
import type { SceneObject, TransformNR } from '../csg/types'

const IDENTITY: TransformNR = { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 }

type MeshMap = Map<string, { mesh: THREE.Mesh; pivot: THREE.Object3D; helper?: THREE.BoxHelper }>

// ---- Хук-обёртка: монтирует РЕАЛЬНЫЙ useMeshSync ----
let lastScene: THREE.Scene | null = null
let lastMap: MeshMap | null = null

function Harness(props: { objects: SceneObject[] }) {
  const sceneRef: MutableRefObject<THREE.Scene | null> = useRef(new THREE.Scene())
  const mapRef: MutableRefObject<MeshMap> = useRef(new Map())
  useMeshSync(props.objects, true, sceneRef, mapRef, new Set<string>())
  lastScene = sceneRef.current
  lastMap = mapRef.current
  return null
}

let container: HTMLDivElement
let root: Root

function render(objects: SceneObject[]) {
  act(() => { root.render(createElement(Harness, { objects })) })
  // Матрицы пересчитываются рендерером в проде; здесь — вручную.
  lastScene!.updateMatrixWorld(true)
}

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

// ---- world-координаты меша из scene graph ----
function meshWorldVerts(id: string): Float32Array {
  const entry = lastMap!.get(id)!
  expect(entry, `mesh ${id} exists`).toBeTruthy()
  const pos = entry.mesh.geometry.getAttribute('position') as THREE.BufferAttribute
  const out = new Float32Array(pos.count * 3)
  const v = new THREE.Vector3()
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(entry.mesh.matrixWorld)
    out[i * 3] = v.x; out[i * 3 + 1] = v.y; out[i * 3 + 2] = v.z
  }
  return out
}

function bboxOf(verts: Float32Array) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < verts.length; i += 3) {
    for (let a = 0; a < 3; a++) {
      if (verts[i + a] < min[a]) min[a] = verts[i + a]
      if (verts[i + a] > max[a]) max[a] = verts[i + a]
    }
  }
  return { min, max }
}

function bboxDiff(a: { min: number[]; max: number[] }, b: { min: number[]; max: number[] }): number {
  let d = 0
  for (let k = 0; k < 3; k++) d = Math.max(d, Math.abs(a.min[k] - b.min[k]), Math.abs(a.max[k] - b.max[k]))
  return d
}

/** data-world CSG (§5.4): world = pivot + vertex */
function csgDataWorld(obj: SceneObject): Float32Array {
  const out = new Float32Array(obj.vertices.length)
  for (let i = 0; i < obj.vertices.length; i += 3) {
    out[i] = obj.vertices[i] + obj.transform.x
    out[i + 1] = obj.vertices[i + 1] + obj.transform.y
    out[i + 2] = obj.vertices[i + 2] + obj.transform.z
  }
  return out
}

// ---- построение CSG-объекта ровно как document-store.csgBoolean ----
async function makeCSGObject(
  id: string,
  cubeT: TransformNR,
  prismT: TransformNR,
): Promise<SceneObject> {
  const res = await bridge.workerCsgBooleanWithSync(
    `${id}_a`, `${id}_b`, 'union', id, cubeT, prismT,
    { shapeType: 'cube', params: { width: 10 } as any },
    { shapeType: 'prism', params: { radius: 5, height: 10, sides: 3 } as any },
  )
  const vertices = new Float32Array(res.vertices)
  const indices = new Uint32Array(res.indices)
  // document-store: COM-центрирование in-place, pivot = COM (§5.4)
  const com = centerMassAtOrigin(vertices, indices)
  const transform: TransformNR = { ...IDENTITY, x: com.cx, y: com.cy, z: com.cz }
  return {
    id, shapeType: 'csg', params: {}, color: '#ff0000',
    transform, visible: true, locked: false,
    vertices, indices, normals: res.normals ?? undefined,
  } as SceneObject
}

describe('useMeshSync — VIEWPORT-DOUBLE-CENTERING', () => {
  it('CSG (куб origin + призма (10,0,0)): render world == data world', async () => {
    const cubeT: TransformNR = { ...IDENTITY }
    const prismT: TransformNR = { ...IDENTITY, x: 10 }
    const csg = await makeCSGObject('csg_1', cubeT, prismT)

    render([csg])

    const rendered = bboxOf(meshWorldVerts('csg_1'))
    // data-world (§5.4): pivot + vertex
    const expected = bboxOf(csgDataWorld(csg))

    const diff = bboxDiff(rendered, expected)
    console.log(`  pivot = [${csg.transform.x.toFixed(4)}, ${csg.transform.y.toFixed(4)}, ${csg.transform.z.toFixed(4)}]`)
    console.log(`  render bbox = [${rendered.min.map(n => n.toFixed(3)).join(', ')}] .. [${rendered.max.map(n => n.toFixed(3)).join(', ')}]`)
    console.log(`  data   bbox = [${expected.min.map(n => n.toFixed(3)).join(', ')}] .. [${expected.max.map(n => n.toFixed(3)).join(', ')}]`)
    console.log(`  render-vs-data diff = ${diff.toFixed(8)} (до фикса = 4.2491)`)

    expect(diff).toBeLessThan(1e-6)
  })

  it('CSG: обновлённые вершины (update path) тоже без сдвига', async () => {
    const cubeT: TransformNR = { ...IDENTITY }
    const prismT: TransformNR = { ...IDENTITY, x: 10 }
    const csg1 = await makeCSGObject('csg_2', cubeT, prismT)
    render([csg1])
    const diff1 = bboxDiff(bboxOf(meshWorldVerts('csg_2')), bboxOf(csgDataWorld(csg1)))

    // Другой CSG (другая геометрия) → update path (vertsChanged)
    const csg2 = await makeCSGObject('csg_2', { ...IDENTITY, y: 7 }, prismT)
    render([csg2])

    const diff = bboxDiff(bboxOf(meshWorldVerts('csg_2')), bboxOf(csgDataWorld(csg2)))
    console.log(`  update path render-vs-data diff = ${diff.toFixed(8)} (первый рендер diff = ${diff1.toFixed(8)})`)
    expect(diff1).toBeLessThan(1e-6)
    expect(diff).toBeLessThan(1e-6)
  })

  it('Примитив (spawn в вершинах): рендер на месте — позиция не удваивается', async () => {
    const spawnT: TransformNR = { ...IDENTITY, x: 20 }
    const mesh = await bridge.workerBuildShape('cube_1', 'cube', { width: 10 } as any, spawnT)
    const cube: SceneObject = {
      id: 'cube_1', shapeType: 'cube', params: { width: 10 } as any, color: '#00ff00',
      transform: spawnT, visible: true, locked: false,
      vertices: new Float32Array(mesh.vertices), indices: new Uint32Array(mesh.indices),
      normals: mesh.normals ?? undefined,
    } as SceneObject

    render([cube])

    const rendered = bboxOf(meshWorldVerts('cube_1'))
    console.log(`  primitive render x = [${rendered.min[0].toFixed(3)}, ${rendered.max[0].toFixed(3)}] (ожидание [15, 25])`)
    // Без вычитания bbox-центра позиция применилась бы дважды → [35, 45]
    expect(Math.abs(rendered.min[0] - 15)).toBeLessThan(1e-5)
    expect(Math.abs(rendered.max[0] - 25)).toBeLessThan(1e-5)
  })

  it('CSG с поворотом rotZ=30: вращение вокруг pivot (COM), центр не уезжает', async () => {
    const cubeT: TransformNR = { ...IDENTITY }
    const prismT: TransformNR = { ...IDENTITY, x: 10 }
    const csg = await makeCSGObject('csg_3', cubeT, prismT)
    const rotated: SceneObject = {
      ...csg,
      transform: { ...csg.transform, rotZ: 30 },
    }

    render([rotated])

    // data-world с поворотом вокруг pivot: pivot + Rz·v
    const rad = (30 * Math.PI) / 180
    const cos = Math.cos(rad), sin = Math.sin(rad)
    const dataWorld = new Float32Array(csg.vertices.length)
    for (let i = 0; i < csg.vertices.length; i += 3) {
      const vx = csg.vertices[i], vy = csg.vertices[i + 1], vz = csg.vertices[i + 2]
      dataWorld[i] = cos * vx - sin * vy + csg.transform.x
      dataWorld[i + 1] = sin * vx + cos * vy + csg.transform.y
      dataWorld[i + 2] = vz + csg.transform.z
    }

    const diff = bboxDiff(bboxOf(meshWorldVerts('csg_3')), bboxOf(dataWorld))
    console.log(`  rotated CSG render-vs-data diff = ${diff.toFixed(8)}`)
    expect(diff).toBeLessThan(1e-4)
  })
})
