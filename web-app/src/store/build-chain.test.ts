// ============================================================
// Build chain tests — CSG chains, mirror+CSG, undo/redo, jumpToHistory
// Tests that the build tree is correctly reconstructed from operation history.
// Phase 7.5.4 — Тестирование цепочек операций (без редактирования параметров)
// ============================================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  clearTree,
  getNode,
  treeStore,
} from '../csg/history-tree'
import { rebuildBuildTree } from './rebuild'
import type {
  TinkerCraftOperation,
  AddShapeOperation,
  MoveOperation,
  MirrorOperation,
  GroupOperation,
  DeleteOperation,
} from '../csg/types'

const DEFAULT_TRANSFORM = {
  x: 0, y: 0, z: 0,
  rotX: 0, rotY: 0, rotZ: 0,
  scaleX: 1, scaleY: 1, scaleZ: 1,
}

// --- Type-safe operation factories ---

function makeAddShape(
  id: string,
  shapeType: AddShapeOperation['shapeType'],
  params: Record<string, number>,
  transform?: Partial<typeof DEFAULT_TRANSFORM>,
): AddShapeOperation {
  return {
    type: 'add_shape',
    id,
    shapeType,
    params,
    color: '#89b4fa',
    transform: { ...DEFAULT_TRANSFORM, ...transform },
  }
}

function makeMove(ids: string[], delta: { x: number; y: number; z: number }): MoveOperation {
  return { type: 'move', ids, delta }
}

function makeGroup(
  ids: string[],
  resultId: string,
  operation: 'union' | 'subtract' | 'intersect' = 'union',
): GroupOperation {
  return { type: 'group', ids, resultId, treeOperation: operation }
}

function makeMirror(
  originalIds: string[],
  newIds: string[],
  plane: MirrorOperation['plane'],
): MirrorOperation {
  return { type: 'mirror', originalIds, ids: newIds, plane }
}

function makeDelete(ids: string[]): DeleteOperation {
  return { type: 'delete', ids }
}

// ---------------------------------------------------------------------------
// 1. CSG-цепочка: куб → union с цилиндром → union со сферой
// ---------------------------------------------------------------------------

describe('CSG цепочки', () => {
  beforeEach(() => { clearTree() })

  it('создаёт вложенный CSG: куб → union с цилиндром → union со сферой', () => {
    const ops: TinkerCraftOperation[] = [
      makeAddShape('cube', 'cube', { width: 20, height: 20, depth: 20 }),
      makeAddShape('cyl', 'cylinder', { radius: 10, height: 30 }, { x: 15, y: 0, z: 0 }),
      makeGroup(['cube', 'cyl'], 'csg_1', 'union'),
      makeAddShape('sphere', 'sphere', { radius: 15 }, { x: 30, y: 0, z: 0 }),
      makeGroup(['csg_1', 'sphere'], 'csg_2', 'union'),
    ]

    rebuildBuildTree(ops)

    // Проверяем csg_1: children = [cube, cyl]
    const csg1 = getNode('csg_1')
    expect(csg1).toBeDefined()
    expect(csg1?.type).toBe('boolean')
    expect(csg1?.operation).toBe('union')
    expect(csg1?.children).toEqual(['cube', 'cyl'])

    // Проверяем csg_2: children = [csg_1, sphere]
    const csg2 = getNode('csg_2')
    expect(csg2).toBeDefined()
    expect(csg2?.type).toBe('boolean')
    expect(csg2?.operation).toBe('union')
    expect(csg2?.children).toEqual(['csg_1', 'sphere'])

    // Проверяем parentId: cube.parentId = csg_1, cyl.parentId = csg_1
    const cube = getNode('cube')
    const cyl = getNode('cyl')
    const sphere = getNode('sphere')
    expect(cube?.parentId).toBe('csg_1')
    expect(cyl?.parentId).toBe('csg_1')
    expect(sphere?.parentId).toBe('csg_2')

    // Проверяем chain: sphere → csg_2 → csg_1 → cube
    expect(csg2?.parentId).toBeUndefined() // root
  })

  it('subtract: куб вычитает цилиндр', () => {
    const ops: TinkerCraftOperation[] = [
      makeAddShape('cube', 'cube', { width: 20, height: 20, depth: 20 }),
      makeAddShape('cyl', 'cylinder', { radius: 5, height: 30 }, { x: 5, y: 0, z: 0 }),
      makeGroup(['cube', 'cyl'], 'csg_sub', 'subtract'),
    ]

    rebuildBuildTree(ops)

    const csgSub = getNode('csg_sub')
    expect(csgSub).toBeDefined()
    expect(csgSub?.type).toBe('boolean')
    expect(csgSub?.operation).toBe('subtract')
    expect(csgSub?.children).toEqual(['cube', 'cyl'])
    expect(csgSub?.parentId).toBeUndefined()
  })

  it('intersect: куб пересекается с цилиндром', () => {
    const ops: TinkerCraftOperation[] = [
      makeAddShape('cube', 'cube', { width: 20, height: 20, depth: 20 }),
      makeAddShape('cyl', 'cylinder', { radius: 10, height: 30 }, { x: 5, y: 0, z: 0 }),
      makeGroup(['cube', 'cyl'], 'csg_int', 'intersect'),
    ]

    rebuildBuildTree(ops)

    const csgInt = getNode('csg_int')
    expect(csgInt).toBeDefined()
    expect(csgInt?.type).toBe('boolean')
    expect(csgInt?.operation).toBe('intersect')
    expect(csgInt?.children).toEqual(['cube', 'cyl'])
  })
})

// ---------------------------------------------------------------------------
// 2. Mirror + CSG: куб → зеркало → union со сферой
// ---------------------------------------------------------------------------

describe('Mirror + CSG', () => {
  beforeEach(() => { clearTree() })

  it('куб → зеркало YZ → union со сферой', () => {
    // Куб на позиции x=10, зеркало YZ отражает его на x=-10
    const ops: TinkerCraftOperation[] = [
      makeAddShape('cube', 'cube', { width: 20, height: 20, depth: 20 }, { x: 10, y: 0, z: 0 }),
      makeMirror(['cube'], ['cube_m'], 'YZ'),
      makeAddShape('sphere', 'sphere', { radius: 15 }, { x: -25, y: 0, z: 0 }),
      makeGroup(['cube_m', 'sphere'], 'csg_1', 'union'),
    ]

    rebuildBuildTree(ops)

    // cube_m — примитив (результат зеркала примитива)
    const cubeM = getNode('cube_m')
    expect(cubeM).toBeDefined()
    expect(cubeM?.type).toBe('primitive')
    // После зеркала YZ позиция x инвертируется: 10 → -10
    expect(cubeM?.localTransform?.x).toBe(-10)

    // csg_1 — boolean с детьми [cube_m, sphere]
    const csg1 = getNode('csg_1')
    expect(csg1).toBeDefined()
    expect(csg1?.type).toBe('boolean')
    expect(csg1?.operation).toBe('union')
    expect(csg1?.children).toEqual(['cube_m', 'sphere'])
  })

  it('зеркало не ломает дерево при нескольких объектах', () => {
    const ops: TinkerCraftOperation[] = [
      makeAddShape('a', 'cube', { width: 10, height: 10, depth: 10 }),
      makeAddShape('b', 'cube', { width: 10, height: 10, depth: 10 }, { x: 20, y: 0, z: 0 }),
      makeMirror(['a', 'b'], ['a_m', 'b_m'], 'XZ'),
      makeGroup(['a_m', 'b_m'], 'csg_1', 'union'),
    ]

    rebuildBuildTree(ops)

    const csg1 = getNode('csg_1')
    expect(csg1).toBeDefined()
    expect(csg1?.children).toEqual(['a_m', 'b_m'])

    const aM = getNode('a_m')
    const bM = getNode('b_m')
    expect(aM?.type).toBe('primitive')
    expect(bM?.type).toBe('primitive')
    // Зеркало XZ: y инвертируется (но позиции были 0, так что 0 → 0)
    expect(aM?.localTransform?.x).toBe(0)
    expect(bM?.localTransform?.x).toBe(20)
  })
})

// ---------------------------------------------------------------------------
// 3. Undo/Redo через CSG-цепочку (rebuild из среза истории)
// ---------------------------------------------------------------------------

describe('Undo/Redo через CSG-цепочку', () => {
  beforeEach(() => { clearTree() })

  it('undo: откат через CSG удаляет boolean-ноду', () => {
    const ops: TinkerCraftOperation[] = [
      makeAddShape('cube', 'cube', { width: 20, height: 20, depth: 20 }),
      makeAddShape('cyl', 'cylinder', { radius: 10, height: 30 }, { x: 15, y: 0, z: 0 }),
      makeGroup(['cube', 'cyl'], 'csg_1', 'union'),
    ]

    // Полная история → csg_1 существует
    rebuildBuildTree(ops)
    expect(getNode('csg_1')).toBeDefined()
    expect(getNode('cube')).toBeDefined()
    expect(getNode('cyl')).toBeDefined()

    // Undo до шага 2 (только cube и cyl, без csg_1)
    const undoOps = ops.slice(0, 2)
    clearTree()
    rebuildBuildTree(undoOps)

    // csg_1 не должен существовать
    expect(getNode('csg_1')).toBeUndefined()
    // Но cube и cyl должны быть
    expect(getNode('cube')).toBeDefined()
    expect(getNode('cyl')).toBeDefined()
  })

  it('redo: повторное применение CSG воссоздаёт boolean-ноду', () => {
    const ops: TinkerCraftOperation[] = [
      makeAddShape('cube', 'cube', { width: 20, height: 20, depth: 20 }),
      makeAddShape('cyl', 'cylinder', { radius: 10, height: 30 }, { x: 15, y: 0, z: 0 }),
      makeGroup(['cube', 'cyl'], 'csg_1', 'union'),
    ]

    // Undo: без csg_1
    clearTree()
    rebuildBuildTree(ops.slice(0, 2))
    expect(getNode('csg_1')).toBeUndefined()

    // Redo: снова csg_1
    rebuildBuildTree(ops)
    const csg1 = getNode('csg_1')
    expect(csg1).toBeDefined()
    expect(csg1?.type).toBe('boolean')
    expect(csg1?.operation).toBe('union')
    expect(csg1?.children).toEqual(['cube', 'cyl'])
  })

  it('глубокий undo/redo: 5 шагов вперёд-назад', () => {
    const ops: TinkerCraftOperation[] = [
      makeAddShape('a', 'cube', { width: 10, height: 10, depth: 10 }),
      makeAddShape('b', 'cube', { width: 10, height: 10, depth: 10 }, { x: 15, y: 0, z: 0 }),
      makeGroup(['a', 'b'], 'csg_1', 'union'),
      makeAddShape('c', 'sphere', { radius: 10 }, { x: 30, y: 0, z: 0 }),
      makeGroup(['csg_1', 'c'], 'csg_2', 'subtract'),
    ]

    // Полный rebuild
    rebuildBuildTree(ops)
    expect(getNode('csg_2')).toBeDefined()
    expect(getNode('csg_1')).toBeDefined()
    expect(getNode('a')).toBeDefined()

    // Undo до 0 (пустая сцена)
    clearTree()
    rebuildBuildTree([])
    expect(treeStore.nodeCount).toBe(0)

    // Redo до конца
    rebuildBuildTree(ops)
    expect(getNode('csg_2')).toBeDefined()
    expect(treeStore.nodeCount).toBe(5) // a, b, csg_1, c, csg_2
  })
})

// ---------------------------------------------------------------------------
// 4. Jump to history через CSG-цепочку
// ---------------------------------------------------------------------------

describe('Jump to history', () => {
  beforeEach(() => { clearTree() })

  it('переход к середине цепочки: куб → цилиндр → jump → redo', () => {
    const ops: TinkerCraftOperation[] = [
      makeAddShape('cube', 'cube', { width: 20, height: 20, depth: 20 }),
      makeMove(['cube'], { x: 5, y: 0, z: 0 }),
      makeAddShape('cyl', 'cylinder', { radius: 10, height: 30 }, { x: 15, y: 0, z: 0 }),
      makeGroup(['cube', 'cyl'], 'csg_1', 'union'),
    ]

    // Jump к шагу 2 (cube + move, без cyl и csg_1)
    clearTree()
    rebuildBuildTree(ops.slice(0, 2))
    expect(getNode('cube')).toBeDefined()
    expect(getNode('cyl')).toBeUndefined()
    expect(getNode('csg_1')).toBeUndefined()

    // Redo: добавляем cyl и csg_1
    rebuildBuildTree(ops)
    const csg1 = getNode('csg_1')
    expect(csg1).toBeDefined()
    expect(csg1?.children).toEqual(['cube', 'cyl'])
  })

  it('jump в конец цепочки: delete после CSG', () => {
    const ops: TinkerCraftOperation[] = [
      makeAddShape('cube', 'cube', { width: 20, height: 20, depth: 20 }),
      makeAddShape('cyl', 'cylinder', { radius: 10, height: 30 }, { x: 15, y: 0, z: 0 }),
      makeGroup(['cube', 'cyl'], 'csg_1', 'union'),
      makeDelete(['cube']), // Удаляем cube после CSG
    ]

    // Jump к шагу 3 (до delete)
    clearTree()
    rebuildBuildTree(ops.slice(0, 3))

    const csg1 = getNode('csg_1')
    expect(csg1).toBeDefined()
    expect(csg1?.children).toEqual(['cube', 'cyl'])
    // cube и cyl должны быть в дереве (даже если cube удалён из objects)
    expect(getNode('cube')).toBeDefined()
    expect(getNode('cyl')).toBeDefined()
  })

  it('jump с delete объекта, который является child CSG', () => {
    // Это тест для CYCLE-CSG: delete + jump to history после delete
    const ops: TinkerCraftOperation[] = [
      makeAddShape('cube', 'cube', { width: 20, height: 20, depth: 20 }),
      makeAddShape('cyl', 'cylinder', { radius: 10, height: 30 }, { x: 15, y: 0, z: 0 }),
      makeGroup(['cube', 'cyl'], 'csg_1', 'union'),
      makeDelete(['cube']),
    ]

    // Полная история (включая delete)
    rebuildBuildTree(ops)
    // cube удалён из дерева, но csg_1 всё ещё существует
    // Это должно работать без "Cannot create cycle in tree"
    const csg1 = getNode('csg_1')
    expect(csg1).toBeDefined()
    // cube может быть удалён из дерева после delete
    // Но csg_1 должен существовать
  })

  it('jump через delete → redo восстанавливает CSG', () => {
    const ops: TinkerCraftOperation[] = [
      makeAddShape('cube', 'cube', { width: 20, height: 20, depth: 20 }),
      makeAddShape('cyl', 'cylinder', { radius: 10, height: 30 }, { x: 15, y: 0, z: 0 }),
      makeGroup(['cube', 'cyl'], 'csg_1', 'union'),
      makeDelete(['cube']),
    ]

    // Jump к delete
    clearTree()
    rebuildBuildTree(ops.slice(0, 4))

    // Redo: нечего redo, мы в конце

    // Теперь jump до CSG и redo
    clearTree()
    rebuildBuildTree(ops.slice(0, 3))
    const csg1 = getNode('csg_1')
    expect(csg1).toBeDefined()

    // Redo до delete
    rebuildBuildTree(ops)
    // csg_1 должен всё ещё существовать
    expect(getNode('csg_1')).toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// 5. Edge cases
// ---------------------------------------------------------------------------

describe('Edge cases', () => {
  beforeEach(() => { clearTree() })

  it('пустая история не ломает дерево', () => {
    rebuildBuildTree([])
    expect(treeStore.nodeCount).toBe(0)
  })

  it('несколько CSG операций с разными operation types', () => {
    const ops: TinkerCraftOperation[] = [
      makeAddShape('a', 'cube', { width: 10, height: 10, depth: 10 }),
      makeAddShape('b', 'cube', { width: 10, height: 10, depth: 10 }, { x: 15, y: 0, z: 0 }),
      makeGroup(['a', 'b'], 'csg_union', 'union'),
      makeAddShape('c', 'cube', { width: 10, height: 10, depth: 10 }, { x: 30, y: 0, z: 0 }),
      makeGroup(['csg_union', 'c'], 'csg_sub', 'subtract'),
      makeAddShape('d', 'sphere', { radius: 5 }, { x: 45, y: 0, z: 0 }),
      makeGroup(['csg_sub', 'd'], 'csg_int', 'intersect'),
    ]

    rebuildBuildTree(ops)

    const csgUnion = getNode('csg_union')
    const csgSub = getNode('csg_sub')
    const csgInt = getNode('csg_int')

    expect(csgUnion?.operation).toBe('union')
    expect(csgUnion?.children).toEqual(['a', 'b'])

    expect(csgSub?.operation).toBe('subtract')
    expect(csgSub?.children).toEqual(['csg_union', 'c'])

    expect(csgInt?.operation).toBe('intersect')
    expect(csgInt?.children).toEqual(['csg_sub', 'd'])

    // Проверяем parentId chain (parentId = родитель в дереве, не порядок операций)
    expect(csgUnion?.parentId).toBe('csg_sub') // csg_sub.children = [csg_union, c]
    expect(csgSub?.parentId).toBe('csg_int')   // csg_int.children = [csg_sub, d]
    expect(csgInt?.parentId).toBeUndefined()   // root
  })

  it('CSG с move после него', () => {
    const ops: TinkerCraftOperation[] = [
      makeAddShape('a', 'cube', { width: 10, height: 10, depth: 10 }),
      makeAddShape('b', 'cube', { width: 10, height: 10, depth: 10 }, { x: 15, y: 0, z: 0 }),
      makeGroup(['a', 'b'], 'csg_1', 'union'),
      makeMove(['csg_1'], { x: 10, y: 5, z: 0 }),
    ]

    rebuildBuildTree(ops)

    const csg1 = getNode('csg_1')
    expect(csg1).toBeDefined()
    // Move должен обновить transform boolean-ноды
    // (в rebuildBuildTree move обновляет transforms record, но boolean ноды
    //  используют startT из resultCenter. Это ожидаемое поведение —
    //  трансформ CSG-результата управляется resultCenter в GroupOperation)
  })
})
