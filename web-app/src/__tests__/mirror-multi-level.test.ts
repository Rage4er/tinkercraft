// ============================================================
// mirror-multi-level.test.ts — Multi-level mirror + undo/redo + copy/paste (8.5.12)
// ============================================================
//
// Bug 1 (8.5.12): mirrored хранил одну плоскость. Multi-level mirror
// (YZ→XZ) терял первое зеркало при undo/redo.
// Fix (a): mirrored = MirrorPlane[] с push+cancel (соседние одинаковые отменяются).
// Fix (b): ClipEntry.mirrored + vertices — paste сохраняет зеркало.
// Fix (c): moveObject — !obj.mirrored при регистрации в дереве.

import { describe, it, expect, beforeEach, vi } from 'vitest'

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

import { useDocumentStore } from '../store/document-store'
import { clearSnapshots } from '../store/snapshots'
import { clearTree } from '../csg/history-tree'
import { rebuildFromHistory } from '../store/rebuild'
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

beforeEach(() => {
  useDocumentStore.setState({ objects: {}, operations: [], historyIndex: 0, selectedIds: [], busy: false })
  clearSnapshots()
  clearTree()
})

/** world = pos + R·S·v */
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

function mirrorWorld(verts: Float32Array, plane: 'XY' | 'XZ' | 'YZ'): Float32Array {
  const axis = plane === 'YZ' ? 0 : plane === 'XZ' ? 1 : 2
  const out = new Float32Array(verts.length)
  for (let i = 0; i < verts.length; i++) out[i] = verts[i]
  for (let i = axis; i < out.length; i += 3) out[i] = -out[i]
  return out
}

function maxBBoxDiff(a: { mn: number[], mx: number[] }, b: { mn: number[], mx: number[] }): number {
  let d = 0
  for (let k = 0; k < 3; k++) d = Math.max(d, Math.abs(a.mn[k] - b.mn[k]), Math.abs(a.mx[k] - b.mx[k]))
  return d
}

// ============================================================
// Test 1: Multi-level mirror (YZ→XZ) + undo/redo
// ============================================================
describe('Multi-level mirror', () => {
  it('Multi-level mirror (YZ→XZ): vertices preserved after undo/redo', async () => {
    // 1. Создать асимметричную призму (sides=5)
    await st().addShape('prism', { radius: 15, height: 20, sides: 5 })
    const id1 = lastShapeId('prism')
    const v1 = new Float32Array(st().objects[id1].vertices)

    // 2. Mirror YZ → id4 (mirrored=['YZ'])
    st().selectedIds = [id1]
    await st().mirrorSelected('YZ')
    const id4 = Object.values(st().objects).find(o => o.id !== id1 && o.mirrored?.includes('YZ'))!.id
    expect(st().objects[id4].mirrored).toEqual(['YZ'])

    // 3. Mirror XZ → id8 (mirrored=['YZ','XZ'])
    st().selectedIds = [id4]
    await st().mirrorSelected('XZ')
    const id8 = Object.values(st().objects).find(o => o.id !== id1 && o.id !== id4 && o.mirrored?.includes('XZ'))!.id
    expect(st().objects[id8].mirrored).toEqual(['YZ', 'XZ'])

    // LIVE: v8 = XZ(YZ(v1))
    const expected = mirrorWorld(mirrorWorld(v1, 'YZ'), 'XZ')
    const liveBbox = bboxOf(worldVerts(st().objects[id8]))
    const expectedBbox = bboxOf(expected)
    const liveDiff = maxBBoxDiff(liveBbox, expectedBbox)
    expect(liveDiff).toBeLessThan(1e-6)

    // 4. Undo/redo → rebuildFromHistory
    const rebuilt = await rebuildFromHistory(st().operations)
    const rb8 = rebuilt[id8]
    expect(rb8).toBeDefined()
    expect(rb8!.mirrored).toEqual(['YZ', 'XZ'])

    const rbBbox = bboxOf(worldVerts(rb8!))
    const rbDiff = maxBBoxDiff(rbBbox, expectedBbox)
    expect(rbDiff).toBeLessThan(1e-6)
  })

  it('Multi-level mirror + copy/paste: mirrored + vertices preserved', async () => {
    await st().addShape('prism', { radius: 15, height: 20, sides: 5 })
    const id1 = lastShapeId('prism')

    st().selectedIds = [id1]
    await st().mirrorSelected('YZ')
    const id4 = Object.values(st().objects).find(o => o.id !== id1 && o.mirrored?.includes('YZ'))!.id

    st().selectedIds = [id4]
    await st().mirrorSelected('XZ')
    const id8 = Object.values(st().objects).find(o => o.id !== id1 && o.id !== id4 && o.mirrored?.includes('XZ'))!.id

    // Copy/paste id8
    st().selectedIds = [id8]
    st().copySelected()
    await st().pasteClipboard()

    const pastedId = Object.values(st().objects).find(o => !([id1, id4, id8] as string[]).includes(o.id))!.id
    const pasted = st().objects[pastedId]

    expect(pasted.mirrored).toEqual(['YZ', 'XZ'])
    expect(pasted.shapeType).toBe('prism')

    // Vertices match (compare local vertices, not world — paste shifts transform)
    const v8 = st().objects[id8].vertices
    const vp = pasted.vertices
    expect(vp.length).toBe(v8.length)
    let maxVDiff = 0
    for (let i = 0; i < v8.length; i++) maxVDiff = Math.max(maxVDiff, Math.abs(v8[i] - vp[i]))
    expect(maxVDiff).toBeLessThan(1e-6)
  })

  it('moveObject mirror primitive → primitive-нода с mirrored (Фаза 9.8; раньше baked)', async () => {
    await st().addShape('prism', { radius: 15, height: 20, sides: 5 })
    const id1 = lastShapeId('prism')

    st().selectedIds = [id1]
    await st().mirrorSelected('YZ')
    const id4 = Object.values(st().objects).find(o => o.id !== id1 && o.mirrored?.includes('YZ'))!.id

    // moveObject регистрирует зеркальный примитив как primitive + mirrored (params редактируемы)
    await st().moveObject(id4, {
      x: 5, y: 0, z: 0,
      rotX: 10, rotY: 0, rotZ: 0,
      scaleX: 1, scaleY: 1, scaleZ: 1,
    })

    const node4 = await import('../csg/history-tree').then(m => m.getNode(id4))
    expect(node4?.type).toBe('primitive')
    expect(node4?.mirrored).toEqual(['YZ'])
    expect(node4?.params?.radius).toBe(15)
    expect(st().objects[id4].mirrored).toEqual(['YZ'])
  })

  it('Double mirror same plane = identity (MirrorPlane[])', async () => {
    await st().addShape('prism', { radius: 15, height: 20, sides: 5 })
    const id1 = lastShapeId('prism')
    const v1 = new Float32Array(st().objects[id1].vertices)

    st().selectedIds = [id1]
    await st().mirrorSelected('YZ')
    const id2 = Object.values(st().objects).find(o => o.id !== id1 && o.mirrored?.includes('YZ'))!.id
    expect(st().objects[id2].mirrored).toEqual(['YZ'])

    st().selectedIds = [id2]
    await st().mirrorSelected('YZ')
    const id3 = Object.values(st().objects).find(o => o.id !== id1 && o.id !== id2)!.id
    expect(st().objects[id3].mirrored).toBeUndefined()

    // id3 vertices = id1 vertices
    const v3 = st().objects[id3].vertices
    expect(v3.length).toBe(v1.length)
    for (let i = 0; i < v1.length; i++) {
      expect(v3[i]).toBeCloseTo(v1[i], 6)
    }
  })

  it('Mirror plane composition: YZ→XZ→YZ = 3 planes (no adjacent cancel)', async () => {
    // Adjacent cancel: only SAME adjacent planes cancel.
    // YZ→XZ→YZ → ['YZ','XZ','YZ'] (3 elements, no adjacent same).
    // Geometry: M_YZ(M_XZ(M_YZ(v))) = diag(1,-1,1)·v = M_XZ(v) (coincidental).
    await st().addShape('prism', { radius: 15, height: 20, sides: 5 })
    const id1 = lastShapeId('prism')

    st().selectedIds = [id1]
    await st().mirrorSelected('YZ')
    const id2 = Object.values(st().objects).find(o => o.id !== id1 && o.mirrored?.includes('YZ'))!.id
    expect(st().objects[id2].mirrored).toEqual(['YZ'])

    st().selectedIds = [id2]
    await st().mirrorSelected('XZ')
    const id3 = Object.values(st().objects).find(o => o.id !== id1 && o.id !== id2 && o.mirrored?.includes('XZ'))!.id
    expect(st().objects[id3].mirrored).toEqual(['YZ', 'XZ'])

    st().selectedIds = [id3]
    await st().mirrorSelected('YZ')
    const id4 = Object.values(st().objects).find(o => o.id !== id1 && o.id !== id2 && o.id !== id3)!.id
    expect(st().objects[id4].mirrored).toEqual(['YZ', 'XZ', 'YZ'])
    expect(st().objects[id4].mirrored!.length).toBe(3)
  })
})
