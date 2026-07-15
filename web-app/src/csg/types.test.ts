// ============================================================
// Unit tests — types и вспомогательные функции
// ============================================================

import { describe, it, expect } from 'vitest'
import type {
  TinkerCraftOperation, AddShapeOperation, ResizeDimsOperation,
  RenameOperation, GroupOperation, ShapeParams, SceneObject, TransformNR,
} from './types'

const DEFAULT_TRANSFORM: TransformNR = { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 }
const DEFAULT_PARAMS: ShapeParams     = { width: 20, height: 20, depth: 20 }

function makeSceneObject(overrides: Partial<SceneObject> = {}): SceneObject {
  return {
    id: 'obj_1', shapeType: 'cube', params: DEFAULT_PARAMS,
    color: '#89b4fa', transform: DEFAULT_TRANSFORM,
    visible: true, locked: false,
    vertices: new Float32Array([0,0,0, 1,0,0, 1,1,0]),
    indices:  new Uint32Array([0,1,2]),
    ...overrides,
  }
}

// ---- Type narrowing ----

describe('TinkerCraftOperation type narrowing', () => {
  it('add_shape has shapeType field', () => {
    const op: AddShapeOperation = { type: 'add_shape', id: 'x', shapeType: 'cube', params: DEFAULT_PARAMS, color: '#fff', transform: DEFAULT_TRANSFORM }
    expect(op.type).toBe('add_shape')
    expect(op.shapeType).toBe('cube')
  })

  it('resize_dims has params field', () => {
    const op: ResizeDimsOperation = { type: 'resize_dims', id: 'x', params: { width: 30 } }
    expect(op.params.width).toBe(30)
  })

  it('rename has name field', () => {
    const op: RenameOperation = { type: 'rename', id: 'x', name: 'My Box' }
    expect(op.name).toBe('My Box')
  })

  it('group union', () => {
    const op: GroupOperation = { type: 'group', ids: ['a','b'], isHull: false, isIntersect: false, resultId: 'ab' }
    expect(op.ids).toHaveLength(2)
    expect(op.isIntersect).toBe(false)
  })

  it('group intersect', () => {
    const op: GroupOperation = { type: 'group', ids: ['a','b'], isHull: false, isIntersect: true }
    expect(op.isIntersect).toBe(true)
  })

  it('operation discriminator works', () => {
    const ops: TinkerCraftOperation[] = [
      { type: 'add_shape', id: '1', shapeType: 'sphere', params: {radius:10}, color:'#f00', transform: DEFAULT_TRANSFORM },
      { type: 'delete', ids: ['1'] },
      { type: 'rename', id: '1', name: 'Sphere 1' },
    ]
    expect(ops.map(o => o.type)).toEqual(['add_shape', 'delete', 'rename'])
  })
})

// ---- SceneObject ----

describe('SceneObject', () => {
  it('has correct fields', () => {
    const obj = makeSceneObject()
    expect(obj.id).toBe('obj_1')
    expect(obj.visible).toBe(true)
    expect(obj.vertices).toBeInstanceOf(Float32Array)
    expect(obj.indices).toBeInstanceOf(Uint32Array)
  })

  it('can be hidden', () => {
    const obj = makeSceneObject({ visible: false })
    expect(obj.visible).toBe(false)
  })

  it('supports optional name', () => {
    const named = makeSceneObject({ name: 'Box A' })
    expect(named.name).toBe('Box A')
    const unnamed = makeSceneObject()
    expect(unnamed.name).toBeUndefined()
  })

  it('triangle count from indices', () => {
    const obj = makeSceneObject({ indices: new Uint32Array(Array.from({length: 36}, (_, i) => i % 8)) })
    expect(obj.indices.length / 3).toBe(12)
  })
})

// ---- ShapeParams ----

describe('ShapeParams', () => {
  it('supports width/height/depth', () => {
    const p: ShapeParams = { width: 10, height: 20, depth: 30 }
    expect(p.width).toBe(10)
  })

  it('supports radius + segments', () => {
    const p: ShapeParams = { radius: 12, segments: 32 }
    expect(p.radius).toBe(12)
    expect(p.segments).toBe(32)
  })

  it('supports filletRadius', () => {
    const p: ShapeParams = { filletRadius: 2 }
    expect(p.filletRadius).toBe(2)
  })
})
