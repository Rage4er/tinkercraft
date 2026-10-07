// ============================================================
// Unit tests — document-store: computeAABB, extractAndCenterInPlace
// ============================================================

import { describe, it, expect } from 'vitest'
import { computeAABB, extractAndCenterInPlace } from './document-store'
import { useDocumentStore } from './document-store'

describe('computeAABB', () => {
  it('computes correct min/max for a simple box', () => {
    const verts = new Float32Array([
      0, 0, 0,
      2, 0, 0,
      2, 3, 0,
      0, 3, 0,
      0, 0, 4,
      2, 0, 4,
      2, 3, 4,
      0, 3, 4,
    ])
    const aabb = computeAABB(verts)
    expect(aabb.min.x).toBe(0)
    expect(aabb.min.y).toBe(0)
    expect(aabb.min.z).toBe(0)
    expect(aabb.max.x).toBe(2)
    expect(aabb.max.y).toBe(3)
    expect(aabb.max.z).toBe(4)
  })

  it('handles negative coordinates', () => {
    const verts = new Float32Array([
      -5, -10, -3,
      5, 10, 3,
    ])
    const aabb = computeAABB(verts)
    expect(aabb.min.x).toBe(-5)
    expect(aabb.min.y).toBe(-10)
    expect(aabb.min.z).toBe(-3)
    expect(aabb.max.x).toBe(5)
    expect(aabb.max.y).toBe(10)
    expect(aabb.max.z).toBe(3)
  })

  it('handles a single vertex', () => {
    const verts = new Float32Array([7, 8, 9])
    const aabb = computeAABB(verts)
    expect(aabb.min.x).toBe(7)
    expect(aabb.min.y).toBe(8)
    expect(aabb.min.z).toBe(9)
    expect(aabb.max.x).toBe(7)
    expect(aabb.max.y).toBe(8)
    expect(aabb.max.z).toBe(9)
  })
})

describe('extractAndCenterInPlace', () => {
  it('shifts vertices so bbox center is at origin', () => {
    // Box from (10,20,30) to (30,40,50) — center at (20,30,40)
    const verts = new Float32Array([
      10, 20, 30,
      30, 20, 30,
      30, 40, 30,
      10, 40, 30,
      10, 20, 50,
      30, 20, 50,
      30, 40, 50,
      10, 40, 50,
    ])
    const { cx, cy, cz } = extractAndCenterInPlace(verts)
    expect(cx).toBe(20)
    expect(cy).toBe(30)
    expect(cz).toBe(40)

    // After centering, min should be at (-10,-10,-10) and max at (10,10,10)
    const aabb = computeAABB(verts)
    expect(aabb.min.x).toBe(-10)
    expect(aabb.min.y).toBe(-10)
    expect(aabb.min.z).toBe(-10)
    expect(aabb.max.x).toBe(10)
    expect(aabb.max.y).toBe(10)
    expect(aabb.max.z).toBe(10)
  })

  it('modifies the input array in-place', () => {
    const verts = new Float32Array([0, 0, 0, 10, 0, 0, 0, 10, 0])
    const original = new Float32Array(verts)
    extractAndCenterInPlace(verts)
    // The array should have changed
    expect(verts).not.toEqual(original)
  })

  it('returns zero center for empty array', () => {
    const verts = new Float32Array(0)
    const { cx, cy, cz } = extractAndCenterInPlace(verts)
    expect(cx).toBe(0)
    expect(cy).toBe(0)
    expect(cz).toBe(0)
  })

  it('is a no-op for already-centered geometry', () => {
    // Box from (-5,-5,-5) to (5,5,5) — center at (0,0,0)
    const verts = new Float32Array([
      -5, -5, -5,
      5, -5, -5,
      5, 5, -5,
      -5, 5, -5,
      -5, -5, 5,
      5, -5, 5,
      5, 5, 5,
      -5, 5, 5,
    ])
    const original = new Float32Array(verts)
    const { cx, cy, cz } = extractAndCenterInPlace(verts)
    expect(cx).toBe(0)
    expect(cy).toBe(0)
    expect(cz).toBe(0)
    // Vertices should not change
    expect(verts).toEqual(original)
  })
})

// ============================================================
// CSG-PRESERVE-RS: csgBoolean preserves rotation/scale from operand A
//
// NOTE: These tests require a Worker/WASM environment and cannot run
// in jsdom. They are kept as documentation for the expected behavior.
// Run manually in the browser or with a proper worker mock.
// ============================================================

/*
describe('csgBoolean preserves rotation/scale', () => {
  it('copies rotation/scale from operand A', async () => {
    const store = useDocumentStore.getState()

    // Создать куб с rotation/scale
    await store.addShape('cube', { width: 20, height: 20, depth: 20 })
    // Применяем custom transform через moveObject (rotate + scale)
    const objA = Object.values(store.objects)[0]
    await store.moveObject(objA.id, {
      x: objA.transform.x, y: objA.transform.y, z: objA.transform.z,
      rotX: 20, rotY: 20, rotZ: 20,
      scaleX: 1, scaleY: 1, scaleZ: 0.5,
    })

    // Создать второй куб
    await store.addShape('cube', { width: 20, height: 20, depth: 20 })

    // Выделить оба и сделать CSG union
    const ids = Object.values(store.objects).filter(o => o.shapeType === 'cube').map(o => o.id)
    store.selectObjects(ids, false)
    await store.csgBoolean('union')

    // Проверить результат
    const csgResult = Object.values(store.objects).find(o => o.shapeType === 'csg')

    expect(csgResult).toBeDefined()
    expect(csgResult!.transform.rotX).toBe(20)
    expect(csgResult!.transform.rotY).toBe(20)
    expect(csgResult!.transform.rotZ).toBe(20)
    expect(csgResult!.transform.scaleX).toBe(1)
    expect(csgResult!.transform.scaleY).toBe(1)
    expect(csgResult!.transform.scaleZ).toBe(0.5)
  })

  it('CSG with mirrored prism preserves negative scale', async () => {
    const store = useDocumentStore.getState()

    // Призма sides=3
    await store.addShape('prism', { radius: 12, height: 20, sides: 3 })

    // Зеркало YZ → scaleX=-1
    const prism = Object.values(store.objects)[0]
    store.selectObjects([prism.id], false)
    await store.mirrorSelected('YZ')

    const mirroredPrism = Object.values(store.objects).find(o => o.shapeType === 'prism')!
    expect(mirroredPrism).toBeDefined()
    expect(mirroredPrism!.transform.scaleX).toBe(-1)

    // Куб
    await store.addShape('cube', { width: 20, height: 20, depth: 20 })

    // CSG union
    const ids = Object.values(store.objects).map(o => o.id)
    store.selectObjects(ids, false)
    await store.csgBoolean('union')

    const csg = Object.values(store.objects).find(o => o.shapeType === 'csg')!

    // Проверить что отрицательный scale сохранён
    expect(csg.transform.scaleX).toBe(-1)
  })
})
*/
