// ============================================================
// mirror-csg-volume.test.ts — CSG mirror volume/bbox (8.5.12)
// ============================================================
//
// Bug 2 (8.5.12): mirror CSG через tree-rebuild запечатывал TRS детей
// (включая полный rot/scale операнда A) в vertices, а SceneObject.transform
// нёс полный зеркальный TRS → double RS. vol(obj_5)/vol(csg_3) = 0.5 = det(scale A).
// Fix (d): mirrorObject CSG — прямое зеркало vertices (M·v_src), RS один раз.

import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../csg/worker-client', async () => {
  const bridge = await import('./worker-bridge')
  return {
    workerBuildShape: bridge.workerBuildShape,
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

import { useDocumentStore } from '../store/document-store'
import { clearSnapshots } from '../store/snapshots'
import { clearTree } from '../csg/history-tree'
import { computeRSMatrix } from '../csg/worker-matrix'
import type { SceneObject } from '../csg/types'

const st = () => useDocumentStore.getState()

function lastShapeId(shapeType: string): string {
  const objs = st().objects
  for (const id of Object.keys(objs)) {
    if (objs[id].shapeType === shapeType && !('operation' in objs[id])) return id
  }
  throw new Error(`no ${shapeType}`)
}

function csgResultId(): string {
  const sel = st().selectedIds
  expect(sel.length).toBe(1)
  const obj = st().objects[sel[0]]
  expect(obj?.shapeType).toBe('csg')
  return sel[0]
}

beforeEach(() => {
  useDocumentStore.setState({ objects: {}, operations: [], historyIndex: 0, selectedIds: [], busy: false })
  clearSnapshots()
  clearTree()
})

/** world = pos + R·S·v (полный TRS) */
function worldVerts(obj: SceneObject): Float32Array {
  const t = obj.transform
  const [r00, r01, r02, r10, r11, r12, r20, r21, r22] = computeRSMatrix(
    { rotX: t.rotX, rotY: t.rotY, rotZ: t.rotZ },
    { scaleX: t.scaleX, scaleY: t.scaleY, scaleZ: t.scaleZ },
  )
  const out = new Float32Array(obj.vertices.length)
  for (let i = 0; i < obj.vertices.length; i += 3) {
    const x = obj.vertices[i], y = obj.vertices[i + 1], z = obj.vertices[i + 2]
    out[i] = r00 * x + r01 * y + r02 * z + t.x
    out[i + 1] = r10 * x + r11 * y + r12 * z + t.y
    out[i + 2] = r20 * x + r21 * y + r22 * z + t.z
  }
  return out
}

/** Объём через теорему дивергенции (|signed| — нечувствителен к winding) */
function meshVolume(verts: Float32Array, idx: Uint32Array): number {
  let sum = 0
  for (let i = 0; i + 2 < idx.length; i += 3) {
    const a = idx[i] * 3, b = idx[i + 1] * 3, c = idx[i + 2] * 3
    sum += (
      verts[a] * (verts[b + 1] * verts[c + 2] - verts[b + 2] * verts[c + 1]) -
      verts[a + 1] * (verts[b] * verts[c + 2] - verts[b + 2] * verts[c]) +
      verts[a + 2] * (verts[b] * verts[c + 1] - verts[b + 1] * verts[c])
    ) / 6
  }
  return Math.abs(sum)
}

function mirrorWorld(verts: Float32Array, plane: 'XY' | 'XZ' | 'YZ'): Float32Array {
  const axis = plane === 'YZ' ? 0 : plane === 'XZ' ? 1 : 2
  const out = new Float32Array(verts.length)
  for (let i = 0; i < verts.length; i++) out[i] = verts[i]
  for (let i = axis; i < out.length; i += 3) out[i] = -out[i]
  return out
}

function bboxOf(verts: Float32Array) {
  let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < verts.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      mn[k] = Math.min(mn[k], verts[i + k])
      mx[k] = Math.max(mx[k], verts[i + k])
    }
  }
  return { mn, mx }
}

function maxBBoxDiff(a: { mn: number[], mx: number[] }, b: { mn: number[], mx: number[] }): number {
  let d = 0
  for (let k = 0; k < 3; k++) d = Math.max(d, Math.abs(a.mn[k] - b.mn[k]), Math.abs(a.mx[k] - b.mx[k]))
  return d
}

describe('Mirror CSG volume/bbox', () => {
  it('Mirror CSG: vol(obj_5)/vol(csg_3) ≈ 1.0 (не 0.5)', async () => {
    // cube rot(10,-10,10) scale(1,0.5,1) + prism → union → csg_3
    await st().addShape('cube', { width: 20, height: 20, depth: 20 })
    const cubeId = lastShapeId('cube')
    await st().addShape('prism', { radius: 8, height: 30, sides: 4 })
    const prismId = lastShapeId('prism')

    await st().moveObject(prismId, { x: 8, y: 0, z: 8, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 })
    await st().moveObject(cubeId, { x: 0, y: 0, z: 0, rotX: 10, rotY: -10, rotZ: 10, scaleX: 1, scaleY: 0.5, scaleZ: 1 })

    st().selectedIds = [cubeId, prismId]
    await st().csgBoolean('union')
    const csg3Id = csgResultId()
    const csg3 = st().objects[csg3Id]

    // Mirror CSG
    st().selectedIds = [csg3Id]
    await st().mirrorSelected('XZ')
    const obj5Id = Object.values(st().objects).find(o => o.shapeType === 'csg' && o.id !== csg3Id)!.id
    const obj5 = st().objects[obj5Id]

    const vol5 = meshVolume(worldVerts(obj5), obj5.indices)
    const vol3 = meshVolume(worldVerts(csg3), csg3.indices)
    const ratio = vol5 / vol3

    console.log(`vol(obj_5)=${vol5.toFixed(1)} vol(csg_3)=${vol3.toFixed(1)} ratio=${ratio.toFixed(4)}`)
    expect(ratio).toBeCloseTo(1.0, 2)
  })

  it('Mirror CSG: world bbox(obj_5) = M(world bbox(csg_3)), diff < 1e-6', async () => {
    await st().addShape('cube', { width: 20, height: 20, depth: 20 })
    const cubeId = lastShapeId('cube')
    await st().addShape('prism', { radius: 8, height: 30, sides: 4 })
    const prismId = lastShapeId('prism')

    await st().moveObject(prismId, { x: 8, y: 0, z: 8, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 })
    await st().moveObject(cubeId, { x: 0, y: 0, z: 0, rotX: 10, rotY: -10, rotZ: 10, scaleX: 1, scaleY: 0.5, scaleZ: 1 })

    st().selectedIds = [cubeId, prismId]
    await st().csgBoolean('union')
    const csg3Id = csgResultId()
    const csg3 = st().objects[csg3Id]

    const wCsg3 = worldVerts(csg3)
    const expected5 = mirrorWorld(wCsg3, 'XZ')

    st().selectedIds = [csg3Id]
    await st().mirrorSelected('XZ')
    const obj5Id = Object.values(st().objects).find(o => o.shapeType === 'csg' && o.id !== csg3Id)!.id
    const obj5 = st().objects[obj5Id]

    const w5 = bboxOf(worldVerts(obj5))
    const e5 = bboxOf(expected5)
    const diff = maxBBoxDiff(w5, e5)

    console.log(`world(obj_5)=${JSON.stringify(w5)} M(world(csg_3))=${JSON.stringify(e5)} diff=${diff.toFixed(6)}`)
    expect(diff).toBeLessThan(1e-6)
  })

  it('Mirror CSG: CSG union(obj_5, csg_3) → bbox = union(M(w3), w3)', async () => {
    await st().addShape('cube', { width: 20, height: 20, depth: 20 })
    const cubeId = lastShapeId('cube')
    await st().addShape('prism', { radius: 8, height: 30, sides: 4 })
    const prismId = lastShapeId('prism')

    await st().moveObject(prismId, { x: 8, y: 0, z: 8, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 })
    await st().moveObject(cubeId, { x: 0, y: 0, z: 0, rotX: 10, rotY: -10, rotZ: 10, scaleX: 1, scaleY: 0.5, scaleZ: 1 })

    st().selectedIds = [cubeId, prismId]
    await st().csgBoolean('union')
    const csg3Id = csgResultId()
    const csg3 = st().objects[csg3Id]

    st().selectedIds = [csg3Id]
    await st().mirrorSelected('XZ')
    const obj5Id = Object.values(st().objects).find(o => o.shapeType === 'csg' && o.id !== csg3Id)!.id

    const w5 = bboxOf(worldVerts(st().objects[obj5Id]))
    const w3 = bboxOf(worldVerts(csg3))
    const expMn = [Math.min(w5.mn[0], w3.mn[0]), Math.min(w5.mn[1], w3.mn[1]), Math.min(w5.mn[2], w3.mn[2])]
    const expMx = [Math.max(w5.mx[0], w3.mx[0]), Math.max(w5.mx[1], w3.mx[1]), Math.max(w5.mx[2], w3.mx[2])]

    st().selectedIds = [obj5Id, csg3Id]
    await st().csgBoolean('union')
    const csg7Id = csgResultId()
    const w7 = bboxOf(worldVerts(st().objects[csg7Id]))

    let d7 = 0
    for (let k = 0; k < 3; k++) d7 = Math.max(d7, Math.abs(w7.mn[k] - expMn[k]), Math.abs(w7.mx[k] - expMx[k]))

    console.log(`D4: world(csg7)=${JSON.stringify(w7)} unionExp=[${expMn}]→[${expMx}] diff=${d7.toFixed(6)}`)
    expect(d7).toBeLessThan(1e-6)
  })

  it('Mirror CSG: vol(obj_5) = vol(csg_3) (rotated A, scale ≠ 1)', async () => {
    // Test with different rot/scale to ensure no double-RS
    await st().addShape('cube', { width: 20, height: 20, depth: 20 })
    const cubeId = lastShapeId('cube')
    await st().addShape('sphere', { radius: 12, segments: 16 })
    const sphereId = lastShapeId('sphere')

    await st().moveObject(cubeId, { x: 0, y: 0, z: 0, rotX: 20, rotY: 30, rotZ: -15, scaleX: 1.5, scaleY: 0.7, scaleZ: 1.2 })
    await st().moveObject(sphereId, { x: 15, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 })

    st().selectedIds = [cubeId, sphereId]
    await st().csgBoolean('union')
    const csgId = csgResultId()
    const csg = st().objects[csgId]

    st().selectedIds = [csgId]
    await st().mirrorSelected('YZ')
    const mirroredId = Object.values(st().objects).find(o => o.shapeType === 'csg' && o.id !== csgId)!.id
    const mirrored = st().objects[mirroredId]

    const volM = meshVolume(worldVerts(mirrored), mirrored.indices)
    const volO = meshVolume(worldVerts(csg), csg.indices)
    const ratio = volM / volO

    console.log(`vol(mirrored)=${volM.toFixed(1)} vol(csg)=${volO.toFixed(1)} ratio=${ratio.toFixed(4)}`)
    expect(ratio).toBeCloseTo(1.0, 2)
  })
})