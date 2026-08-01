// ============================================================
// Snapshot cache — PERF-1: avoid full WASM rebuild on undo/redo
// ============================================================
//
// SceneObject references are immutable: every store action creates new
// object references via spread, never mutating existing ones.  This means
// it is safe to cache the `objects` dictionary at each historyIndex and
// reuse the cached reference on undo/redo without rebuilding through WASM.
//
// The cache is a plain module-level Map — NOT part of Zustand state — so
// updating it never triggers React re-renders.
//
// BuildTree integration: we also cache the tree nodes alongside objects
// so that undo/redo restores both the scene objects AND the build tree.

import type { SceneObject } from '../csg/types'
import type { TreeNode } from '../csg/types'

/**
 * Maximum number of snapshots to keep in cache.
 * Beyond this limit, the oldest entries are evicted (LRU).
 * 50 snapshots × ~50KB each ≈ 2.5MB worst case — well within budget.
 */
const MAX_CACHE_SIZE = 50

const cache = new Map<number, Record<string, SceneObject>>()

/** Tree node data stored alongside snapshot for tree restoration */
interface SnapshotTree {
  nodes: Array<{
    id: string
    type: TreeNode['type']
    shapeType?: string
    params?: Record<string, number>
    localTransform?: { x: number; y: number; z: number; rotX: number; rotY: number; rotZ: number; scaleX: number; scaleY: number; scaleZ: number }
    vertices?: number[]
    indices?: number[]
    normals?: number[]
    operation?: 'union' | 'subtract' | 'intersect'
    children?: string[]
    parentId?: string
  }>
}

/** Tree data stored per snapshot index */
const treeCache = new Map<number, SnapshotTree>()

/**
 * Enforce LRU eviction: if cache exceeds MAX_CACHE_SIZE, remove oldest entries.
 * Uses Map iteration order (insertion order = LRU order for our access pattern).
 */
function enforceCacheLimit(map: Map<number, unknown>): void {
  while (map.size > MAX_CACHE_SIZE) {
    const oldestKey = map.keys().next().value
    if (oldestKey !== undefined) {
      map.delete(oldestKey)
    }
  }
}

/**
 * Serialize tree nodes to plain objects for snapshot storage.
 * Excludes cached fields (cachedMesh, cachedBBox, cacheHash).
 */
function serializeTree(nodes: TreeNode[]): SnapshotTree {
  const nodeArray: SnapshotTree['nodes'] = []
  for (const node of nodes) {
    nodeArray.push({
      id: node.id,
      type: node.type,
      shapeType: node.shapeType,
      params: node.params as Record<string, number> | undefined,
      localTransform: node.localTransform,
      vertices: node.vertices ? Array.from(node.vertices) : undefined,
      indices: node.indices ? Array.from(node.indices) : undefined,
      normals: node.normals ? Array.from(node.normals) : undefined,
      operation: node.operation,
      children: node.children,
      parentId: node.parentId,
    })
  }
  return { nodes: nodeArray }
}

/**
 * Cache the objects dictionary at the given history index.
 * Automatically invalidates any snapshots for indices > `index`
 * (history was truncated by a new operation after undo).
 * Also caches the current build tree state.
 */
export function cacheSnapshot(
  index: number,
  objects: Record<string, SceneObject>,
): void {
  cache.set(index, objects)
  for (const key of cache.keys()) {
    if (key > index) cache.delete(key)
  }
  enforceCacheLimit(cache)
}

/**
 * Cache the build tree state at the given history index.
 */
export function cacheTreeSnapshot(
  index: number,
  nodes: TreeNode[],
): void {
  treeCache.set(index, serializeTree(nodes))
  for (const key of treeCache.keys()) {
    if (key > index) treeCache.delete(key)
  }
  enforceCacheLimit(treeCache)
}

/**
 * Returns the cached snapshot for the given index, or `undefined`
 * if no snapshot is available (must fall back to rebuildFromHistory).
 */
export function getCachedSnapshot(
  index: number,
): Record<string, SceneObject> | undefined {
  // Touch-on-access: re-insert to update LRU order in Map
  if (cache.has(index)) {
    const val = cache.get(index)!
    cache.delete(index)
    cache.set(index, val)
  }
  return cache.get(index)
}

/**
 * Returns the cached tree snapshot for the given index, or `undefined`.
 */
export function getCachedTreeSnapshot(
  index: number,
): SnapshotTree | undefined {
  // Touch-on-access: re-insert to update LRU order in Map
  if (treeCache.has(index)) {
    const val = treeCache.get(index)!
    treeCache.delete(index)
    treeCache.set(index, val)
  }
  return treeCache.get(index)
}

/** Clear all cached snapshots (used on clearScene, openDoodle, loadFromProject). */
export function clearSnapshots(): void {
  cache.clear()
  treeCache.clear()
}
