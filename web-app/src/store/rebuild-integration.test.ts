// ============================================================
// Integration tests — rebuild meta chain (pure function, no WASM)
// Tests buildRebuildMeta() which is the core logic of rebuildFromHistory.
// FIX (WARN-R5-3, LOW-R5-1): Now tests real production code with
// type-safe operation factories instead of 'as any' casts.
// ============================================================

import { describe, it, expect } from 'vitest'
import { buildRebuildMeta, type RebuildMeta } from './rebuild'
import type {
  TinkerCraftOperation, AddShapeOperation, MoveOperation,
  ColorOperation, GroupOperation, FilletOperation,
  MirrorOperation, AlignOperation, DeleteOperation,
  ResizeDimsOperation,
} from '../csg/types'

const DEFAULT_TRANSFORM = { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 }

// --- Type-safe operation factories ---

function makeAddShape(id: string, shapeType: AddShapeOperation['shapeType'], params: Record<string, number>): AddShapeOperation {
  return { type: 'add_shape', id, shapeType, params, color: '#89b4fa', transform: { ...DEFAULT_TRANSFORM } }
}

function makeMove(ids: string[], delta: { x: number; y: number; z: number }): MoveOperation {
  return { type: 'move', ids, delta }
}

function makeMoveWithRot(ids: string[], delta: { x: number; y: number; z: number }, rotDelta: { x: number; y: number; z: number }): MoveOperation {
  return { type: 'move', ids, delta, rotDelta }
}

function makeMoveWithScale(ids: string[], delta: { x: number; y: number; z: number }, scaleDelta: { x: number; y: number; z: number }): MoveOperation {
  return { type: 'move', ids, delta, scaleDelta }
}

function makeColor(ids: string[], color: string): ColorOperation {
  return { type: 'color', ids, color }
}

function makeGroup(ids: string[], resultId: string, kind: 'union' | 'subtract' | 'intersect' = 'union'): GroupOperation {
  return { type: 'group', ids, resultId, treeOperation: kind }
}

function makeFillet(id: string, radius: number): FilletOperation {
  return { type: 'fillet', id, radius }
}

function makeMirror(originalIds: string[], newIds: string[], plane: MirrorOperation['plane']): MirrorOperation {
  return { type: 'mirror', originalIds, ids: newIds, plane }
}

function makeAlign(ids: string[], axis: AlignOperation['axis'], deltas: Record<string, number>): AlignOperation {
  return { type: 'align', ids, axis, anchor: 'center', deltas }
}

function makeDelete(ids: string[]): DeleteOperation {
  return { type: 'delete', ids }
}

function makeResizeDims(id: string, params: Record<string, number>): ResizeDimsOperation {
  return { type: 'resize_dims', id, params }
}

// --- Tests for buildRebuildMeta (the core meta-building logic) ---

describe('buildRebuildMeta: add_shape → move', () => {
  it('tracks position after move', () => {
    const ops: TinkerCraftOperation[] = [
      makeAddShape('a', 'cube', { width: 20, height: 20, depth: 20 }),
      makeMove(['a'], { x: 10, y: 20, z: 30 }),
    ]
    const { meta } = buildRebuildMeta(ops)
    expect(meta['a'].transform.x).toBe(10)
    expect(meta['a'].transform.y).toBe(20)
    expect(meta['a'].transform.z).toBe(30)
  })

  it('preserves identity fields untouched by move', () => {
    const ops: TinkerCraftOperation[] = [
      makeAddShape('a', 'cube', { width: 20, height: 20, depth: 20 }),
      makeMove(['a'], { x: 10, y: 0, z: 0 }),
    ]
    const { meta } = buildRebuildMeta(ops)
    expect(meta['a'].transform.rotX).toBe(0)
    expect(meta['a'].transform.scaleX).toBe(1)
  })
})

describe('buildRebuildMeta: add_shape → move (rotation)', () => {
  it('tracks rotation delta', () => {
    const ops: TinkerCraftOperation[] = [
      makeAddShape('a', 'cube', { width: 20, height: 20, depth: 20 }),
      makeMoveWithRot(['a'], { x: 0, y: 0, z: 0 }, { x: 45, y: 90, z: 0 }),
    ]
    const { meta } = buildRebuildMeta(ops)
    expect(meta['a'].transform.rotX).toBe(45)
    expect(meta['a'].transform.rotY).toBe(90)
    expect(meta['a'].transform.rotZ).toBe(0)
  })
})

describe('buildRebuildMeta: add_shape → move (scale)', () => {
  it('tracks scale delta', () => {
    const ops: TinkerCraftOperation[] = [
      makeAddShape('a', 'cube', { width: 20, height: 20, depth: 20 }),
      makeMoveWithScale(['a'], { x: 0, y: 0, z: 0 }, { x: 0.5, y: 0, z: 0 }),
    ]
    const { meta } = buildRebuildMeta(ops)
    expect(meta['a'].transform.scaleX).toBe(1.5)
    expect(meta['a'].transform.scaleY).toBe(1)
  })
})

describe('buildRebuildMeta: mirror (negate position)', () => {
  it('mirrors across YZ plane: X perpendicular → scaleX unchanged, scaleY/scaleZ negated', () => {
    const ops: TinkerCraftOperation[] = [
      makeAddShape('a', 'cube', { width: 20, height: 20, depth: 20 }),
      makeMoveWithScale(['a'], { x: 10, y: 20, z: 30 }, { x: 1, y: 1, z: 1 }), // scale: 2, 2, 2
      makeMirror(['a'], ['b'], 'YZ'),
    ]
    const { meta } = buildRebuildMeta(ops)
    // Original 'a' is unchanged
    expect(meta['a'].transform.x).toBe(10)
    expect(meta['a'].transform.scaleX).toBe(2)
    // YZ mirror: X perpendicular → scaleX UNCHANGED, scaleY/scaleZ negated
    expect(meta['b'].transform.x).toBe(-10)
    expect(meta['b'].transform.y).toBe(20)
    expect(meta['b'].transform.z).toBe(30)
    expect(meta['b'].transform.scaleX).toBe(2)   // unchanged (perpendicular)
    expect(meta['b'].transform.scaleY).toBe(2)   // abs() (in plane, always positive)
    expect(meta['b'].transform.scaleZ).toBe(2)   // abs() (in plane, always positive)
  })

  it('mirrors across XZ plane: Y perpendicular → scaleY unchanged, scaleX/scaleZ = abs()', () => {
    const ops: TinkerCraftOperation[] = [
      makeAddShape('a', 'cube', { width: 20, height: 20, depth: 20 }),
      makeMoveWithScale(['a'], { x: 10, y: 20, z: 30 }, { x: 0.5, y: 1, z: 1 }), // scale: 1.5, 2, 2
      makeMirror(['a'], ['b'], 'XZ'),
    ]
    const { meta } = buildRebuildMeta(ops)
    expect(meta['b'].transform.x).toBe(10)
    expect(meta['b'].transform.y).toBe(-20)
    expect(meta['b'].transform.z).toBe(30)
    expect(meta['b'].transform.scaleX).toBe(1.5)  // abs() (in plane, always positive)
    expect(meta['b'].transform.scaleY).toBe(2)     // unchanged (perpendicular)
    expect(meta['b'].transform.scaleZ).toBe(2)     // abs() (in plane, always positive)
  })

  it('mirrors across XY plane: Z perpendicular → scaleZ unchanged, scaleX/scaleY = abs()', () => {
    const ops: TinkerCraftOperation[] = [
      makeAddShape('a', 'cube', { width: 20, height: 20, depth: 20 }),
      makeMoveWithScale(['a'], { x: 10, y: 20, z: 30 }, { x: 1, y: 1, z: 2 }), // scale: 2, 2, 3
      makeMirror(['a'], ['b'], 'XY'),
    ]
    const { meta } = buildRebuildMeta(ops)
    expect(meta['b'].transform.x).toBe(10)
    expect(meta['b'].transform.y).toBe(20)
    expect(meta['b'].transform.z).toBe(-30)
    expect(meta['b'].transform.scaleX).toBe(2)   // abs() (in plane, always positive)
    expect(meta['b'].transform.scaleY).toBe(2)   // abs() (in plane, always positive)
    expect(meta['b'].transform.scaleZ).toBe(3)    // unchanged (perpendicular)
  })

  it('preserves shapeType and params through mirror', () => {
    const ops: TinkerCraftOperation[] = [
      makeAddShape('a', 'cylinder', { radius: 5, height: 10, segments: 16 }),
      makeMirror(['a'], ['b'], 'YZ'),
    ]
    const { meta } = buildRebuildMeta(ops)
    expect(meta['b'].shapeType).toBe('cylinder')
    expect(meta['b'].params.radius).toBe(5)
    expect(meta['b'].params.height).toBe(10)
  })

  it('handles multi-select mirror', () => {
    const ops: TinkerCraftOperation[] = [
      makeAddShape('a', 'cube', { width: 20, height: 20, depth: 20 }),
      makeAddShape('c', 'cube', { width: 10, height: 10, depth: 10 }),
      makeMoveWithScale(['a'], { x: 10, y: 0, z: 0 }, { x: 1, y: 1, z: 1 }),  // scale 2, pos (10,0,0)
      makeMoveWithScale(['c'], { x: -10, y: 0, z: 0 }, { x: 2, y: 2, z: 2 }), // scale 3, pos (-10,0,0)
      makeMirror(['a', 'c'], ['b', 'd'], 'YZ'),
    ]
    const { meta } = buildRebuildMeta(ops)
    // YZ mirror: X is perpendicular → scaleX UNCHANGED, scaleY/scaleZ = abs()
    // a → b: pos.x mirrored, rotY/rotZ negated, scaleY/scaleZ = abs()
    expect(meta['b'].transform.x).toBe(-10)
    expect(meta['b'].transform.scaleX).toBe(2)   // unchanged (perpendicular axis)
    expect(meta['b'].transform.scaleY).toBe(2)   // abs() (in plane, always positive)
    expect(meta['b'].transform.scaleZ).toBe(2)   // abs() (in plane, always positive)
    // c → d: pos.x mirrored, rotY/rotZ negated, scaleY/scaleZ = abs()
    expect(meta['d'].transform.x).toBe(10)
    expect(meta['d'].transform.scaleX).toBe(3)   // unchanged (perpendicular axis)
    expect(meta['d'].transform.scaleY).toBe(3)   // abs() (in plane, always positive)
    expect(meta['d'].transform.scaleZ).toBe(3)   // abs() (in plane, always positive)
  })
})

describe('buildRebuildMeta: color update', () => {
  it('updates color without affecting transform', () => {
    const ops: TinkerCraftOperation[] = [
      makeAddShape('a', 'cube', { width: 20, height: 20, depth: 20 }),
      makeColor(['a'], '#ff0000'),
    ]
    const { meta } = buildRebuildMeta(ops)
    expect(meta['a'].color).toBe('#ff0000')
    expect(meta['a'].shapeType).toBe('cube')
    expect(meta['a'].transform.rotX).toBe(0)
  })
})

describe('buildRebuildMeta: fillet updates params', () => {
  it('adds filletRadius to params', () => {
    const ops: TinkerCraftOperation[] = [
      makeAddShape('a', 'cube', { width: 20, height: 20, depth: 20 }),
      makeFillet('a', 2.5),
    ]
    const { meta } = buildRebuildMeta(ops)
    expect(meta['a'].params.filletRadius).toBe(2.5)
    expect(meta['a'].params.width).toBe(20)
  })
})

describe('buildRebuildMeta: group creates result and removes sources', () => {
  it('removes source objects and creates result', () => {
    const ops: TinkerCraftOperation[] = [
      makeAddShape('a', 'cube', { width: 20, height: 20, depth: 20 }),
      makeAddShape('b', 'sphere', { radius: 10 }),
      makeGroup(['a', 'b'], 'result1', 'union'),
    ]
    const { meta, csgResultIds } = buildRebuildMeta(ops)
    expect(meta['a']).toBeUndefined()
    expect(meta['b']).toBeUndefined()
    expect(meta['result1']).toBeDefined()
    expect(csgResultIds.has('result1')).toBe(true)
  })

  it('result inherits color from first source', () => {
    const ops: TinkerCraftOperation[] = [
      makeAddShape('a', 'cube', { width: 20, height: 20, depth: 20 }),
      makeColor(['a'], '#00ff00'),
      makeAddShape('b', 'sphere', { radius: 10 }),
      makeGroup(['a', 'b'], 'result1', 'union'),
    ]
    const { meta } = buildRebuildMeta(ops)
    expect(meta['result1'].color).toBe('#00ff00')
  })
})

describe('buildRebuildMeta: delete removes objects', () => {
  it('removes deleted object from meta', () => {
    const ops: TinkerCraftOperation[] = [
      makeAddShape('a', 'cube', { width: 20, height: 20, depth: 20 }),
      makeAddShape('b', 'sphere', { radius: 10 }),
      makeDelete(['a']),
    ]
    const { meta } = buildRebuildMeta(ops)
    expect(meta['a']).toBeUndefined()
    expect(meta['b']).toBeDefined()
  })
})

describe('buildRebuildMeta: align', () => {
  it('applies align delta to transform', () => {
    const ops: TinkerCraftOperation[] = [
      makeAddShape('a', 'cube', { width: 20, height: 20, depth: 20 }),
      makeMove(['a'], { x: 10, y: 0, z: 0 }),
      makeAlign(['a'], 'X', { a: 5 }),
    ]
    const { meta } = buildRebuildMeta(ops)
    expect(meta['a'].transform.x).toBe(15)
  })
})

describe('buildRebuildMeta: resize_dims', () => {
  it('resize_dims does not affect transform (only params handled by worker)', () => {
    const ops: TinkerCraftOperation[] = [
      makeAddShape('a', 'cube', { width: 20, height: 20, depth: 20 }),
      makeResizeDims('a', { width: 30 }),
    ]
    const { meta } = buildRebuildMeta(ops)
    // resize_dims rebuild logic is handled by the worker, not by meta
    expect(meta['a'].transform.x).toBe(0)
  })
})

describe('buildRebuildMeta: full pipeline add → move → fillet → group → move', () => {
  it('tracks through full operation chain', () => {
    const ops: TinkerCraftOperation[] = [
      makeAddShape('cube1', 'cube', { width: 20, height: 20, depth: 20 }),
      makeMove(['cube1'], { x: 5, y: 0, z: 0 }),
      makeFillet('cube1', 1.5),
      makeAddShape('sphere1', 'sphere', { radius: 12 }),
      makeMove(['sphere1'], { x: -10, y: 0, z: 0 }),
      makeGroup(['cube1', 'sphere1'], 'union1', 'union'),
      makeMove(['union1'], { x: 0, y: 50, z: 0 }),
      makeColor(['union1'], '#00ff00'),
    ]
    const { meta, csgResultIds } = buildRebuildMeta(ops)
    expect(meta['cube1']).toBeUndefined() // removed by group
    expect(meta['sphere1']).toBeUndefined()
    expect(csgResultIds.has('union1')).toBe(true)
    expect(meta['union1']).toBeDefined()
    expect(meta['union1'].color).toBe('#00ff00')
    expect(meta['union1'].transform.y).toBe(50)
  })
})

describe('buildRebuildMeta: multiple objects selected for move', () => {
  it('moves all selected objects', () => {
    const ops: TinkerCraftOperation[] = [
      makeAddShape('a', 'cube', { width: 10, height: 10, depth: 10 }),
      makeAddShape('b', 'sphere', { radius: 5 }),
      makeMove(['a', 'b'], { x: 1, y: 2, z: 3 }),
    ]
    const { meta } = buildRebuildMeta(ops)
    expect(meta['a'].transform.x).toBe(1)
    expect(meta['b'].transform.x).toBe(1)
    expect(meta['a'].transform.y).toBe(2)
    expect(meta['b'].transform.y).toBe(2)
    expect(meta['a'].transform.z).toBe(3)
    expect(meta['b'].transform.z).toBe(3)
  })
})

describe('buildRebuildMeta: chain add → move → color → move', () => {
  it('color after move does not override transform', () => {
    const ops: TinkerCraftOperation[] = [
      makeAddShape('a', 'cube', { width: 10, height: 10, depth: 10 }),
      makeMove(['a'], { x: 5, y: 10, z: 0 }),
      makeColor(['a'], '#ff0000'),
      makeMove(['a'], { x: 0, y: -5, z: 0 }),
    ]
    const { meta } = buildRebuildMeta(ops)
    expect(meta['a'].color).toBe('#ff0000')
    expect(meta['a'].transform.x).toBe(5)
    expect(meta['a'].transform.y).toBe(5) // 10 + (-5)
  })
})

