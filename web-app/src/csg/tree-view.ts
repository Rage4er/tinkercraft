// src/csg/tree-view.ts — read-модель Build Tree для UI (Фаза 9.1)
//
// treeStore — не реактивный Map-синглтон, поэтому UI не читает TreeNode напрямую:
// getTreeView() строит снимок поддерева (plain-объекты), который компонент
// пересчитывает при смене `objects` (дерево мутируется ДО set() в сторе).
import type { ShapeParams, ShapeType, TreeNode } from './types'
import { getNode } from './history-tree'

/** Почему узел нельзя редактировать (null — можно). */
export type NotEditableReason = 'boolean' | 'baked' | 'mirrored' | null

export interface TreeViewNode {
  id: string
  type: TreeNode['type']
  shapeType?: ShapeType
  params?: ShapeParams
  operation?: TreeNode['operation']
  /** Зеркальный примитив (запечён с отражёнными вершинами) — params не применимы. */
  mirrored: boolean
  /** Можно ли править params (9.2): только живой примитив с params. */
  editable: boolean
  notEditableReason: NotEditableReason
  children: TreeViewNode[]
}

/** Защита от цикла/патологической глубины (BUILD_TREE_SPEC §9). */
const MAX_DEPTH = 32

function buildView(id: string, depth: number, seen: Set<string>): TreeViewNode | null {
  if (depth > MAX_DEPTH || seen.has(id)) return null
  const node = getNode(id)
  if (!node) return null
  seen.add(id)

  const mirrored = node.type === 'baked' && node.mirroredPlane !== undefined
  const editable = node.type === 'primitive' && node.params !== undefined
  const notEditableReason: NotEditableReason = editable
    ? null
    : node.type === 'boolean'
      ? 'boolean'
      : mirrored
        ? 'mirrored'
        : 'baked'

  const children: TreeViewNode[] = []
  if (node.type === 'boolean' && node.children) {
    for (const childId of node.children) {
      const child = buildView(childId, depth + 1, seen)
      if (child) children.push(child)
    }
  }
  seen.delete(id)

  return {
    id,
    type: node.type,
    shapeType: node.shapeType,
    // копия: UI не должен мутировать params дерева (снимки хранят ссылки)
    params: node.params ? { ...node.params } : undefined,
    operation: node.operation,
    mirrored,
    editable,
    notEditableReason,
    children,
  }
}

/**
 * Поддерево CSG-результата. null — если узла нет или это не boolean
 * (примитив/запечённый меш/вставленная копия без детей → раскрывать нечего).
 */
export function getTreeView(rootId: string): TreeViewNode | null {
  const node = getNode(rootId)
  if (!node || node.type !== 'boolean') return null
  return buildView(rootId, 0, new Set())
}

/** Найти узел по id в уже построенном снимке (или null). */
export function findViewNode(root: TreeViewNode, nodeId: string): TreeViewNode | null {
  if (root.id === nodeId) return root
  for (const child of root.children) {
    const found = findViewNode(child, nodeId)
    if (found) return found
  }
  return null
}

/** Где живёт узел: корень-объект сцены и boolean-предки, которые надо раскрыть. */
export interface NodeLocation {
  rootId: string
  /** id раскрываемых узлов от корня до непосредственного родителя цели (включая корень) */
  ancestors: string[]
}

function findPath(view: TreeViewNode, nodeId: string, trail: string[]): string[] | null {
  if (view.id === nodeId) return trail
  for (const child of view.children) {
    const found = findPath(child, nodeId, [...trail, view.id])
    if (found) return found
  }
  return null
}

/**
 * Найти CSG-корень, в чьём дереве лежит узел (Timeline → «править», Фаза 9.4).
 * `csgRootIds` — id объектов сцены с shapeType 'csg'.
 */
export function locateNode(csgRootIds: string[], nodeId: string): NodeLocation | null {
  for (const rootId of csgRootIds) {
    const view = getTreeView(rootId)
    if (!view || view.id === nodeId) continue
    const ancestors = findPath(view, nodeId, [])
    if (ancestors) return { rootId, ancestors }
  }
  return null
}

const PARAM_LABELS: Array<[keyof ShapeParams, string]> = [
  ['width', 'W'],
  ['height', 'H'],
  ['depth', 'D'],
  ['radius', 'R'],
  ['torusRadius', 'R'],
  ['tubeRadius', 'r'],
  ['sides', 'n'],
]

/** Краткая сводка параметров для строки дерева: «W20 H20 D20». */
export function formatParams(params: ShapeParams | undefined): string {
  if (!params) return ''
  const parts: string[] = []
  for (const [key, label] of PARAM_LABELS) {
    const v = params[key]
    if (typeof v === 'number') parts.push(`${label}${Math.round(v * 100) / 100}`)
  }
  return parts.join(' ')
}
