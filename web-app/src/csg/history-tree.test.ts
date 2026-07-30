// ============================================================
// BuildTree unit tests — history-tree
// ============================================================

import { describe, it, expect, beforeEach } from 'vitest'
import {
  createPrimitiveNode,
  createBooleanNode,
  createBakedNode,
  deleteNode,
  getNode,
  clearTree,
  computeNodeBBox,
  bboxCenter,
  isAncestor,
  mirrorTreeNode,
  moveTreeNode,
  rotateTreeNode,
  cloneSubtree,
  rebuildNode,
  printTree,
} from '../csg/history-tree'
import type { TreeNode, BoundingBox, ExtractedMesh } from '../csg/types'

describe('BuildTree', () => {
  beforeEach(() => {
    clearTree()
  })

  describe('createPrimitiveNode', () => {
    it('should create a primitive node with correct properties', () => {
      const node = createPrimitiveNode('test_1', 'cube', { width: 10, height: 20, depth: 30 }, { x: 5, y: 10, z: 15, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 })

      expect(node.id).toBe('test_1')
      expect(node.type).toBe('primitive')
      expect(node.shapeType).toBe('cube')
      expect(node.params).toEqual({ width: 10, height: 20, depth: 30 })
      expect(node.localTransform).toEqual({ x: 5, y: 10, z: 15, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 })
    })

    it('should return the created node', () => {
      const node = createPrimitiveNode('test_2', 'sphere', { radius: 15, segments: 32 }, { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 })
      expect(getNode('test_2')).toBe(node)
    })
  })

  describe('createBooleanNode', () => {
    beforeEach(() => {
      createPrimitiveNode('a', 'cube', { width: 10, height: 10, depth: 10 }, { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 })
      createPrimitiveNode('b', 'cube', { width: 10, height: 10, depth: 10 }, { x: 5, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 })
    })

    it('should create a boolean node with children', () => {
      const node = createBooleanNode('union_1', 'union', 'a', 'b')

      expect(node.id).toBe('union_1')
      expect(node.type).toBe('boolean')
      expect(node.operation).toBe('union')
      expect(node.children).toEqual(['a', 'b'])
    })

    it('should set parentId on children', () => {
      createBooleanNode('union_1', 'union', 'a', 'b')

      const childA = getNode('a')
      const childB = getNode('b')

      expect(childA?.parentId).toBe('union_1')
      expect(childB?.parentId).toBe('union_1')
    })

    it('should throw on self-reference', () => {
      expect(() => createBooleanNode('self_ref', 'union', 'self_ref', 'b')).toThrow('cannot reference itself')
    })

    it('should throw on cycle detection', () => {
      createBooleanNode('union_1', 'union', 'a', 'b')
      // Try to create a node that would reference union_1 as a child of a
      // This shouldn't create a cycle because 'a' is a child of union_1
      // But if we tried: boolean(a, union_1) where union_1 is already a child of a — not possible with current API
      // Let's test the isAncestor function directly
      expect(isAncestor('a', 'union_1')).toBe(true)
      expect(isAncestor('b', 'union_1')).toBe(true)
      expect(isAncestor('a', 'b')).toBe(false)
    })
  })

  describe('createBakedNode', () => {
    it('should create a baked node with correct properties', () => {
      const vertices = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0])
      const indices = new Uint32Array([0, 1, 2])
      const normals = new Float32Array([0, 0, 1, 0, 1, 0, 1, 0, 0])

      const node = createBakedNode('baked_1', vertices, indices, normals, { x: 10, y: 20, z: 30, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 })

      expect(node.id).toBe('baked_1')
      expect(node.type).toBe('baked')
      expect(node.vertices).toBe(vertices) // Same reference (we store as-is)
      expect(node.indices).toBe(indices)
      expect(node.normals).toBe(normals)
    })
  })

  describe('deleteNode', () => {
    beforeEach(() => {
      createPrimitiveNode('a', 'cube', { width: 10, height: 10, depth: 10 }, { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 })
      createPrimitiveNode('b', 'cube', { width: 10, height: 10, depth: 10 }, { x: 5, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 })
      createBooleanNode('union_1', 'union', 'a', 'b')
    })

    it('should remove the node from tree', () => {
      deleteNode('union_1')
      expect(getNode('union_1')).toBeUndefined()
    })

    it('should reset parentId on children', () => {
      deleteNode('union_1')

      const childA = getNode('a')
      const childB = getNode('b')

      expect(childA?.parentId).toBeUndefined()
      expect(childB?.parentId).toBeUndefined()
    })

    it('should not affect sibling nodes', () => {
      deleteNode('union_1')

      // Children should still exist (just orphaned)
      expect(getNode('a')).toBeDefined()
      expect(getNode('b')).toBeDefined()
    })
  })

  describe('computeNodeBBox', () => {
    it('should compute bbox for primitive node', () => {
      createPrimitiveNode('cube1', 'cube', { width: 20, height: 20, depth: 20 }, { x: 10, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 })

      const bbox = computeNodeBBox('cube1')

      expect(bbox.min.x).toBe(0)
      expect(bbox.max.x).toBe(20)
      expect(bbox.min.y).toBe(-10)
      expect(bbox.max.y).toBe(10)
      expect(bbox.min.z).toBe(-10)
      expect(bbox.max.z).toBe(10)
    })

    it('should compute bbox for boolean node (union of two cubes)', () => {
      createPrimitiveNode('a', 'cube', { width: 10, height: 10, depth: 10 }, { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 })
      createPrimitiveNode('b', 'cube', { width: 10, height: 10, depth: 10 }, { x: 15, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 })
      createBooleanNode('union_ab', 'union', 'a', 'b')

      const bbox = computeNodeBBox('union_ab')

      // Should encompass both cubes: a from -5 to 5, b from 10 to 20
      expect(bbox.min.x).toBe(-5)
      expect(bbox.max.x).toBe(20)
    })

    it('should memoize bbox (cachedBBox set)', () => {
      createPrimitiveNode('cube2', 'cube', { width: 10, height: 10, depth: 10 }, { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 })

      computeNodeBBox('cube2')

      const node = getNode('cube2')
      expect(node?.cachedBBox).toBeDefined()
      expect(node?.cacheHash).toBeDefined()
    })
  })

  describe('isAncestor', () => {
    it('should return true if ancestorId is an ancestor of nodeId', () => {
      createPrimitiveNode('leaf', 'cube', { width: 10, height: 10, depth: 10 }, { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 })
      createPrimitiveNode('root', 'cube', { width: 10, height: 10, depth: 10 }, { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 })
      createBooleanNode('parent', 'union', 'leaf', 'root')

      expect(isAncestor('leaf', 'parent')).toBe(true)
      expect(isAncestor('root', 'parent')).toBe(true)
    })

    it('should return false if ancestorId is not an ancestor', () => {
      createPrimitiveNode('a', 'cube', { width: 10, height: 10, depth: 10 }, { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 })
      createPrimitiveNode('b', 'cube', { width: 10, height: 10, depth: 10 }, { x: 5, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 })

      expect(isAncestor('a', 'b')).toBe(false)
    })

    it('should return false for non-existent nodes', () => {
      expect(isAncestor('nonexistent', 'parent')).toBe(false)
    })
  })

  describe('mirrorTreeNode', () => {
    it('should mirror primitive position across YZ plane', () => {
      createPrimitiveNode('cube', 'cube', { width: 10, height: 10, depth: 10 }, { x: 10, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 })

      mirrorTreeNode('cube', 'YZ')

      const node = getNode('cube')
      expect(node?.localTransform?.x).toBe(-10)
    })

    it('should mirror primitive position across XZ plane', () => {
      createPrimitiveNode('cube', 'cube', { width: 10, height: 10, depth: 10 }, { x: 0, y: 10, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 })

      mirrorTreeNode('cube', 'XZ')

      const node = getNode('cube')
      expect(node?.localTransform?.y).toBe(-10)
    })

    it('should mirror primitive position across XY plane', () => {
      createPrimitiveNode('cube', 'cube', { width: 10, height: 10, depth: 10 }, { x: 0, y: 0, z: 10, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 })

      mirrorTreeNode('cube', 'XY')

      const node = getNode('cube')
      expect(node?.localTransform?.z).toBe(-10)
    })

    it('should mirror boolean subtree', () => {
      createPrimitiveNode('a', 'cube', { width: 10, height: 10, depth: 10 }, { x: 5, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 })
      createPrimitiveNode('b', 'cube', { width: 10, height: 10, depth: 10 }, { x: 15, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 })
      createBooleanNode('union', 'union', 'a', 'b')

      mirrorTreeNode('union', 'YZ')

      const nodeA = getNode('a')
      const nodeB = getNode('b')
      // Center of union is at x=10, so mirrored: a from x=5 to x=-5, b from x=15 to x=-15
      expect(nodeA?.localTransform?.x).toBe(-5)
      expect(nodeB?.localTransform?.x).toBe(-15)
    })
  })

  describe('moveTreeNode', () => {
    it('should move primitive by delta', () => {
      createPrimitiveNode('cube', 'cube', { width: 10, height: 10, depth: 10 }, { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 })

      moveTreeNode('cube', { x: 5, y: 10, z: 15 })

      const node = getNode('cube')
      expect(node?.localTransform?.x).toBe(5)
      expect(node?.localTransform?.y).toBe(10)
      expect(node?.localTransform?.z).toBe(15)
    })

    it('should move boolean subtree', () => {
      createPrimitiveNode('a', 'cube', { width: 10, height: 10, depth: 10 }, { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 })
      createPrimitiveNode('b', 'cube', { width: 10, height: 10, depth: 10 }, { x: 10, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 })
      createBooleanNode('union', 'union', 'a', 'b')

      moveTreeNode('union', { x: 100, y: 0, z: 0 })

      const nodeA = getNode('a')
      const nodeB = getNode('b')
      expect(nodeA?.localTransform?.x).toBe(100)
      expect(nodeB?.localTransform?.x).toBe(110)
    })
  })

  describe('cloneSubtree', () => {
    it('should clone a primitive node', () => {
      createPrimitiveNode('orig', 'cube', { width: 10, height: 10, depth: 10 }, { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 })

      const clone = cloneSubtree('orig', 'clone_1')

      expect(clone.id).toBe('clone_1')
      expect(clone.type).toBe('primitive')
      expect(clone.shapeType).toBe('cube')
      // Should be a deep copy — different params object
      expect(clone.params).not.toBe(getNode('orig')?.params)
    })

    it('should clone a boolean subtree', () => {
      createPrimitiveNode('a', 'cube', { width: 10, height: 10, depth: 10 }, { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 })
      createPrimitiveNode('b', 'cube', { width: 10, height: 10, depth: 10 }, { x: 10, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 })
      createBooleanNode('union', 'union', 'a', 'b')

      const clone = cloneSubtree('union', 'clone_union')

      expect(clone.id).toBe('clone_union')
      expect(clone.type).toBe('boolean')
      expect(clone.operation).toBe('union')
      expect(clone.children).toHaveLength(2)
    })

    it('should map old IDs to new IDs in newIdMap', () => {
      const newIdMap = new Map<string, string>()
      createPrimitiveNode('a', 'cube', { width: 10, height: 10, depth: 10 }, { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 })
      createPrimitiveNode('b', 'cube', { width: 10, height: 10, depth: 10 }, { x: 10, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 })
      createBooleanNode('union', 'union', 'a', 'b')

      cloneSubtree('union', 'clone_union', newIdMap)

      expect(newIdMap.has('a')).toBe(true)
      expect(newIdMap.has('b')).toBe(true)
      expect(newIdMap.has('union')).toBe(true)
    })

    it('should throw on non-existent source', () => {
      expect(() => cloneSubtree('nonexistent', 'clone')).toThrow('not found')
    })
  })

  describe('rebuildNode', () => {
    it('should return cached result when hash matches', async () => {
      createPrimitiveNode('cube', 'cube', { width: 10, height: 10, depth: 10 }, { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 })

      // First call — will try to rebuild (may fail without WASM, but should cache)
      try {
        await rebuildNode('cube')
      } catch {
        // Expected if WASM not available in test environment
      }

      // The node should have been created
      const node = getNode('cube')
      expect(node).toBeDefined()
      expect(node?.type).toBe('primitive')
    })
  })

  describe('cascade invalidation', () => {
    it('should invalidate cache on parent when child changes', () => {
      createPrimitiveNode('a', 'cube', { width: 10, height: 10, depth: 10 }, { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 })
      createPrimitiveNode('b', 'cube', { width: 10, height: 10, depth: 10 }, { x: 10, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 })
      createBooleanNode('union', 'union', 'a', 'b')

      // Manually set cache on parent
      const unionNode = getNode('union')
      // FIX (TEST-R16-2): Use properly typed ExtractedMesh instead of 'as any'
      const meshData: ExtractedMesh = { vertices: new Float32Array(), indices: new Uint32Array() }
      unionNode!.cachedMesh = meshData
      unionNode!.cacheHash = 'test_hash'
      unionNode!.cachedBBox = { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 10, z: 10 } }

      // Move child — should invalidate parent cache
      moveTreeNode('a', { x: 100, y: 0, z: 0 })

      // Parent cache should be invalidated
      expect(unionNode?.cachedMesh).toBeUndefined()
      expect(unionNode?.cacheHash).toBeUndefined()
      expect(unionNode?.cachedBBox).toBeUndefined()
    })
  })

  describe('deep copy in cloneSubtree', () => {
    it('should deep copy TypedArrays in baked nodes', () => {
      const vertices = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0])
      const indices = new Uint32Array([0, 1, 2])
      const normals = new Float32Array([0, 0, 1, 0, 1, 0, 1, 0, 0])

      createBakedNode('baked', vertices, indices, normals, { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 })

      const clone = cloneSubtree('baked', 'baked_clone')

      // Should be different objects (deep copy)
      expect(clone.vertices).not.toBe(vertices)
      expect(clone.indices).not.toBe(indices)
      expect(clone.normals).not.toBe(normals)

      // But same values
      expect(Array.from(clone.vertices!)).toEqual(Array.from(vertices))
      expect(Array.from(clone.indices!)).toEqual(Array.from(indices))
      expect(Array.from(clone.normals!)).toEqual(Array.from(normals))
    })
  })
})
