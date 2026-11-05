import { describe, it, expect, beforeEach } from 'vitest'
import { clearTree, createPrimitiveNode, createBooleanNode, createBakedNode, getNode, setNode } from './history-tree'
import { getTreeView, findViewNode, formatParams, locateNode, isChildEditable, reasonFromRootFailure } from './tree-view'
import type { TransformNR } from './types'

const T = (x = 0): TransformNR => ({ x, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 })

describe('getTreeView', () => {
  beforeEach(() => clearTree())

  it('возвращает null для примитива и несуществующего узла', () => {
    createPrimitiveNode('a', 'cube', { width: 10, height: 10, depth: 10 }, T())
    expect(getTreeView('a')).toBeNull()
    expect(getTreeView('nope')).toBeNull()
  })

  it('CSG: два редактируемых ребёнка-примитива с params', () => {
    createPrimitiveNode('a', 'cube', { width: 20, height: 20, depth: 20 }, T())
    createPrimitiveNode('b', 'sphere', { radius: 12 }, T(5))
    createBooleanNode('r', 'subtract', 'a', 'b', T())

    const view = getTreeView('r')!
    expect(view.type).toBe('boolean')
    expect(view.operation).toBe('subtract')
    expect(view.children.map((c) => c.id)).toEqual(['a', 'b'])
    expect(view.children.every((c) => c.editable && c.notEditableReason === null)).toBe(true)
    expect(view.children[0].params).toEqual({ width: 20, height: 20, depth: 20 })
  })

  it('params в снимке — копия: мутация снимка не меняет узел дерева', () => {
    createPrimitiveNode('a', 'cube', { width: 20, height: 20, depth: 20 }, T())
    createPrimitiveNode('b', 'cube', { width: 5, height: 5, depth: 5 }, T(3))
    createBooleanNode('r', 'union', 'a', 'b', T())

    const view = getTreeView('r')!
    view.children[0].params!.width = 999
    expect(getNode('a')!.params!.width).toBe(20)
  })

  it('вложенный CSG раскрывается рекурсивно, внутренний узел не редактируется', () => {
    createPrimitiveNode('a', 'cube', { width: 10, height: 10, depth: 10 }, T())
    createPrimitiveNode('b', 'cube', { width: 10, height: 10, depth: 10 }, T(4))
    createBooleanNode('inner', 'union', 'a', 'b', T())
    createPrimitiveNode('c', 'sphere', { radius: 6 }, T(8))
    createBooleanNode('outer', 'intersect', 'inner', 'c', T())

    const view = getTreeView('outer')!
    const inner = view.children[0]
    expect(inner.type).toBe('boolean')
    expect(inner.editable).toBe(false)
    expect(inner.notEditableReason).toBe('boolean')
    expect(inner.children.map((c) => c.id)).toEqual(['a', 'b'])
    expect(findViewNode(view, 'b')?.shapeType).toBe('cube')
    expect(findViewNode(view, 'zzz')).toBeNull()
  })

  it('запечённый и зеркальный дети помечены нередактируемыми', () => {
    createPrimitiveNode('a', 'cube', { width: 10, height: 10, depth: 10 }, T())
    createBakedNode('m', new Float32Array(9), new Uint32Array(3), null, T(4))
    setNode('m', { ...getNode('m')!, shapeType: 'cube', mirroredPlane: 'YZ' })
    createBakedNode('imp', new Float32Array(9), new Uint32Array(3), null, T(8))
    createBooleanNode('r1', 'union', 'a', 'm', T())
    createBooleanNode('r2', 'union', 'r1', 'imp', T())

    const view = getTreeView('r2')!
    const r1 = view.children[0]
    const mirrored = r1.children[1]
    expect(mirrored.mirrored).toBe(true)
    expect(mirrored.notEditableReason).toBe('mirror')
    const baked = view.children[1]
    expect(baked.mirrored).toBe(false)
    expect(baked.notEditableReason).toBe('baked')
  })

  it('не зацикливается на повреждённом дереве (ребёнок ссылается на предка)', () => {
    createPrimitiveNode('a', 'cube', { width: 10, height: 10, depth: 10 }, T())
    createPrimitiveNode('b', 'cube', { width: 10, height: 10, depth: 10 }, T(4))
    createBooleanNode('r', 'union', 'a', 'b', T())
    setNode('r', { ...getNode('r')!, children: ['a', 'r'] })

    const view = getTreeView('r')!
    expect(view.children.map((c) => c.id)).toEqual(['a'])
  })
})

describe('formatParams', () => {
  it('куб: W/H/D', () => {
    expect(formatParams({ width: 20, height: 10, depth: 5 })).toBe('W20 H10 D5')
  })
  it('сфера, тор, округление, пусто', () => {
    expect(formatParams({ radius: 12.345 })).toBe('R12.35')
    expect(formatParams({ torusRadius: 10, tubeRadius: 3 })).toBe('R10 r3')
    expect(formatParams(undefined)).toBe('')
    expect(formatParams({})).toBe('')
  })
})

describe('locateNode', () => {
  beforeEach(() => clearTree())

  it('находит корень и раскрываемых предков вложенного узла', () => {
    createPrimitiveNode('a', 'cube', { width: 20, height: 20, depth: 20 }, T())
    createPrimitiveNode('b', 'sphere', { radius: 12 }, T(5))
    createBooleanNode('inner', 'union', 'a', 'b', T())
    createPrimitiveNode('c', 'cube', { width: 5, height: 5, depth: 5 }, T(9))
    createBooleanNode('outer', 'union', 'inner', 'c', T())

    expect(locateNode(['outer'], 'a')).toEqual({ rootId: 'outer', ancestors: ['outer', 'inner'] })
    expect(locateNode(['outer'], 'c')).toEqual({ rootId: 'outer', ancestors: ['outer'] })
  })

  it('null: узла нет, цель — сам корень, корень не CSG', () => {
    createPrimitiveNode('a', 'cube', { width: 20, height: 20, depth: 20 }, T())
    createPrimitiveNode('b', 'sphere', { radius: 12 }, T(5))
    createBooleanNode('r', 'union', 'a', 'b', T())
    expect(locateNode(['r'], 'zzz')).toBeNull()
    expect(locateNode(['r'], 'r')).toBeNull()
    expect(locateNode(['a'], 'b')).toBeNull()
  })
})

describe('isChildEditable — единая проверка (9.9)', () => {
  beforeEach(() => clearTree())

  it('обычный примитив → editable, причины нет', () => {
    createPrimitiveNode('a', 'cube', { width: 20, height: 20, depth: 20 }, T())
    expect(isChildEditable('a')).toEqual({ editable: true, reason: null })
  })

  it('boolean / baked / зеркальный baked / неизвестный узел → причины', () => {
    createPrimitiveNode('a', 'cube', { width: 20, height: 20, depth: 20 }, T())
    createPrimitiveNode('b', 'sphere', { radius: 5 }, T(3))
    createBooleanNode('r', 'union', 'a', 'b', T())
    createBakedNode('m', new Float32Array(9), new Uint32Array(3), null, T())
    setNode('m', { ...getNode('m')!, mirroredPlane: 'YZ' })
    createBakedNode('k', new Float32Array(9), new Uint32Array(3), null, T())
    expect(isChildEditable('r')).toEqual({ editable: false, reason: 'boolean' })
    expect(isChildEditable('m')).toEqual({ editable: false, reason: 'mirror' })
    expect(isChildEditable('k')).toEqual({ editable: false, reason: 'baked' })
    expect(isChildEditable('нет')).toEqual({ editable: false, reason: 'baked' })
  })

  it('getTreeView использует ту же проверку (поля совпадают)', () => {
    createPrimitiveNode('a', 'cube', { width: 20, height: 20, depth: 20 }, T())
    createBakedNode('k', new Float32Array(9), new Uint32Array(3), null, T())
    createBooleanNode('r', 'union', 'a', 'k', T())
    for (const c of getTreeView('r')!.children) {
      const e = isChildEditable(c.id)
      expect(c.editable).toBe(e.editable)
      expect(c.notEditableReason).toBe(e.reason)
    }
  })
})

describe('reasonFromRootFailure', () => {
  it('сопоставляет отказы проверки корня с причинами индикатора', () => {
    expect(reasonFromRootFailure('tree_mismatch')).toBe('nested_moved')
    expect(reasonFromRootFailure('no_origin')).toBe('no_origin')
    expect(reasonFromRootFailure(null)).toBeNull()
    expect(reasonFromRootFailure(undefined)).toBeNull()
    expect(reasonFromRootFailure('failed')).toBeNull()
  })
})
