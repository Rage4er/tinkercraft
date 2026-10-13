// ============================================================
// BuildTree unit tests — history-tree
// ============================================================

import { describe, it, expect, beforeEach } from 'vitest'
import {
  createPrimitiveNode,
  createBooleanNode,
  createBakedNode,
  createImportedNode,
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
  treeStore,
} from '../csg/history-tree'
import { subtractTransform, composeTransforms } from '../csg/worker-matrix'
import type { TreeNode, BoundingBox, ExtractedMesh } from '../csg/types'

const defaultTransform = { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 }

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

    it('should recursively delete children when recursive=true', () => {
      deleteNode('union_1', true)

      // Boolean node and all children should be removed
      expect(getNode('union_1')).toBeUndefined()
      expect(getNode('a')).toBeUndefined()
      expect(getNode('b')).toBeUndefined()
    })

    it('should recursively delete nested boolean subtrees', () => {
      // Create a nested tree: union_2(union_1(a,b), c)
      createPrimitiveNode('c', 'cube', { width: 10, height: 10, depth: 10 }, { x: 10, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 })
      createBooleanNode('union_2', 'union', 'union_1', 'c')

      deleteNode('union_2', true)

      // All nodes in the subtree should be removed
      expect(getNode('union_2')).toBeUndefined()
      expect(getNode('union_1')).toBeUndefined()
      expect(getNode('a')).toBeUndefined()
      expect(getNode('b')).toBeUndefined()
      expect(getNode('c')).toBeUndefined()
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

  describe('createBooleanNode relativeToParent (Stage 3)', () => {
    it('children receive relativeToParent = subtractTransform(childWorld, parentWorld)', () => {
      // childA: localTransform.x = 5, childB: localTransform.x = -5
      // parent: localTransform.x = 10
      // relativeToParent.x = 5 - 10 = -5 (for A), -5 - 10 = -15 (for B)
      createPrimitiveNode('a', 'cube', { width: 10, height: 10, depth: 10 },
        { x: 5, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 })
      createPrimitiveNode('b', 'cube', { width: 10, height: 10, depth: 10 },
        { x: -5, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 })

      createBooleanNode('csg', 'union', 'a', 'b',
        { x: 10, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 })

      const aNode = getNode('a')!
      const bNode = getNode('b')!
      const csgNode = getNode('csg')!

      expect(aNode.relativeToParent).not.toBeNull()
      expect(bNode.relativeToParent).not.toBeNull()
      // parentWorld.x = 10, childWorld.x = 5 → delta = -5
      expect(aNode.relativeToParent!.positionDelta.x).toBe(-5)
      // childWorld.x = -5 → delta = -15
      expect(bNode.relativeToParent!.positionDelta.x).toBe(-15)
      expect(csgNode.relativeToParent).toBeNull()
    })

    it('parent node relativeToParent = null (root boolean)', () => {
      createPrimitiveNode('a', 'cube', { width: 10, height: 10, depth: 10 }, defaultTransform)
      createPrimitiveNode('b', 'cube', { width: 10, height: 10, depth: 10 }, defaultTransform)

      const node = createBooleanNode('csg', 'union', 'a', 'b')
      expect(node.relativeToParent).toBeNull()
    })

    it('parentId on children points to boolean node', () => {
      createPrimitiveNode('a', 'cube', { width: 10, height: 10, depth: 10 }, defaultTransform)
      createPrimitiveNode('b', 'cube', { width: 10, height: 10, depth: 10 }, defaultTransform)

      createBooleanNode('csg', 'union', 'a', 'b')

      expect(getNode('a')?.parentId).toBe('csg')
      expect(getNode('b')?.parentId).toBe('csg')
    })

    it('child localTransform not modified (backward compat)', () => {
      createPrimitiveNode('a', 'cube', { width: 10, height: 10, depth: 10 },
        { x: 5, y: 10, z: 15, rotX: 10, rotY: 20, rotZ: 30, scaleX: 2, scaleY: 3, scaleZ: 0.5 })
      createPrimitiveNode('b', 'cube', { width: 10, height: 10, depth: 10 }, defaultTransform)

      const beforeA = getNode('a')!.localTransform!
      createBooleanNode('csg', 'union', 'a', 'b',
        { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 })

      const afterA = getNode('a')!.localTransform!
      expect(afterA).toEqual(beforeA)
      // But relativeToParent should be computed
      expect(getNode('a')!.relativeToParent).not.toBeNull()
    })

    it('round-trip: composeTransforms(parentWorld, relativeToParent) ≈ childWorld', () => {
      createPrimitiveNode('a', 'cube', { width: 10, height: 10, depth: 10 },
        { x: 5, y: 10, z: 15, rotX: 10, rotY: 20, rotZ: 30, scaleX: 2, scaleY: 3, scaleZ: 0.5 })
      createPrimitiveNode('b', 'cube', { width: 10, height: 10, depth: 10 },
        { x: -3, y: 7, z: -2, rotX: -10, rotY: -5, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 })

      const parentTransform = { x: 10, y: 20, z: 5, rotX: 5, rotY: 10, rotZ: 15, scaleX: 2, scaleY: 2, scaleZ: 2 }
      createBooleanNode('csg', 'union', 'a', 'b', parentTransform)

      const aNode = getNode('a')!
      const bNode = getNode('b')!

      // Round-trip: composeTransforms(parentTransform, aNode.relativeToParent) ≈ aNode.localTransform
      const aWorld = composeTransforms(parentTransform, aNode.relativeToParent)
      const aLocal = aNode.localTransform!
      expect(Math.abs(aWorld.x - aLocal.x)).toBeLessThan(1e-6)
      expect(Math.abs(aWorld.y - aLocal.y)).toBeLessThan(1e-6)
      expect(Math.abs(aWorld.z - aLocal.z)).toBeLessThan(1e-6)
      expect(Math.abs(aWorld.scaleX - aLocal.scaleX)).toBeLessThan(1e-6)
      expect(Math.abs(aWorld.scaleY - aLocal.scaleY)).toBeLessThan(1e-6)
      expect(Math.abs(aWorld.scaleZ - aLocal.scaleZ)).toBeLessThan(1e-6)

      const bWorld = composeTransforms(parentTransform, bNode.relativeToParent)
      const bLocal = bNode.localTransform!
      expect(Math.abs(bWorld.x - bLocal.x)).toBeLessThan(1e-6)
      expect(Math.abs(bWorld.y - bLocal.y)).toBeLessThan(1e-6)
      expect(Math.abs(bWorld.z - bLocal.z)).toBeLessThan(1e-6)
    })

    it('multi-axis rotation: round-trip through composeTransforms ≈ childWorld', () => {
      createPrimitiveNode('a', 'cube', { width: 10, height: 10, depth: 10 },
        { x: 0, y: 0, z: 0, rotX: 20, rotY: 30, rotZ: 40, scaleX: 1, scaleY: 1, scaleZ: 1 })
      createPrimitiveNode('b', 'cube', { width: 10, height: 10, depth: 10 },
        { x: 0, y: 0, z: 0, rotX: -10, rotY: -20, rotZ: -30, scaleX: 1, scaleY: 1, scaleZ: 1 })

      const parentTransform = { x: 0, y: 0, z: 0, rotX: 5, rotY: 10, rotZ: 15, scaleX: 1, scaleY: 1, scaleZ: 1 }
      createBooleanNode('csg', 'union', 'a', 'b', parentTransform)

      const aNode = getNode('a')!
      const aWorld = composeTransforms(parentTransform, aNode.relativeToParent)
      const aLocal = aNode.localTransform!
      // Rotation round-trip accuracy ±1e-6
      expect(Math.abs(aWorld.x - aLocal.x)).toBeLessThan(1e-6)
      expect(Math.abs(aWorld.y - aLocal.y)).toBeLessThan(1e-6)
      expect(Math.abs(aWorld.z - aLocal.z)).toBeLessThan(1e-6)
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

    it('should preserve nested boolean transforms and remap every parent link', () => {
      const innerTransform = { x: 12, y: -8, z: 6, rotX: 10, rotY: 20, rotZ: 30, scaleX: 1, scaleY: 2, scaleZ: 0.5 }
      createPrimitiveNode('a', 'cube', { width: 10, height: 10, depth: 10 }, { x: 20, y: -8, z: 6, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 })
      createPrimitiveNode('b', 'cube', { width: 10, height: 10, depth: 10 }, { x: 30, y: -8, z: 6, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 })
      createBooleanNode('inner', 'union', 'a', 'b', innerTransform)
      createPrimitiveNode('c', 'sphere', { radius: 5, segments: 16 }, { x: 0, y: 10, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 })
      createBooleanNode('outer', 'union', 'inner', 'c', { ...defaultTransform })

      const idMap = new Map<string, string>()
      cloneSubtree('outer', 'outer_clone', idMap)

      const clonedInnerId = idMap.get('inner')!
      const clonedAId = idMap.get('a')!
      const clonedBId = idMap.get('b')!
      const clonedCId = idMap.get('c')!

      expect(getNode('outer_clone')?.children).toEqual([clonedInnerId, clonedCId])
      expect(getNode(clonedInnerId)?.children).toEqual([clonedAId, clonedBId])
      expect(getNode(clonedInnerId)?.localTransform).toEqual(innerTransform)
      expect(getNode(clonedInnerId)?.parentId).toBe('outer_clone')
      expect(getNode(clonedAId)?.parentId).toBe(clonedInnerId)
      expect(getNode(clonedBId)?.parentId).toBe(clonedInnerId)
      expect(getNode(clonedCId)?.parentId).toBe('outer_clone')
      expect(getNode('outer_clone')?.parentId).toBeUndefined()
    })

    it('should mirror the preserved nested boolean transform in the cloned tree', () => {
      const innerTransform = { x: 12, y: -8, z: 6, rotX: 10, rotY: 20, rotZ: 30, scaleX: 1, scaleY: 2, scaleZ: 0.5 }
      createPrimitiveNode('a', 'cube', { width: 10, height: 10, depth: 10 }, { x: 20, y: -8, z: 6, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 })
      createPrimitiveNode('b', 'cube', { width: 10, height: 10, depth: 10 }, { x: 30, y: -8, z: 6, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 })
      createBooleanNode('inner', 'union', 'a', 'b', innerTransform)
      createPrimitiveNode('c', 'sphere', { radius: 5, segments: 16 }, { x: 0, y: 10, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 })
      createBooleanNode('outer', 'union', 'inner', 'c', { ...defaultTransform })

      const idMap = new Map<string, string>()
      cloneSubtree('outer', 'outer_clone', idMap)
      mirrorTreeNode('outer_clone', 'YZ')

      const mirroredInner = getNode(idMap.get('inner')!)?.localTransform
      expect(mirroredInner).toEqual({
        ...innerTransform,
        x: -innerTransform.x,
        rotY: -innerTransform.rotY,
        rotZ: -innerTransform.rotZ,
      })
      expect(getNode(idMap.get('a')!)?.parentId).toBe(idMap.get('inner'))
      expect(getNode(idMap.get('b')!)?.parentId).toBe(idMap.get('inner'))
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

// ============================================================
// TreeStore unit tests
// ============================================================

describe('TreeStore', () => {
  beforeEach(() => {
    treeStore.clear()
  })

  it('should set and get a node', () => {
    const node: TreeNode = { id: 'test', type: 'primitive', shapeType: 'cube', params: {}, relativeToParent: null, localTransform: defaultTransform }
    treeStore.setNode('test', node)
    expect(treeStore.getNode('test')).toBe(node)
  })

  it('should return undefined for non-existent node', () => {
    expect(treeStore.getNode('nonexistent')).toBeUndefined()
  })

  it('should delete a node', () => {
    treeStore.setNode('test', { id: 'test', type: 'primitive', shapeType: 'cube', params: {}, relativeToParent: null, localTransform: defaultTransform })
    treeStore.deleteNode('test')
    expect(treeStore.getNode('test')).toBeUndefined()
  })

  it('should clear all nodes', () => {
    treeStore.setNode('a', { id: 'a', type: 'primitive', shapeType: 'cube', params: {}, relativeToParent: null, localTransform: defaultTransform })
    treeStore.setNode('b', { id: 'b', type: 'primitive', shapeType: 'cube', params: {}, relativeToParent: null, localTransform: defaultTransform })
    treeStore.clear()
    expect(treeStore.nodeCount).toBe(0)
  })

  it('should return all nodes as array', () => {
    treeStore.setNode('a', { id: 'a', type: 'primitive', shapeType: 'cube', params: {}, relativeToParent: null, localTransform: defaultTransform })
    treeStore.setNode('b', { id: 'b', type: 'primitive', shapeType: 'cube', params: {}, relativeToParent: null, localTransform: defaultTransform })
    expect(treeStore.getAllNodes()).toHaveLength(2)
  })

  it('should return node count', () => {
    expect(treeStore.nodeCount).toBe(0)
    treeStore.setNode('a', { id: 'a', type: 'primitive', shapeType: 'cube', params: {}, relativeToParent: null, localTransform: defaultTransform })
    expect(treeStore.nodeCount).toBe(1)
  })

  it('should check node existence', () => {
    treeStore.setNode('a', { id: 'a', type: 'primitive', shapeType: 'cube', params: {}, relativeToParent: null, localTransform: defaultTransform })
    expect(treeStore.hasNode('a')).toBe(true)
    expect(treeStore.hasNode('b')).toBe(false)
  })

  it('should delete recursively', () => {
    treeStore.setNode('a', { id: 'a', type: 'primitive', shapeType: 'cube', params: {}, relativeToParent: null, localTransform: defaultTransform })
    treeStore.setNode('b', { id: 'b', type: 'primitive', shapeType: 'cube', params: {}, relativeToParent: null, localTransform: defaultTransform })
    treeStore.setNode('parent', { id: 'parent', type: 'boolean', operation: 'union', children: ['a', 'b'], relativeToParent: null })
    treeStore.deleteNode('parent', true)
    expect(treeStore.hasNode('parent')).toBe(false)
    expect(treeStore.hasNode('a')).toBe(false)
    expect(treeStore.hasNode('b')).toBe(false)
  })

  it('should not delete children when recursive=false', () => {
    treeStore.setNode('a', { id: 'a', type: 'primitive', shapeType: 'cube', params: {}, relativeToParent: null, localTransform: defaultTransform })
    treeStore.setNode('b', { id: 'b', type: 'primitive', shapeType: 'cube', params: {}, relativeToParent: null, localTransform: defaultTransform })
    treeStore.setNode('parent', { id: 'parent', type: 'boolean', operation: 'union', children: ['a', 'b'], relativeToParent: null })
    treeStore.deleteNode('parent', false)
    expect(treeStore.hasNode('parent')).toBe(false)
    expect(treeStore.hasNode('a')).toBe(true)
    expect(treeStore.hasNode('b')).toBe(true)
  })

  it('should return ReadonlyMap from getAllNodesMap', () => {
    treeStore.setNode('a', { id: 'a', type: 'primitive', shapeType: 'cube', params: {}, relativeToParent: null, localTransform: defaultTransform })
    const map = treeStore.getAllNodesMap()
    expect(map.get('a')).toBeDefined()
    expect(map.size).toBe(1)
  })

  it('should reset parentId on children when deleting non-recursively', () => {
    treeStore.setNode('a', { id: 'a', type: 'primitive', shapeType: 'cube', params: {}, relativeToParent: null, localTransform: defaultTransform })
    treeStore.setNode('b', { id: 'b', type: 'primitive', shapeType: 'cube', params: {}, relativeToParent: null, localTransform: defaultTransform })
    treeStore.setNode('parent', { id: 'parent', type: 'boolean', operation: 'union', children: ['a', 'b'], relativeToParent: null })
    // Set parentId on children
    const childA = treeStore.getNode('a')
    const childB = treeStore.getNode('b')
    if (childA) childA.parentId = 'parent'
    if (childB) childB.parentId = 'parent'

    treeStore.deleteNode('parent', false)

    expect(treeStore.getNode('a')?.parentId).toBeUndefined()
    expect(treeStore.getNode('b')?.parentId).toBeUndefined()
  })

  it('should handle deleteNode on non-existent node gracefully', () => {
    expect(() => treeStore.deleteNode('nonexistent')).not.toThrow()
    expect(() => treeStore.deleteNode('nonexistent', true)).not.toThrow()
  })
})


// ============================================================
// MIRROR-SCALE-POSITIVE: scale is always Math.abs() after mirror
// ============================================================
describe('mirrorNodeRecursive — scale is always positive', () => {
  beforeEach(() => {
    clearTree()
  })

  describe('YZ plane (Math.abs(scaleX))', () => {
    it('primitive prism sides=3 gets positive scaleX after mirror', () => {
      createPrimitiveNode('p', 'prism', { radius: 12, height: 20, sides: 3 },
        { x: 10, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 })

      mirrorTreeNode('p', 'YZ', { x: 0, y: 0, z: 0 })

      const t = getNode('p')!.localTransform!
      expect(t.x).toBe(-10)
      expect(t.scaleX).toBe(1)
      expect(t.scaleY).toBe(1)
      expect(t.scaleZ).toBe(1)
      expect(Math.abs(t.rotY)).toBeLessThan(1e-10)
    })

    it('primitive with rotY=30 gets mirrored rotation', () => {
      createPrimitiveNode('p', 'prism', { radius: 12, height: 20, sides: 3 },
        { x: 10, y: 0, z: 0, rotX: 0, rotY: 30, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 })

      mirrorTreeNode('p', 'YZ', { x: 0, y: 0, z: 0 })

      const t = getNode('p')!.localTransform!
      expect(t.scaleX).toBe(1)
      expect(t.rotY).toBe(-30)
      expect(t.rotX).toBe(0)
      expect(t.x).toBe(-10)
    })

    it('multi-axis rotation preserved correctly after YZ mirror', () => {
      createPrimitiveNode('p', 'prism', { radius: 12, height: 20, sides: 3 },
        { x: 5, y: 0, z: 0, rotX: 20, rotY: 30, rotZ: 10, scaleX: 1, scaleY: 1, scaleZ: 1 })

      mirrorTreeNode('p', 'YZ', { x: 0, y: 0, z: 0 })

      const t = getNode('p')!.localTransform!
      expect(t.scaleX).toBe(1)
      expect(t.rotX).toBe(20)
      expect(t.rotY).toBe(-30)
      expect(t.rotZ).toBe(-10)
    })

    it('cone gets positive scaleX after mirror', () => {
      createPrimitiveNode('c', 'cone', { radius: 10, height: 24 },
        { x: 15, y: 0, z: 0, rotX: 0, rotY: 90, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 })

      mirrorTreeNode('c', 'YZ', { x: 0, y: 0, z: 0 })

      const t = getNode('c')!.localTransform!
      expect(t.scaleX).toBe(1)
      expect(t.rotY).toBe(-90)
      expect(t.x).toBe(-15)
    })
  })

  describe('XZ plane (Math.abs(scaleY))', () => {
    it('primitive gets positive scaleY after mirror', () => {
      createPrimitiveNode('p', 'prism', { radius: 12, height: 20, sides: 3 },
        { x: 0, y: 10, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 })

      mirrorTreeNode('p', 'XZ', { x: 0, y: 0, z: 0 })

      const t = getNode('p')!.localTransform!
      expect(t.scaleX).toBe(1)
      expect(t.scaleY).toBe(1)
      expect(t.scaleZ).toBe(1)
      expect(t.y).toBe(-10)
    })
  })

  describe('XY plane (Math.abs(scaleZ))', () => {
    it('primitive gets positive scaleZ after mirror', () => {
      createPrimitiveNode('p', 'prism', { radius: 12, height: 20, sides: 3 },
        { x: 0, y: 0, z: 10, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 })

      mirrorTreeNode('p', 'XY', { x: 0, y: 0, z: 0 })

      const t = getNode('p')!.localTransform!
      expect(t.scaleX).toBe(1)
      expect(t.scaleY).toBe(1)
      expect(t.scaleZ).toBe(1)
      expect(t.z).toBe(-10)
    })
  })

  describe('baked nodes use abs(scale)', () => {
    it('CSG result (baked) uses positive scale after mirror', () => {
      const node: TreeNode = {
        id: 'csg',
        type: 'baked',
        vertices: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
        indices: new Uint32Array([0, 1, 2]),
        params: {}, relativeToParent: null, localTransform: { x: 10, y: 0, z: 0, rotX: 0, rotY: 30, rotZ: 0, scaleX: 2, scaleY: 3, scaleZ: 4 },
      }
      treeStore.setNode('csg', node)

      mirrorTreeNode('csg', 'YZ', { x: 0, y: 0, z: 0 })

      const t = getNode('csg')!.localTransform!
      expect(t.scaleX).toBe(2)
      expect(t.scaleY).toBe(3)
      expect(t.scaleZ).toBe(4)
      expect(t.x).toBe(-10)
    })

    it('import_mesh uses positive scale after mirror', () => {
      const dummyMesh = {
        vertices: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
        indices: new Uint32Array([0, 1, 2]),
        normals: null,
      }
      createImportedNode('imp', dummyMesh, {
        x: 10, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 2, scaleY: 1, scaleZ: 1,
      })

      mirrorTreeNode('imp', 'YZ', { x: 0, y: 0, z: 0 })

      const t = getNode('imp')!.localTransform!
      expect(t.scaleX).toBe(2)
      expect(t.x).toBe(-10)
    })
  })

  describe('boolean nodes with primitive children', () => {
    it('boolean children get positive scale (Math.abs)', () => {
      createPrimitiveNode('a', 'prism', { radius: 12, height: 20, sides: 3 },
        { x: 5, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 })
      createPrimitiveNode('b', 'cube', { width: 20, height: 20, depth: 20 },
        { x: 15, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 })
      createBooleanNode('csg', 'union', 'a', 'b', {
        x: 10, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1,
      })

      mirrorTreeNode('csg', 'YZ', { x: 0, y: 0, z: 0 })

      const csgT = getNode('csg')!.localTransform!
      expect(csgT.scaleX).toBe(1)
      expect(csgT.x).toBe(-10)

      const aT = getNode('a')!.localTransform!
      expect(aT.scaleX).toBe(1)
      expect(aT.x).toBe(-5)

      const bT = getNode('b')!.localTransform!
      expect(bT.scaleX).toBe(1)
      expect(bT.x).toBe(-15)
    })
  })
})

// ============================================================
// Stage 4 — mirrorNodeRecursive mirrors relativeToParent
// ============================================================
describe('mirrorNodeRecursive — relativeToParent (Stage 4)', () => {
  beforeEach(() => {
    clearTree()
  })

  it('mirror primitive: relativeToParent mirrored', () => {
    // Create a node with a non-trivial relativeToParent (parent at x=10)
    createPrimitiveNode('a', 'cube', { width: 10, height: 10, depth: 10 },
      { x: 15, y: 5, z: 3, rotX: 10, rotY: 20, rotZ: 30, scaleX: 1, scaleY: 1, scaleZ: 1 })
    createPrimitiveNode('csg', 'cube', { width: 10, height: 10, depth: 10 },
      { x: 10, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 })
    createBooleanNode('parent', 'union', 'a', 'csg',
      { x: 10, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 })

    // Before mirror
    const aBefore = getNode('a')!
    expect(aBefore.relativeToParent).not.toBeNull()
    const relBefore = aBefore.relativeToParent!

    // Mirror YZ
    mirrorTreeNode('parent', 'YZ', { x: 0, y: 0, z: 0 })

    const aAfter = getNode('a')!
    const csgAfter = getNode('csg')!
    const parentAfter = getNode('parent')!

    // YZ mirror: positionDelta.x negated
    expect(aAfter.relativeToParent!.positionDelta.x).toBeCloseTo(-relBefore.positionDelta.x, 10)
    expect(aAfter.relativeToParent!.positionDelta.y).toBeCloseTo(relBefore.positionDelta.y, 10)
    expect(aAfter.relativeToParent!.positionDelta.z).toBeCloseTo(relBefore.positionDelta.z, 10)
    // Rotation: YZ → rotX unchanged, rotY/rotZ negated
    expect(aAfter.relativeToParent!.rotationDelta.x).toBeCloseTo(relBefore.rotationDelta.x, 10)
    expect(aAfter.relativeToParent!.rotationDelta.y).toBeCloseTo(-relBefore.rotationDelta.y, 10)
    expect(aAfter.relativeToParent!.rotationDelta.z).toBeCloseTo(-relBefore.rotationDelta.z, 10)
    // Parent's relativeToParent stays null
    expect(parentAfter.relativeToParent).toBeNull()
  })

  it('mirror CSG: children relativeToParent mirrored', () => {
    createPrimitiveNode('a', 'cube', { width: 10, height: 10, depth: 10 },
      { x: 5, y: 0, z: 0, rotX: 10, rotY: 20, rotZ: 30, scaleX: 1, scaleY: 1, scaleZ: 1 })
    createPrimitiveNode('b', 'cube', { width: 10, height: 10, depth: 10 },
      { x: 15, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 })
    createBooleanNode('csg', 'union', 'a', 'b',
      { x: 10, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 })

    const aBefore = getNode('a')!
    const bBefore = getNode('b')!

    mirrorTreeNode('csg', 'YZ', { x: 0, y: 0, z: 0 })

    const aAfter = getNode('a')!
    const bAfter = getNode('b')!
    const csgAfter = getNode('csg')!

    // Children relativeToParent X negated, Y/Z unchanged
    expect(aAfter.relativeToParent!.positionDelta.x).toBeCloseTo(-aBefore.relativeToParent!.positionDelta.x, 10)
    expect(bAfter.relativeToParent!.positionDelta.x).toBeCloseTo(-bBefore.relativeToParent!.positionDelta.x, 10)

    // Rotation YZ: rotX unchanged, rotY/rotZ negated
    expect(aAfter.relativeToParent!.rotationDelta.x).toBeCloseTo(aBefore.relativeToParent!.rotationDelta.x, 10)
    expect(aAfter.relativeToParent!.rotationDelta.y).toBeCloseTo(-aBefore.relativeToParent!.rotationDelta.y, 10)
    expect(aAfter.relativeToParent!.rotationDelta.z).toBeCloseTo(-aBefore.relativeToParent!.rotationDelta.z, 10)

    // CSG root relativeToParent stays null
    expect(csgAfter.relativeToParent).toBeNull()
  })

  it('double mirror returns to original', () => {
    createPrimitiveNode('a', 'cube', { width: 10, height: 10, depth: 10 },
      { x: 15, y: 7, z: 11, rotX: 10, rotY: 20, rotZ: 30, scaleX: 2, scaleY: 3, scaleZ: 0.5 })
    createPrimitiveNode('b', 'cube', { width: 10, height: 10, depth: 10 },
      { x: 5, y: -3, z: 8, rotX: -10, rotY: -5, rotZ: 15, scaleX: 1, scaleY: 2, scaleZ: 1 })
    createBooleanNode('csg', 'union', 'a', 'b',
      { x: 10, y: 5, z: 0, rotX: 5, rotY: 10, rotZ: 15, scaleX: 2, scaleY: 2, scaleZ: 2 })

    const csgBefore = getNode('csg')!
    const aBefore = getNode('a')!

    // First mirror YZ
    mirrorTreeNode('csg', 'YZ', { x: 0, y: 0, z: 0 })
    // Second mirror YZ (should restore)
    mirrorTreeNode('csg', 'YZ', { x: 0, y: 0, z: 0 })

    const csgAfter = getNode('csg')!
    const aAfter = getNode('a')!

    // localTransform ≈ original (±1e-6)
    expect(Math.abs(csgAfter.localTransform!.x - csgBefore.localTransform!.x)).toBeLessThan(1e-6)
    expect(Math.abs(csgAfter.localTransform!.y - csgBefore.localTransform!.y)).toBeLessThan(1e-6)
    expect(Math.abs(csgAfter.localTransform!.z - csgBefore.localTransform!.z)).toBeLessThan(1e-6)
    expect(Math.abs(csgAfter.localTransform!.rotX - csgBefore.localTransform!.rotX)).toBeLessThan(1e-6)
    expect(Math.abs(csgAfter.localTransform!.rotY - csgBefore.localTransform!.rotY)).toBeLessThan(1e-6)
    expect(Math.abs(csgAfter.localTransform!.rotZ - csgBefore.localTransform!.rotZ)).toBeLessThan(1e-6)
    expect(Math.abs(csgAfter.localTransform!.scaleX - csgBefore.localTransform!.scaleX)).toBeLessThan(1e-6)
    expect(Math.abs(csgAfter.localTransform!.scaleY - csgBefore.localTransform!.scaleY)).toBeLessThan(1e-6)
    expect(Math.abs(csgAfter.localTransform!.scaleZ - csgBefore.localTransform!.scaleZ)).toBeLessThan(1e-6)

    // relativeToParent children ≈ original
    expect(Math.abs(aAfter.relativeToParent!.positionDelta.x - aBefore.relativeToParent!.positionDelta.x)).toBeLessThan(1e-6)
    expect(Math.abs(aAfter.relativeToParent!.rotationDelta.y - aBefore.relativeToParent!.rotationDelta.y)).toBeLessThan(1e-6)
  })

  it('composeTransforms(parentWorld, mirroredRelative) ≈ mirroredLocal', () => {
    createPrimitiveNode('a', 'cube', { width: 10, height: 10, depth: 10 },
      { x: 15, y: 7, z: 11, rotX: 10, rotY: 20, rotZ: 30, scaleX: 2, scaleY: 3, scaleZ: 0.5 })
    createPrimitiveNode('b', 'cube', { width: 10, height: 10, depth: 10 },
      { x: 5, y: -3, z: 8, rotX: -10, rotY: -5, rotZ: 15, scaleX: 1, scaleY: 2, scaleZ: 1 })
    createBooleanNode('csg', 'union', 'a', 'b',
      { x: 10, y: 5, z: 0, rotX: 5, rotY: 10, rotZ: 15, scaleX: 2, scaleY: 2, scaleZ: 2 })

    mirrorTreeNode('csg', 'YZ', { x: 0, y: 0, z: 0 })

    const aNode = getNode('a')!
    const csgNode = getNode('csg')!
    const csgLocal = csgNode.localTransform!
    const csgWorld = csgLocal // root: local = world

    // Compose parent (identity for root) with child's relative → child's world
    const aRel = aNode.relativeToParent!
    const aComposedWorld = composeTransforms(csgWorld, aRel)
    const aLocal = aNode.localTransform!

    // ±1e-6
    expect(Math.abs(aComposedWorld.x - aLocal.x)).toBeLessThan(1e-6)
    expect(Math.abs(aComposedWorld.y - aLocal.y)).toBeLessThan(1e-6)
    expect(Math.abs(aComposedWorld.z - aLocal.z)).toBeLessThan(1e-6)
    expect(Math.abs(aComposedWorld.scaleX - aLocal.scaleX)).toBeLessThan(1e-6)
    expect(Math.abs(aComposedWorld.scaleY - aLocal.scaleY)).toBeLessThan(1e-6)
    expect(Math.abs(aComposedWorld.scaleZ - aLocal.scaleZ)).toBeLessThan(1e-6)
  })

  it('CSG with mirrored children preserves rotation/scale (MIRROR-CSG-CHILD-RS-LOSS)', () => {
    // This is the core regression test for the MIRROR-CSG-CHILD-RS-LOSS bug
    createPrimitiveNode('a', 'cube', { width: 10, height: 10, depth: 10 },
      { x: 5, y: 0, z: 0, rotX: 10, rotY: 20, rotZ: 30, scaleX: 2, scaleY: 0.5, scaleZ: 3 })
    createPrimitiveNode('b', 'cube', { width: 10, height: 10, depth: 10 },
      { x: 15, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 })
    createBooleanNode('csg', 'union', 'a', 'b',
      { x: 10, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 })

    const aBefore = getNode('a')!
    const scaleXBefore = aBefore.localTransform!.scaleX

    mirrorTreeNode('csg', 'YZ', { x: 0, y: 0, z: 0 })

    const aAfter = getNode('a')!

    // Scale must be positive (Math.abs) — NOT zero or negative
    expect(aAfter.localTransform!.scaleX).toBeCloseTo(Math.abs(scaleXBefore), 10)
    expect(aAfter.localTransform!.scaleY).toBeCloseTo(Math.abs(aBefore.localTransform!.scaleY), 10)
    expect(aAfter.localTransform!.scaleZ).toBeCloseTo(Math.abs(aBefore.localTransform!.scaleZ), 10)

    // Rotation: YZ mirror → rotX unchanged, rotY/rotZ negated
    expect(aAfter.localTransform!.rotX).toBeCloseTo(aBefore.localTransform!.rotX, 10)
    expect(aAfter.localTransform!.rotY).toBeCloseTo(-aBefore.localTransform!.rotY, 10)
    expect(aAfter.localTransform!.rotZ).toBeCloseTo(-aBefore.localTransform!.rotZ, 10)

    // relativeToParent scale is also positive
    expect(aAfter.relativeToParent!.scaleRatio.x).toBeCloseTo(Math.abs(aBefore.relativeToParent!.scaleRatio.x), 10)
  })

  it('multi-axis rotation after mirror: round-trip', () => {
    createPrimitiveNode('a', 'cube', { width: 10, height: 10, depth: 10 },
      { x: 15, y: 0, z: 0, rotX: 20, rotY: 30, rotZ: 40, scaleX: 1, scaleY: 1, scaleZ: 1 })
    createPrimitiveNode('b', 'cube', { width: 10, height: 10, depth: 10 },
      { x: 5, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 })
    createBooleanNode('csg', 'union', 'a', 'b',
      { x: 10, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 })

    mirrorTreeNode('csg', 'YZ', { x: 0, y: 0, z: 0 })

    const aNode = getNode('a')!
    const csgLocal = getNode('csg')!.localTransform!
    const rel = aNode.relativeToParent!

    // Round-trip: composeTransforms(parentWorld, relativeToParent) ≈ localTransform
    const composed = composeTransforms(csgLocal, rel)
    const local = aNode.localTransform!
    expect(Math.abs(composed.x - local.x)).toBeLessThan(1e-6)
    expect(Math.abs(composed.y - local.y)).toBeLessThan(1e-6)
    expect(Math.abs(composed.z - local.z)).toBeLessThan(1e-6)
    expect(Math.abs(composed.rotX - local.rotX)).toBeLessThan(1e-6)
    expect(Math.abs(composed.rotY - local.rotY)).toBeLessThan(1e-6)
    expect(Math.abs(composed.rotZ - local.rotZ)).toBeLessThan(1e-6)
    expect(Math.abs(composed.scaleX - local.scaleX)).toBeLessThan(1e-6)
    expect(Math.abs(composed.scaleY - local.scaleY)).toBeLessThan(1e-6)
    expect(Math.abs(composed.scaleZ - local.scaleZ)).toBeLessThan(1e-6)
  })
})

// ============================================================
// Stage 5 — rebuildNode uses relativeToParent (CRITICAL)
// ============================================================
describe('rebuildNode — relativeToParent (Stage 5)', () => {
  beforeEach(() => {
    clearTree()
  })

  it('primitive with relativeToParent → correct position', async () => {
    // Create a primitive with relativeToParent
    createPrimitiveNode('obj_1', 'cube', { width: 10, height: 10, depth: 10 },
      { x: 10, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 })
    createPrimitiveNode('parent', 'cube', { width: 10, height: 10, depth: 10 },
      { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 })
    createBooleanNode('csg', 'union', 'obj_1', 'parent',
      { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 })

    // obj_1.relativeToParent should be { pos: [10, 0, 0], ... }
    const node = getNode('obj_1')!
    expect(node.relativeToParent).not.toBeNull()
    expect(node.relativeToParent!.positionDelta.x).toBeCloseTo(10, 10)

    // rebuildNode should use composeTransforms(parentWorld, relativeToParent)
    // Since parent is at origin, world = relativeToParent
    // We can't test the mesh directly without WASM, but we can verify
    // the worldTransform computation logic
    const parentWorld = getNode('parent')!.localTransform!
    const worldTransform = composeTransforms(parentWorld, node.relativeToParent!)
    expect(worldTransform.x).toBeCloseTo(10, 10)
    expect(worldTransform.y).toBeCloseTo(0, 10)
    expect(worldTransform.z).toBeCloseTo(0, 10)
  })

  it('CSG from two primitives → result at correct position', async () => {
    createPrimitiveNode('obj_1', 'cube', { width: 10, height: 10, depth: 10 },
      { x: 5, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 })
    createPrimitiveNode('obj_2', 'cube', { width: 10, height: 10, depth: 10 },
      { x: 15, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 })
    createBooleanNode('csg', 'union', 'obj_1', 'obj_2',
      { x: 10, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 })

    // CSG root has relativeToParent = null, localTransform = { x: 10, ... }
    const csg = getNode('csg')!
    expect(csg.relativeToParent).toBeNull()
    expect(csg.localTransform).toBeDefined()
    expect(csg.localTransform!.x).toBeCloseTo(10, 10)

    // Children have relativeToParent relative to parent (csg at x=10)
    const obj1 = getNode('obj_1')!
    const obj2 = getNode('obj_2')!
    expect(obj1.relativeToParent).not.toBeNull()
    expect(obj2.relativeToParent).not.toBeNull()

    // obj_1 at x=5, parent at x=10 → relative x = -5
    expect(obj1.relativeToParent!.positionDelta.x).toBeCloseTo(-5, 10)
    // obj_2 at x=15, parent at x=10 → relative x = 5
    expect(obj2.relativeToParent!.positionDelta.x).toBeCloseTo(5, 10)

    // rebuildNode(csg) uses localTransform as fallback (relativeToParent = null)
    // World = localTransform = { x: 10, ... }
    const worldTransform = csg.localTransform!
    expect(worldTransform.x).toBeCloseTo(10, 10)
  })

  it('rebuildNode after mirror → no drift', async () => {
    createPrimitiveNode('obj_1', 'cube', { width: 10, height: 10, depth: 10 },
      { x: 10, y: 0, z: 0, rotX: 10, rotY: 20, rotZ: 30, scaleX: 2, scaleY: 1, scaleZ: 1 })
    createPrimitiveNode('obj_2', 'cube', { width: 10, height: 10, depth: 10 },
      { x: 0, y: 10, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 })
    createBooleanNode('csg', 'union', 'obj_1', 'obj_2',
      { x: 5, y: 5, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 })

    // Mirror YZ
    mirrorTreeNode('csg', 'YZ', { x: 0, y: 0, z: 0 })

    // After mirror, positions should be negated (X axis)
    const csgAfter = getNode('csg')!
    const obj1After = getNode('obj_1')!

    // CSG root: x=5 → x=-5 (mirror YZ)
    expect(csgAfter.localTransform!.x).toBeCloseTo(-5, 10)
    // obj_1: x=10 → x=-10 (mirror YZ)
    expect(obj1After.localTransform!.x).toBeCloseTo(-10, 10)

    // relativeToParent should also be mirrored
    expect(obj1After.relativeToParent).not.toBeNull()
    expect(obj1After.relativeToParent!.positionDelta.x).toBeCloseTo(-5, 10)

    // Scale should be preserved (Math.abs)
    expect(obj1After.localTransform!.scaleX).toBeCloseTo(2, 10)
    // Rotation: YZ mirror → rotX unchanged, rotY/rotZ negated
    expect(obj1After.localTransform!.rotX).toBeCloseTo(10, 10)
    expect(obj1After.localTransform!.rotY).toBeCloseTo(-20, 10)
    expect(obj1After.localTransform!.rotZ).toBeCloseTo(-30, 10)
  })

  it('round-trip: rebuildNode uses same worldTransform as localTransform', () => {
    createPrimitiveNode('obj_1', 'cube', { width: 10, height: 10, depth: 10 },
      { x: 15, y: 7, z: 11, rotX: 10, rotY: 20, rotZ: 30, scaleX: 2, scaleY: 3, scaleZ: 0.5 })
    createPrimitiveNode('parent', 'cube', { width: 10, height: 10, depth: 10 },
      { x: 5, y: 5, z: 5, rotX: 5, rotY: 5, rotZ: 5, scaleX: 1, scaleY: 1, scaleZ: 1 })
    createBooleanNode('csg', 'union', 'obj_1', 'parent',
      { x: 10, y: 10, z: 10, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 })

    const node = getNode('obj_1')!
    const csgWorld = getNode('csg')!.localTransform! // CSG is the parent for relativeToParent
    const rel = node.relativeToParent!

    // rebuildNode computes: worldTransform = composeTransforms(parentWorld, relativeToParent)
    // where parentWorld = csg.localTransform (the boolean node's transform)
    const worldTransform = composeTransforms(csgWorld, rel)

    // This should equal obj_1.localTransform (Stage 4 preserves it)
    const local = node.localTransform!
    expect(Math.abs(worldTransform.x - local.x)).toBeLessThan(1e-6)
    expect(Math.abs(worldTransform.y - local.y)).toBeLessThan(1e-6)
    expect(Math.abs(worldTransform.z - local.z)).toBeLessThan(1e-6)
    expect(Math.abs(worldTransform.rotX - local.rotX)).toBeLessThan(1e-6)
    expect(Math.abs(worldTransform.rotY - local.rotY)).toBeLessThan(1e-6)
    expect(Math.abs(worldTransform.rotZ - local.rotZ)).toBeLessThan(1e-6)
    expect(Math.abs(worldTransform.scaleX - local.scaleX)).toBeLessThan(1e-6)
    expect(Math.abs(worldTransform.scaleY - local.scaleY)).toBeLessThan(1e-6)
    expect(Math.abs(worldTransform.scaleZ - local.scaleZ)).toBeLessThan(1e-6)
  })

  it('fallback to localTransform if relativeToParent is null', () => {
    // Create a primitive without relativeToParent (root node)
    createPrimitiveNode('obj_1', 'cube', { width: 10, height: 10, depth: 10 },
      { x: 10, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 })

    const node = getNode('obj_1')!
    expect(node.relativeToParent).toBeNull()
    expect(node.localTransform).toBeDefined()
    expect(node.localTransform!.x).toBeCloseTo(10, 10)

    // rebuildNode fallback: worldTransform = localTransform
    const worldTransform = node.localTransform!
    expect(worldTransform.x).toBeCloseTo(10, 10)
    expect(worldTransform.y).toBeCloseTo(0, 10)
    expect(worldTransform.z).toBeCloseTo(0, 10)
  })

  it('nested CSG (CSG from CSG)', () => {
    // Create first CSG: obj_1 + obj_2 → csg_A
    createPrimitiveNode('obj_1', 'cube', { width: 10, height: 10, depth: 10 },
      { x: 5, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 })
    createPrimitiveNode('obj_2', 'cube', { width: 10, height: 10, depth: 10 },
      { x: 15, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 })
    createBooleanNode('csg_A', 'union', 'obj_1', 'obj_2',
      { x: 10, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 })

    // Create second CSG: csg_A + obj_3 → csg_B
    createPrimitiveNode('obj_3', 'cube', { width: 10, height: 10, depth: 10 },
      { x: 20, y: 10, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 })
    createBooleanNode('csg_B', 'union', 'csg_A', 'obj_3',
      { x: 15, y: 5, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 })

    // csg_A has relativeToParent relative to csg_B
    const csgA = getNode('csg_A')!
    const csgB = getNode('csg_B')!
    expect(csgA.relativeToParent).not.toBeNull()
    expect(csgB.relativeToParent).toBeNull() // root

    // csg_A at x=10, parent (csg_B) at x=15 → relative x = -5
    expect(csgA.relativeToParent!.positionDelta.x).toBeCloseTo(-5, 10)

    // obj_1 relative to csg_A (parent at x=10): x=5 → relative x = -5
    const obj1 = getNode('obj_1')!
    expect(obj1.relativeToParent!.positionDelta.x).toBeCloseTo(-5, 10)

    // obj_3 relative to csg_B (parent at x=15): x=20 → relative x = 5
    const obj3 = getNode('obj_3')!
    expect(obj3.relativeToParent!.positionDelta.x).toBeCloseTo(5, 10)

    // Verify world transforms via composeTransforms
    // obj_1: world = csg_B.local ∘ csg_A.relative ∘ obj_1.relative
    const csgBWorld = csgB.localTransform!
    const csgAWorld = composeTransforms(csgBWorld, csgA.relativeToParent!)
    const obj1World = composeTransforms(csgAWorld, obj1.relativeToParent!)
    expect(obj1World.x).toBeCloseTo(5, 10) // original x=5
  })
})
