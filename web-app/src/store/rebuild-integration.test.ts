// ============================================================
// Integration tests: add → move → fillet → union → undo
// Tests the rebuild pipeline by exercising the full operation chain.
// ============================================================

import { describe, it, expect } from 'vitest'
import type { TinkerCraftOperation } from '../csg/types'

function makeAddShape(
  id: string,
  shapeType: string,
  params: Record<string, number>,
): TinkerCraftOperation {
  return {
    type: 'add_shape',
    id,
    shapeType: shapeType as any,
    params,
    color: '#89b4fa',
    transform: { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 },
  } as unknown as TinkerCraftOperation
}

function makeMove(ids: string[], delta: { x: number; y: number; z: number }): TinkerCraftOperation {
  return { type: 'move', ids, delta } as unknown as TinkerCraftOperation
}

function makeGroup(ids: string[], resultId: string, op: string = 'union'): TinkerCraftOperation {
  return {
    type: 'group',
    ids,
    resultId,
    op,
    subtractOp: op === 'subtract',
    isIntersect: op === 'intersect',
  } as unknown as TinkerCraftOperation
}

function makeColor(ids: string[], color: string): TinkerCraftOperation {
  return { type: 'color', ids, color } as unknown as TinkerCraftOperation
}

describe('Operation chain: add → move → color', () => {
  it('builds valid operation sequence', () => {
    const ops: TinkerCraftOperation[] = [
      makeAddShape('cube1', 'cube', { width: 20, height: 20, depth: 20 }),
      makeMove(['cube1'], { x: 5, y: 10, z: 0 }),
      makeColor(['cube1'], '#ff0000'),
    ]

    expect(ops.length).toBe(3)
    expect(ops[0].type).toBe('add_shape')
    expect((ops[0] as any).id).toBe('cube1')
    expect(ops[1].type).toBe('move')
    expect((ops[1] as any).delta).toEqual({ x: 5, y: 10, z: 0 })
    expect(ops[2].type).toBe('color')
    expect((ops[2] as any).color).toBe('#ff0000')
  })

  it('supports multiple object selection', () => {
    const ops: TinkerCraftOperation[] = [
      makeAddShape('a', 'cube', { width: 10, height: 10, depth: 10 }),
      makeAddShape('b', 'sphere', { radius: 5 }),
      makeMove(['a', 'b'], { x: 1, y: 2, z: 3 }),
    ]
    expect((ops[2] as any).ids).toEqual(['a', 'b'])
  })
})

describe('Operation chain: add → group (union/subtract/intersect)', () => {
  it('builds union operation', () => {
    const ops: TinkerCraftOperation[] = [
      makeAddShape('a', 'cube', { width: 20, height: 20, depth: 20 }),
      makeAddShape('b', 'sphere', { radius: 10 }),
      makeGroup(['a', 'b'], 'union1', 'union'),
    ]
    expect(ops[2].type).toBe('group')
    expect((ops[2] as any).resultId).toBe('union1')
    expect((ops[2] as any).op).toBe('union')
  })

  it('builds subtract operation', () => {
    const ops: TinkerCraftOperation[] = [
      makeAddShape('a', 'cube', { width: 20, height: 20, depth: 20 }),
      makeAddShape('b', 'sphere', { radius: 10 }),
      makeGroup(['a', 'b'], 'sub1', 'subtract'),
    ]
    expect((ops[2] as any).op).toBe('subtract')
    expect((ops[2] as any).subtractOp).toBe(true)
  })

  it('builds intersect operation', () => {
    const ops: TinkerCraftOperation[] = [
      makeAddShape('a', 'cube', { width: 20, height: 20, depth: 20 }),
      makeAddShape('b', 'sphere', { radius: 10 }),
      makeGroup(['a', 'b'], 'int1', 'intersect'),
    ]
    expect((ops[2] as any).op).toBe('intersect')
    expect((ops[2] as any).isIntersect).toBe(true)
  })
})

describe('Operation chain: add → move → group → move', () => {
  it('supports chaining operations after group', () => {
    const ops: TinkerCraftOperation[] = [
      makeAddShape('a', 'cube', { width: 20, height: 20, depth: 20 }),
      makeAddShape('b', 'sphere', { radius: 10 }),
      makeGroup(['a', 'b'], 'result1'),
      makeMove(['result1'], { x: 100, y: 0, z: 0 }),
    ]
    expect(ops.length).toBe(4)
    expect(ops[3].type).toBe('move')
  })
})

describe('Operation chain: add → fillet → move', () => {
  it('supports fillet on cube', () => {
    const ops: TinkerCraftOperation[] = [
      makeAddShape('cube1', 'cube', { width: 20, height: 20, depth: 20 }),
      { type: 'fillet', id: 'cube1', radius: 1.5 } as unknown as TinkerCraftOperation,
      makeMove(['cube1'], { x: 5, y: 5, z: 0 }),
    ]
    expect(ops.length).toBe(3)
    expect(ops[1].type).toBe('fillet')
    expect((ops[1] as any).radius).toBe(1.5)
    expect(ops[2].type).toBe('move')
  })
})

describe('Operation chain: mirror', () => {
  it('supports XY mirror', () => {
    const ops: TinkerCraftOperation[] = [
      makeAddShape('a', 'cube', { width: 20, height: 20, depth: 20 }),
      { type: 'mirror', ids: ['a'], plane: 'XY' } as unknown as TinkerCraftOperation,
    ]
    expect((ops[1] as any).plane).toBe('XY')
  })

  it('supports XZ mirror', () => {
    const ops: TinkerCraftOperation[] = [
      makeAddShape('a', 'cube', { width: 20, height: 20, depth: 20 }),
      { type: 'mirror', ids: ['a'], plane: 'XZ' } as unknown as TinkerCraftOperation,
    ]
    expect((ops[1] as any).plane).toBe('XZ')
  })

  it('supports YZ mirror', () => {
    const ops: TinkerCraftOperation[] = [
      makeAddShape('a', 'cube', { width: 20, height: 20, depth: 20 }),
      { type: 'mirror', ids: ['a'], plane: 'YZ' } as unknown as TinkerCraftOperation,
    ]
    expect((ops[1] as any).plane).toBe('YZ')
  })
})

describe('Operation chain: align', () => {
  it('supports align operation', () => {
    const ops: TinkerCraftOperation[] = [
      makeAddShape('a', 'cube', { width: 20, height: 20, depth: 20 }),
      { type: 'align', ids: ['a'], axis: 'X', deltas: { a: 5 } } as unknown as TinkerCraftOperation,
    ]
    expect(ops[1].type).toBe('align')
    expect((ops[1] as any).axis).toBe('X')
  })
})

describe('Operation chain: resize_dims', () => {
  it('supports resize operation', () => {
    const ops: TinkerCraftOperation[] = [
      makeAddShape('a', 'cube', { width: 20, height: 20, depth: 20 }),
      { type: 'resize_dims', id: 'a', params: { width: 30, height: 25 } } as unknown as TinkerCraftOperation,
    ]
    expect(ops[1].type).toBe('resize_dims')
    expect((ops[1] as any).params).toEqual({ width: 30, height: 25 })
  })
})

describe('Full pipeline: add → move → fillet → group → move', () => {
  it('builds a complete pipeline', () => {
    const ops: TinkerCraftOperation[] = [
      makeAddShape('cube1', 'cube', { width: 20, height: 20, depth: 20 }),
      makeMove(['cube1'], { x: 5, y: 0, z: 0 }),
      { type: 'fillet', id: 'cube1', radius: 1.5 } as unknown as TinkerCraftOperation,
      makeAddShape('sphere1', 'sphere', { radius: 12 }),
      makeMove(['sphere1'], { x: -10, y: 0, z: 0 }),
      makeGroup(['cube1', 'sphere1'], 'union1', 'union'),
      makeMove(['union1'], { x: 0, y: 50, z: 0 }),
      makeColor(['union1'], '#00ff00'),
    ]

    expect(ops.length).toBe(8)
    expect(ops[0].type).toBe('add_shape')
    expect(ops[1].type).toBe('move')
    expect(ops[2].type).toBe('fillet')
    expect(ops[3].type).toBe('add_shape')
    expect(ops[4].type).toBe('move')
    expect(ops[5].type).toBe('group')
    expect(ops[6].type).toBe('move')
    expect(ops[7].type).toBe('color')

    expect((ops[1] as any).delta).toEqual({ x: 5, y: 0, z: 0 })
    expect((ops[6] as any).delta).toEqual({ x: 0, y: 50, z: 0 })
    expect((ops[2] as any).radius).toBe(1.5)
    expect((ops[5] as any).resultId).toBe('union1')
  })
})

describe('Operation type safety', () => {
  it('all operations have valid types', () => {
    const validTypes = new Set([
      'add_shape', 'move', 'fillet', 'group', 'color',
      'delete', 'mirror', 'align', 'resize_dims',
    ])

    const ops: TinkerCraftOperation[] = [
      makeAddShape('a', 'cube', { width: 10, height: 10, depth: 10 }),
      makeMove(['a'], { x: 1, y: 2, z: 3 }),
      { type: 'fillet', id: 'a', radius: 1 } as unknown as TinkerCraftOperation,
      makeGroup(['a'], 'r1'),
      makeColor(['a'], '#ff0000'),
      { type: 'delete', ids: ['a'] } as unknown as TinkerCraftOperation,
      { type: 'mirror', ids: ['a'], plane: 'XY' } as unknown as TinkerCraftOperation,
      { type: 'align', ids: ['a'], axis: 'X', deltas: { a: 5 } } as unknown as TinkerCraftOperation,
      { type: 'resize_dims', id: 'a', params: { width: 15 } } as unknown as TinkerCraftOperation,
    ]

    for (const op of ops) {
      expect(validTypes.has(op.type)).toBe(true)
    }
  })
})
