// ============================================================
// BuildTree — Parameterized build tree for CSG and primitives
// ============================================================
// Pure logic module — no React/DOM dependencies.
// All operations work on the tree structure; meshes are rebuilt lazily.

import type {
  TreeNode,
  TreeNodeType,
  Point3D,
  BoundingBox,
  ExtractedMesh,
  ShapeType,
  ShapeParams,
  TransformNR,
} from './types'
import {
  getWasm,
  buildPrimitive,
  sanitizeParams,
  extractMesh,
  ManifoldObject,
  isWasmReady,
} from './worker-handlers'
import { buildTransformMatrix } from './worker-matrix'
import { workerRebuildNode } from './worker-client'

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

/** Global build tree storage */
const treeNodes = new Map<string, TreeNode>()

export function getNode(id: string): TreeNode | undefined {
  return treeNodes.get(id)
}

export function setNode(id: string, node: TreeNode): void {
  treeNodes.set(id, node)
}

export function deleteNode(id: string): void {
  const node = treeNodes.get(id)
  if (node) {
    // Reset parentId on children so they lose the parent link
    if (node.children) {
      for (const childId of node.children) {
        const child = treeNodes.get(childId)
        if (child) child.parentId = undefined
      }
    }
    // Reset own parentId
    if (node.parentId) node.parentId = undefined
  }
  treeNodes.delete(id)
}

export function clearTree(): void {
  treeNodes.clear()
}

export function getAllNodes(): TreeNode[] {
  return [...treeNodes.values()]
}

// ---------------------------------------------------------------------------
// Node creation
// ---------------------------------------------------------------------------

/** Register a primitive node in the tree */
export function createPrimitiveNode(
  id: string,
  shapeType: ShapeType,
  params: ShapeParams,
  transform: TransformNR,
): TreeNode {
  const node: TreeNode = {
    id,
    type: 'primitive',
    shapeType,
    params: { ...params },
    localTransform: { ...transform },
  }
  treeNodes.set(id, node)
  return node
}

/**
 * Create a boolean operation node.
 * Sets parentId on children and checks for cycles.
 */
/**
 * Create a boolean node with optional transform.
 * Boolean nodes can have their own transform to position/rotate/scale the result.
 */
export function createBooleanNode(
  id: string,
  operation: 'union' | 'subtract' | 'intersect',
  childA: string,
  childB: string,
  transform?: TransformNR,
): TreeNode {
  // Guard: self-reference
  if (childA === id || childB === id) {
    throw new Error(`Boolean node cannot reference itself: ${id}`)
  }
  // Guard: cycle detection
  if (isAncestor(childA, id) || isAncestor(childB, id)) {
    throw new Error(`Cannot create cycle in tree: ${childA} → ${id} or ${childB} → ${id}`)
  }

  const node: TreeNode = {
    id,
    type: 'boolean',
    operation,
    children: [childA, childB],
    localTransform: transform ? { ...transform } : undefined,
  }
  treeNodes.set(id, node)

  // Set parentId on children for O(depth) cascade invalidation
  const childANode = treeNodes.get(childA)
  const childBNode = treeNodes.get(childB)
  if (childANode) childANode.parentId = id
  if (childBNode) childBNode.parentId = id

  return node
}

/** Register a baked node from imported STL */
export function createBakedNode(
  id: string,
  vertices: Float32Array,
  indices: Uint32Array,
  normals: Float32Array | null,
  transform: TransformNR,
): TreeNode {
  const node: TreeNode = {
    id,
    type: 'baked',
    vertices,
    indices,
    normals,
    localTransform: { ...transform },
  }
  treeNodes.set(id, node)
  return node
}

// ---------------------------------------------------------------------------
// Bounding box (with memoization)
// ---------------------------------------------------------------------------

/** Compute bounding box for a node (recursively, with caching) */
export function computeNodeBBox(nodeId: string): BoundingBox {
  const node = treeNodes.get(nodeId)
  if (!node) return { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } }

  // Check cache: if bbox is cached and hash matches, return it
  if (node.cachedBBox && node.cacheHash && node.cacheHash === computeNodeHash(node)) {
    return node.cachedBBox
  }

  let bbox: BoundingBox

  if (node.type === 'primitive') {
    const t = node.localTransform!
    const w = (node.params?.width ?? 20) * Math.abs(t.scaleX ?? 1)
    const h = (node.params?.height ?? 20) * Math.abs(t.scaleY ?? 1)
    const d = (node.params?.depth ?? 20) * Math.abs(t.scaleZ ?? 1)
    const hw = w / 2, hh = h / 2, hd = d / 2
    bbox = {
      min: { x: t.x - hw, y: t.y - hh, z: t.z - hd },
      max: { x: t.x + hw, y: t.y + hh, z: t.z + hd },
    }
  } else if (node.type === 'baked') {
    if (node.vertices) {
      bbox = computeBakedBBox(node.vertices, node.localTransform!)
    } else {
      bbox = { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } }
    }
  } else if (node.type === 'boolean' && node.children) {
    const childBoxes = node.children
      .map(computeNodeBBox)
      .filter(Boolean) as BoundingBox[]
    if (childBoxes.length === 0) {
      bbox = { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } }
    } else {
      bbox = {
        min: {
          x: Math.min(...childBoxes.map(b => b.min.x)),
          y: Math.min(...childBoxes.map(b => b.min.y)),
          z: Math.min(...childBoxes.map(b => b.min.z)),
        },
        max: {
          x: Math.max(...childBoxes.map(b => b.max.x)),
          y: Math.max(...childBoxes.map(b => b.max.y)),
          z: Math.max(...childBoxes.map(b => b.max.z)),
        },
      }
    }
  } else {
    bbox = { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } }
  }

  // Memoize
  node.cachedBBox = bbox
  node.cacheHash = computeNodeHash(node)
  return bbox
}

/** Compute bbox from vertices with position transform */
function computeBakedBBox(
  vertices: Float32Array | number[],
  transform: TransformNR,
): BoundingBox {
  let minX = Infinity, minY = Infinity, minZ = Infinity
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity

  for (let i = 0; i < vertices.length; i += 3) {
    const x = (vertices[i] as number) + transform.x
    const y = (vertices[i + 1] as number) + transform.y
    const z = (vertices[i + 2] as number) + transform.z

    if (x < minX) minX = x
    if (y < minY) minY = y
    if (z < minZ) minZ = z
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
    if (z > maxZ) maxZ = z
  }

  return {
    min: { x: minX, y: minY, z: minZ },
    max: { x: maxX, y: maxY, z: maxZ },
  }
}

/** Center of a bounding box */
export function bboxCenter(bbox: BoundingBox): Point3D {
  return {
    x: (bbox.min.x + bbox.max.x) / 2,
    y: (bbox.min.y + bbox.max.y) / 2,
    z: (bbox.min.z + bbox.max.z) / 2,
  }
}

// ---------------------------------------------------------------------------
// Hash, ancestor check, and cascade invalidation
// ---------------------------------------------------------------------------

/** Compute a hash to verify cache validity */
function computeNodeHash(node: TreeNode): string {
  if (node.type === 'primitive') {
    return JSON.stringify({
      shapeType: node.shapeType,
      params: node.params,
      transform: node.localTransform,
    })
  }
  if (node.type === 'baked' && node.vertices && node.indices && node.localTransform) {
    return JSON.stringify({
      type: 'baked',
      vertLen: node.vertices.length,
      idxLen: node.indices.length,
      transform: node.localTransform,
    })
  }
  if (node.type === 'boolean' && node.children) {
    const childHashes = node.children
      .map(id => {
        const child = treeNodes.get(id)
        return child ? computeNodeHash(child) : '?'
      })
    return `${node.operation}|${childHashes.join('|')}`
  }
  return ''
}

/**
 * Check if ancestorId is an ancestor of nodeId.
 * Walks up the parentId chain — O(depth).
 * Used to prevent cycles when creating boolean nodes.
 */
export function isAncestor(nodeId: string, ancestorId: string): boolean {
  let current = treeNodes.get(nodeId)
  while (current?.parentId) {
    if (current.parentId === ancestorId) return true
    current = treeNodes.get(current.parentId)
  }
  return false
}

/**
 * Cascade cache invalidation — O(depth), not O(n).
 * Walks up the parentId chain, not linear scan over all nodes.
 */
function invalidateCache(nodeId: string): void {
  const node = treeNodes.get(nodeId)
  if (!node) return
  // Invalidate current node
  node.cachedMesh = undefined
  node.cacheHash = undefined
  node.cachedBBox = undefined
  // Recurse up the parentId chain — O(depth), not O(n)
  if (node.parentId) {
    invalidateCache(node.parentId)
  }
}

// ---------------------------------------------------------------------------
// Mesh rebuild
// ---------------------------------------------------------------------------

/**
 * Rebuild mesh for a node from the tree.
 * Uses cache — if hash matches, returns cached result.
 */
export async function rebuildNode(nodeId: string): Promise<ExtractedMesh> {
  const node = treeNodes.get(nodeId)
  if (!node) throw new Error(`Node ${nodeId} not found in tree`)

  const hash = computeNodeHash(node)
  if (node.cachedMesh && node.cacheHash === hash) {
    return node.cachedMesh
  }

  let result: ExtractedMesh

  // Check if WASM is ready, if not — use worker
  if (isWasmReady()) {
    // Local rebuild with WASM
    if (node.type === 'primitive') {
      result = rebuildPrimitive(node)
    } else if (node.type === 'baked') {
      result = transformBakedMesh(node)
    } else if (node.type === 'boolean' && node.children) {
      result = await applyCSGMeshes(node)
    } else {
      throw new Error(`Unknown node type: ${node.type}`)
    }
  } else {
    // Worker rebuild — collect subtree data and send to worker
    const subtreeData = collectSubtreeForWorker(nodeId)
    const resultMesh = await workerRebuildNode(nodeId, subtreeData)
    result = {
      vertices: resultMesh.vertices,
      indices: resultMesh.indices,
      normals: resultMesh.normals,
      tris: resultMesh.tris,
      ms: resultMesh.ms
    }
  }

  // Cache the result
  node.cachedMesh = result
  node.cacheHash = hash
  return result
}

/**
 * Collect subtree data for worker rebuild.
 * Returns all nodes in the subtree with their current state.
 */
function collectSubtreeForWorker(rootId: string): Array<{
  id: string
  type: 'primitive' | 'boolean' | 'baked'
  shapeType?: string
  params?: Record<string, number>
  localTransform?: { x: number; y: number; z: number; rotX: number; rotY: number; rotZ: number; scaleX: number; scaleY: number; scaleZ: number }
  vertices?: number[]
  indices?: number[]
  normals?: number[]
  operation?: 'union' | 'subtract' | 'intersect'
  children?: string[]
}> {
  const nodes: Array<any> = []
  const visited = new Set<string>()

  function collect(id: string): void {
    if (visited.has(id)) return

    const node = treeNodes.get(id)
    if (!node) return

    visited.add(id)

    // Convert TreeNode to worker-compatible format
    const workerNode: any = {
      id: node.id,
      type: node.type,
    }

    if (node.shapeType !== undefined) workerNode.shapeType = node.shapeType
    if (node.params !== undefined) workerNode.params = node.params as Record<string, number>
    if (node.localTransform !== undefined) workerNode.localTransform = node.localTransform
    if (node.vertices !== undefined) workerNode.vertices = Array.from(node.vertices)
    if (node.indices !== undefined) workerNode.indices = Array.from(node.indices)
    if (node.normals !== undefined) workerNode.normals = Array.from(node.normals || [])
    if (node.operation !== undefined) workerNode.operation = node.operation
    if (node.children !== undefined) workerNode.children = node.children

    nodes.push(workerNode)

    // Recursively collect children
    if (node.children) {
      for (const childId of node.children) {
        collect(childId)
      }
    }
  }

  collect(rootId)
  return nodes
}

/**
 * Apply a CSG boolean operation between two child nodes.
 * Uses workerRebuildNode for efficient tree-based CSG.
 *
 * FIX (BUG-CSG-POS-3): Center the result mesh (like extractAndCenter does on first creation)
 * and apply boolean node's localTransform. Children have their transforms applied (world coords),
 * so boolean result is also in world coordinates. We must center it and apply localTransform.
 */
async function applyCSGMeshes(node: TreeNode): Promise<ExtractedMesh> {
  if (!node.children || node.children.length !== 2) {
    throw new Error(`Boolean node needs exactly 2 children`)
  }

  // Collect all nodes in the subtree INCLUDING the target node
  const nodes: typeof treeNodes = new Map()
  function collectSubtree(id: string): void {
    const n = treeNodes.get(id)
    if (!n || nodes.has(id)) return
    nodes.set(id, n)
    if (n.children) {
      for (const childId of n.children) {
        collectSubtree(childId)
      }
    }
  }
  collectSubtree(node.id) // ← include target node itself

  // Serialize to plain objects for worker
  const nodeData = Array.from(nodes.values()).map(n => ({
    id: n.id,
    type: n.type,
    shapeType: n.shapeType,
    params: n.params as Record<string, number> | undefined,
    localTransform: n.localTransform,
    vertices: n.vertices ? Array.from(n.vertices) : undefined,
    indices: n.indices ? Array.from(n.indices) : undefined,
    normals: n.normals ? Array.from(n.normals) : undefined,
    operation: n.operation,
    children: n.children,
  }))

  const result = await workerRebuildNode(node.id, nodeData)

  // Worker centers the mesh but does NOT apply the boolean node's localTransform.
  // We need to apply the localTransform here to position the result correctly.
  // First, convert to Float32Array
  let vertices = new Float32Array(result.vertices);
  const indices = new Uint32Array(result.indices);
  const normals = result.normals ? new Float32Array(result.normals) : null;

  // Apply localTransform if it exists
  if (node.localTransform) {
    const t = node.localTransform;
    const matrix = buildTransformMatrix(
      { x: t.x, y: t.y, z: t.z },
      { rotX: t.rotX, rotY: t.rotY, rotZ: t.rotZ },
      { scaleX: t.scaleX, scaleY: t.scaleY, scaleZ: t.scaleZ },
    );

    // Apply transformation to vertices
    for (let i = 0; i < vertices.length; i += 3) {
      const x = vertices[i], y = vertices[i + 1], z = vertices[i + 2];
      vertices[i] = matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12];
      vertices[i + 1] = matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13];
      vertices[i + 2] = matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14];
    }

    // Apply transformation to normals if they exist
    if (normals) {
      for (let i = 0; i < normals.length; i += 3) {
        const nx = normals[i], ny = normals[i + 1], nz = normals[i + 2];
        normals[i] = matrix[0] * nx + matrix[4] * ny + matrix[8] * nz;
        normals[i + 1] = matrix[1] * nx + matrix[5] * ny + matrix[9] * nz;
        normals[i + 2] = matrix[2] * nx + matrix[6] * ny + matrix[10] * nz;
      }
    }
  }

  return {
    vertices,
    indices,
    normals,
    tris: result.tris,
    ms: result.ms,
  }
}

/** Rebuild a primitive node */
function rebuildPrimitive(node: TreeNode): ExtractedMesh {
  const wasm = getWasm()
  const m = buildPrimitive(node.shapeType!, sanitizeParams(node.params!))
  const matrix = buildTransformMatrix(
    { x: node.localTransform!.x, y: node.localTransform!.y, z: node.localTransform!.z },
    { rotX: node.localTransform!.rotX, rotY: node.localTransform!.rotY, rotZ: node.localTransform!.rotZ },
    { scaleX: node.localTransform!.scaleX, scaleY: node.localTransform!.scaleY, scaleZ: node.localTransform!.scaleZ },
  )
  const transformed = m.transform(matrix)
  m.delete()
  const mesh = extractMesh(transformed)
  transformed.delete()
  return mesh
}

/** Transform a baked mesh (STL, non-manifold) with its localTransform */
function transformBakedMesh(node: TreeNode): ExtractedMesh {
  if (!node.vertices || !node.indices) {
    throw new Error(`Baked node ${node.id} has no geometry`)
  }

  const t = node.localTransform!
  const wasm = getWasm()
  const { Manifold } = wasm

  try {
    const m = new Manifold({
      numProp: 3,
      vertProperties: new Float32Array(node.vertices),
      triVerts: new Uint32Array(node.indices),
    })

    // Apply position transform (scale=1, rot=0 for baked)
    const matrix = buildTransformMatrix(
      { x: t.x, y: t.y, z: t.z },
      { rotX: 0, rotY: 0, rotZ: 0 },
      { scaleX: 1, scaleY: 1, scaleZ: 1 },
    )
    const transformed = m.transform(matrix)
    m.delete()

    const mesh = extractMesh(transformed)
    transformed.delete()
    return mesh
  } catch {
    // Non-manifold — return as-is
    return {
      vertices: new Float32Array(node.vertices),
      indices: new Uint32Array(node.indices),
      normals: node.normals ? new Float32Array(node.normals) : null,
      tris: node.indices.length / 3,
    }
  }
}

// ---------------------------------------------------------------------------
// Mirror tree
// ---------------------------------------------------------------------------

/** Mirror a node (and its entire subtree) relative to a plane through origin */
export function mirrorTreeNode(nodeId: string, plane: 'XY' | 'XZ' | 'YZ'): void {
  const node = treeNodes.get(nodeId)
  if (!node) return

  // Recursively mirror — each node mirrored relative to origin (0,0,0)
  mirrorNodeRecursive(node, plane)

  // Invalidate cache
  invalidateCache(nodeId)
}

function mirrorPoint(p: Point3D, plane: 'XY' | 'XZ' | 'YZ'): Point3D {
  switch (plane) {
    case 'YZ': return { x: -p.x, y: p.y, z: p.z }
    case 'XZ': return { x: p.x, y: -p.y, z: p.z }
    case 'XY': return { x: p.x, y: p.y, z: -p.z }
  }
}

function mirrorNodeRecursive(
  node: TreeNode,
  plane: 'XY' | 'XZ' | 'YZ',
): void {
  if (node.type === 'primitive' && node.localTransform) {
    const t = node.localTransform
    const mirroredPos = mirrorPoint({ x: t.x, y: t.y, z: t.z }, plane)
    node.localTransform = {
      ...t,
      x: mirroredPos.x,
      y: mirroredPos.y,
      z: mirroredPos.z,
      rotX: plane === 'YZ' ? -t.rotX : t.rotX,
      rotY: plane === 'XZ' ? -t.rotY : t.rotY,
      rotZ: plane === 'XY' ? -t.rotZ : t.rotZ,
    }
    return
  }

  if (node.type === 'baked' && node.localTransform) {
    // Baked: only position, no rotation inversion (normals already in mesh)
    const t = node.localTransform
    const mirroredPos = mirrorPoint({ x: t.x, y: t.y, z: t.z }, plane)
    node.localTransform = {
      ...t,
      x: mirroredPos.x,
      y: mirroredPos.y,
      z: mirroredPos.z,
    }
    return
  }

  if (node.type === 'boolean' && node.children) {
    node.children.forEach(childId => {
      const child = treeNodes.get(childId)
      if (child) mirrorNodeRecursive(child, plane)
    })
  }
}

// ---------------------------------------------------------------------------
// Move tree
// ---------------------------------------------------------------------------

/** Move a node (and its entire subtree) by delta */
export function moveTreeNode(nodeId: string, delta: Point3D): void {
  const node = treeNodes.get(nodeId)
  if (!node) return
  applyTransformToPrimitives(node, t => ({
    x: t.x + delta.x,
    y: t.y + delta.y,
    z: t.z + delta.z,
  }))
  invalidateCache(nodeId)
}

/** Recursively apply a transform function to all primitives in the subtree */
function applyTransformToPrimitives(
  node: TreeNode,
  fn: (t: TransformNR) => Partial<TransformNR>,
): void {
  if (node.type === 'primitive' && node.localTransform) {
    node.localTransform = { ...node.localTransform, ...fn(node.localTransform) }
    return
  }
  if (node.type === 'baked' && node.localTransform) {
    node.localTransform = { ...node.localTransform, ...fn(node.localTransform) }
    return
  }
  if (node.type === 'boolean' && node.children) {
    node.children.forEach(childId => {
      const child = treeNodes.get(childId)
      if (child) applyTransformToPrimitives(child, fn)
    })
  }
}

// ---------------------------------------------------------------------------
// Rotate tree (around bounding box center)
// ---------------------------------------------------------------------------

/** Rotate a node (and its entire subtree) around the subtree's bbox center */
export function rotateTreeNode(
  nodeId: string,
  rotation: { x?: number; y?: number; z?: number },
): void {
  const node = treeNodes.get(nodeId)
  if (!node) return

  const bbox = computeNodeBBox(nodeId)
  const center = bboxCenter(bbox)

  applyTransformToPrimitives(node, t => {
    const rel: Point3D = {
      x: t.x - center.x,
      y: t.y - center.y,
      z: t.z - center.z,
    }

    // Rotation around X
    if (rotation.x) {
      const cosX = Math.cos(rotation.x * Math.PI / 180)
      const sinX = Math.sin(rotation.x * Math.PI / 180)
      const ry = rel.y * cosX - rel.z * sinX
      const rz = rel.y * sinX + rel.z * cosX
      rel.y = ry
      rel.z = rz
    }

    // Rotation around Y
    if (rotation.y) {
      const cosY = Math.cos(rotation.y * Math.PI / 180)
      const sinY = Math.sin(rotation.y * Math.PI / 180)
      const rx = rel.x * cosY + rel.z * sinY
      const rz = -rel.x * sinY + rel.z * cosY
      rel.x = rx
      rel.z = rz
    }

    // Rotation around Z
    if (rotation.z) {
      const cosZ = Math.cos(rotation.z * Math.PI / 180)
      const sinZ = Math.sin(rotation.z * Math.PI / 180)
      const rx = rel.x * cosZ - rel.y * sinZ
      const ry = rel.x * sinZ + rel.y * cosZ
      rel.x = rx
      rel.y = ry
    }

    return {
      x: rel.x + center.x,
      y: rel.y + center.y,
      z: rel.z + center.z,
      rotX: (t.rotX ?? 0) + (rotation.x ?? 0),
      rotY: (t.rotY ?? 0) + (rotation.y ?? 0),
      rotZ: (t.rotZ ?? 0) + (rotation.z ?? 0),
    }
  })

  invalidateCache(nodeId)
}

/**
 * Sync transform from store to tree node.
 * Ensures tree has the latest transform before operations.
 * Always sets localTransform, even if it was previously undefined (e.g., boolean
 * nodes created without a transform in older code paths).
 */
export function syncNodeTransform(id: string, transform: TransformNR): void {
  const node = treeNodes.get(id)
  if (node) {
    node.localTransform = { ...transform }
  }
}

/**
 * Set the full transform (position + rotation + scale) on a node and invalidate
 * its cache. Unlike moveTreeNode (which recurses into children for boolean nodes
 * and only applies translation), this function:
 *
 * 1. Sets the node's own localTransform to the full new transform (TRS)
 * 2. Does NOT recurse into children — children define the shape, localTransform
 *    positions/scales/rotates the result
 * 3. Invalidates the cache for this node and all ancestors
 *
 * This is the correct way to update a CSG result's transform in the tree.
 * moveTreeNode's recursion into children causes double-positioning bugs because
 * the boolean node's localTransform becomes stale (never updated), while
 * children move — the worker re-centers the result and applies the old
 * localTransform, producing vertices at the wrong position.
 */
export function applyNodeTransform(id: string, transform: TransformNR): void {
  const node = treeNodes.get(id)
  if (!node) return
  node.localTransform = { ...transform }
  invalidateCache(id)
}

// ---------------------------------------------------------------------------
// Clone subtree
// ---------------------------------------------------------------------------

/**
 * Clone a subtree rooted at sourceId.
 * newIdMap — mapping of old IDs → new IDs to preserve internal links.
 * visited Set — protection against cycles during recursive cloning.
 */
export function cloneSubtree(
  sourceId: string,
  newRootId: string,
  newIdMap: Map<string, string> = new Map(),
): TreeNode {
  const source = treeNodes.get(sourceId)
  if (!source) throw new Error(`Source node ${sourceId} not found`)

  const visited = new Set<string>()
  return cloneRecursive(sourceId, newRootId, newIdMap, visited)
}

function cloneRecursive(
  sourceId: string,
  newId: string,
  newIdMap: Map<string, string>,
  visited: Set<string>,
): TreeNode {
  const source = treeNodes.get(sourceId)
  if (!source) throw new Error(`Source node ${sourceId} not found`)

  // Cycle protection
  if (visited.has(sourceId)) {
    throw new Error(`Cycle detected during clone: ${sourceId}`)
  }
  visited.add(sourceId)

  newIdMap.set(sourceId, newId)

  const clone: TreeNode = {
    id: newId,
    type: source.type,
  }

  if (source.type === 'primitive') {
    clone.shapeType = source.shapeType
    clone.params = { ...source.params }
    clone.localTransform = { ...source.localTransform! }
  }

  if (source.type === 'baked') {
    // Deep copy TypedArrays — not references!
    clone.vertices = new Float32Array(source.vertices!)
    clone.indices = new Uint32Array(source.indices!)
    clone.normals = source.normals ? new Float32Array(source.normals) : null
    clone.localTransform = { ...source.localTransform! }
  }

  if (source.type === 'boolean' && source.children) {
    clone.operation = source.operation
    clone.children = source.children.map(childId => {
      const existing = newIdMap.get(childId)
      if (existing) return existing // already cloned
      const newChildId = nextIdForTree()
      const childClone = cloneRecursive(childId, newChildId, newIdMap, visited)
      return childClone.id
    })
  }

  treeNodes.set(newId, clone)
  return clone
}

/** Generate a unique ID for the tree (separate prefix from document store) */
function nextIdForTree(): string {
  return `tree_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`
}

// ---------------------------------------------------------------------------
// Debug
// ---------------------------------------------------------------------------

/** Debug tree output */
export function printTree(nodeId: string, indent = ''): void {
  const node = treeNodes.get(nodeId)
  if (!node) {
    console.log(`${indent}❌ Node ${nodeId} not found`)
    return
  }
  if (node.type === 'primitive') {
    console.log(
      `${indent}📦 Primitive [${node.id}]: ${node.shapeType}`,
      node.params,
      node.localTransform,
    )
  } else if (node.type === 'boolean') {
    console.log(`${indent}🔧 Boolean [${node.id}]: ${node.operation}`)
    node.children?.forEach(childId => printTree(childId, indent + '  '))
  } else if (node.type === 'baked') {
    console.log(
      `${indent}📦 Baked [${node.id}]: vertices=${node.vertices?.length ?? 0}, indices=${node.indices?.length ?? 0}`,
      node.localTransform,
    )
  }
}
