// ============================================================
// tree-stale.test.ts — FIX: загрузка проекта с теми же id (дерево не утекло)
// ============================================================
// Раньше при загрузке другого проекта дерево не чистилось, а add_shape
// обновлял только params: узел оставался кубом (shapeType), хотя в новом
// документе — конус. Child-View показывал куб, CSG был под замком.
// Теперь shapeType перезаписывается, а загрузки чистят дерево.

import { describe, it, expect, beforeEach } from 'vitest'
import { createBakedNode, createPrimitiveNode, clearTree, getNode, treeStore } from '../csg/history-tree'
import { rebuildBuildTree } from '../store/rebuild'
import { getTreeView } from '../csg/tree-view'
import type { TinkerCraftOperation } from '../csg/types'

const T = { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 }

beforeEach(() => { clearTree() })

describe('STALE-TREE-TYPE — загрузка проекта поверх прошлого дерева', () => {
  it('add_shape перезаписывает shapeType: куб в дереве → конус/труба в новом проекте', () => {
    // Прошлый документ: obj_1 — куб, obj_2 — сфера
    createPrimitiveNode('obj_1', 'cube', { width: 20, height: 20, depth: 20 }, T)
    createPrimitiveNode('obj_2', 'sphere', { radius: 12 }, T)

    // Новый документ с теми же id: конус + труба → union
    const ops: TinkerCraftOperation[] = [
      { type: 'add_shape', id: 'obj_1', shapeType: 'cone', params: { radius: 10, height: 24 }, color: '#89b4fa', transform: T },
      { type: 'add_shape', id: 'obj_2', shapeType: 'tube', params: { radius: 12, innerRadius: 8, height: 20 }, color: '#a6e3a1', transform: T },
      { type: 'group', operation: 'union', ids: ['obj_1', 'obj_2'], resultId: 'csg_3', shapeType: 'csg', resultCenter: { x: 0, y: 0, z: 0 }, treeOperation: 'union' } as unknown as TinkerCraftOperation,
    ]
    rebuildBuildTree(ops)

    const n1 = getNode('obj_1')!
    const n2 = getNode('obj_2')!
    expect(n1.type).toBe('primitive')
    expect(n1.shapeType).toBe('cone')
    expect(n1.params).toMatchObject({ radius: 10, height: 24 })
    expect(n2.shapeType).toBe('tube')
    expect(n2.params).toMatchObject({ radius: 12, innerRadius: 8 })

    const view = getTreeView('csg_3')!
    expect(view.children?.map((c) => c.shapeType)).toEqual(['cone', 'tube'])
  })

  it('baked-узел с тем же id заменяется примитивом нового проекта', () => {
    createBakedNode('obj_1', new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), new Uint32Array([0, 1, 2]), null, T)
    const ops: TinkerCraftOperation[] = [
      { type: 'add_shape', id: 'obj_1', shapeType: 'cone', params: { radius: 10, height: 24 }, color: '#89b4fa', transform: T },
    ]
    rebuildBuildTree(ops)
    expect(getNode('obj_1')?.type).toBe('primitive')
    expect(getNode('obj_1')?.shapeType).toBe('cone')
  })

  it('чистое дерево даёт те же типы (загрузки чистят дерево)', () => {
    clearTree()
    const ops: TinkerCraftOperation[] = [
      { type: 'add_shape', id: 'obj_1', shapeType: 'cone', params: { radius: 10, height: 24 }, color: '#89b4fa', transform: T },
      { type: 'add_shape', id: 'obj_2', shapeType: 'tube', params: { radius: 12, innerRadius: 8, height: 20 }, color: '#a6e3a1', transform: T },
      { type: 'group', operation: 'union', ids: ['obj_1', 'obj_2'], resultId: 'csg_3', shapeType: 'csg', resultCenter: { x: 0, y: 0, z: 0 }, treeOperation: 'union' } as unknown as TinkerCraftOperation,
    ]
    rebuildBuildTree(ops)
    expect(treeStore.getNode('obj_1')?.shapeType).toBe('cone')
    expect(treeStore.getNode('obj_2')?.shapeType).toBe('tube')
  })
})
