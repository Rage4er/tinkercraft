// ============================================================
// clip-instance — копия объекта: снимок (буфер) → новый объект + шаг истории
// ============================================================
// Общее ядро вставки (Ctrl+C / Ctrl+V) и массива (ARRAY-TOOL): одна логика копирования для
// примитива, зеркального примитива, импорта / 3D-текста и CSG (независимая копия дерева,
// CSG-INDEPENDENT-COPY). Копия ставится в мировой трансформ `transform` (вставка — со сдвигом,
// массив — экземпляр); узел Build Tree регистрируется здесь же.

import type {
  AddShapeOperation,
  ArrayCopyOperation,
  GroupOperation,
  ImportMeshOperation,
  SceneObject,
  TinkerCraftOperation,
  TransformNR,
} from '../csg/types'
import { workerBuildShape, workerBuildImportedMesh } from '../csg/worker-client'
import {
  createPrimitiveNode,
  createBakedNode,
  getNode,
  registerObjectInTree,
  snapshotSubtree,
  instantiateSubtree,
} from '../csg/history-tree'
import { makeObject, type ClipEntry } from './helpers'
import { isTextObject, textFromName } from './text-object'
import { findCreationTransform } from './edit-child'

/**
 * Снимок объекта для копии (буфер обмена / экземпляр массива). `history` — история до текущего
 * шага (для системы создания CSG). Неизвестный объект — null.
 */
export function clipOf(obj: SceneObject | undefined, history: TinkerCraftOperation[]): ClipEntry | null {
  if (!obj) return null
  const entry: ClipEntry = { shapeType: obj.shapeType, params: obj.params, color: obj.color, transform: obj.transform, mirrored: obj.mirrored }
  if (obj.shapeType === 'import_mesh') {
    // PERF-R8-1: Храним TypedArray вместо number[] для экономии памяти (8×)
    entry.importVertices = new Float32Array(obj.vertices)
    entry.importIndices = new Uint32Array(obj.indices)
    // UX-AUDIT-31: копия текста — тоже текст («Вставить текст», имя и строка — с собой)
    if (isTextObject(obj)) { entry.text = obj.text ?? textFromName(obj.name); entry.name = obj.name }
  } else if (obj.shapeType === 'csg') {
    // FIX (PASTE-CSG): Store CSG mesh data for paste
    entry.csgVertices = new Float32Array(obj.vertices)
    entry.csgIndices = new Uint32Array(obj.indices)
    entry.csgNormals = obj.normals ? new Float32Array(obj.normals) : undefined
    entry.csgAABB = obj.aabb ? { min: { ...obj.aabb.min }, max: { ...obj.aabb.max } } : undefined
    entry.csgOriginalBboxSize = obj.originalBboxSize ? { ...obj.originalBboxSize } : undefined
    // CSG-INDEPENDENT-COPY: снимок дерева + система создания — вставка станет
    // независимой параметрической копией. Нет дерева/системы — вставка мешем (как раньше).
    const origin = getNode(obj.id)?.type === 'boolean' ? findCreationTransform(history, obj.id) : null
    if (origin) entry.csgTree = { sourceRootId: obj.id, nodes: snapshotSubtree(obj.id), origin }
  } else if (obj.mirrored) {
    // FIX (8.5.12): mirror primitive — copy vertices (mirror baked) + mirrored flag.
    // Paste will register as baked node with vertices from clip.
    entry.mirrorVertices = new Float32Array(obj.vertices)
    entry.mirrorIndices = new Uint32Array(obj.indices)
    entry.mirrorNormals = obj.normals ? new Float32Array(obj.normals) : undefined
  }
  return entry
}

/**
 * Новый объект `id` из снимка `clip` в мировом трансформе `transform`: меш (воркер), шаг истории
 * (как у вставки, `pasted`) и узел Build Tree. Ошибка воркера — исключение (вызывающий чистит).
 */
export async function instantiateClip(
  clip: ClipEntry,
  id: string,
  transform: TransformNR,
): Promise<{ obj: SceneObject; op: ArrayCopyOperation }> {
  if (clip.shapeType === 'import_mesh' && clip.importVertices && clip.importIndices) {
    const result = await workerBuildImportedMesh(id, clip.importVertices, clip.importIndices)
    // UX-AUDIT-31: копия текста — текст (строка и имя у объекта и шага)
    const textName = clip.name ?? 'pasted'
    const obj: SceneObject = makeObject({ id, shapeType: 'import_mesh', params: {}, color: clip.color, transform, visible: true, locked: false, vertices: result.vertices, indices: result.indices, ...(clip.text !== undefined ? { text: clip.text, name: textName } : {}) })
    const op: ImportMeshOperation = { type: 'import_mesh', id, name: clip.text !== undefined ? textName : 'pasted', color: clip.color, transform, vertices: clip.importVertices, indices: clip.importIndices, pasted: true, ...(clip.text !== undefined ? { text: clip.text } : {}) }
    // Register baked node in build tree for CSG/mirror/align support
    createBakedNode(id, result.vertices, result.indices, result.normals ?? null, transform)
    return { obj, op }
  }
  if (clip.shapeType === 'csg' && clip.csgVertices && clip.csgIndices) {
    // FIX (PASTE-CSG): Paste CSG results with their mesh data instead of recreating as primitives
    const obj: SceneObject = makeObject({
      id, shapeType: 'csg', params: {}, color: clip.color,
      transform, visible: true, locked: false,
      vertices: clip.csgVertices, indices: clip.csgIndices,
      normals: clip.csgNormals, aabb: clip.csgAABB,
      originalBboxSize: clip.csgOriginalBboxSize,
    })
    const op: GroupOperation = {
      type: 'group', ids: [], resultId: id,
      resultVertices: clip.csgVertices, resultIndices: clip.csgIndices,
      resultNormals: clip.csgNormals, resultCenter: { x: transform.x, y: transform.y, z: transform.z },
      // PASTE-CSG-RS: вершины CSG — без RS (8.5.9), полный TRS вставки — в истории
      // (иначе после перемотки/загрузки вставленный повёрнутый CSG терял поворот/масштаб)
      resultRotation: { x: transform.rotX, y: transform.rotY, z: transform.rotZ },
      resultScale: { x: transform.scaleX, y: transform.scaleY, z: transform.scaleZ },
      originalBboxSize: clip.csgOriginalBboxSize,
      treeOperation: 'union', shapeType: 'csg', color: clip.color,
      pasted: true,   // UX-AUDIT-13: в истории «Вставить CSG»
    }
    if (clip.csgTree) {
      op.copyTree = clip.csgTree
      // CSG-INDEPENDENT-COPY: своё дерево копии (узлы `${id}:${idИсточника}`)
      instantiateSubtree(clip.csgTree.nodes, clip.csgTree.sourceRootId, id, transform, clip.csgTree.origin)
    } else {
      // Старый буфер без дерева — запечённый меш
      createBakedNode(id, clip.csgVertices, clip.csgIndices, clip.csgNormals ?? null, transform)
    }
    return { obj, op }
  }
  const op: AddShapeOperation = { type: 'add_shape', id, shapeType: clip.shapeType, params: clip.params, color: clip.color, transform, pasted: true }
  if (clip.mirrored && clip.mirrorVertices && clip.mirrorIndices) {
    // FIX (8.5.12): Paste mirror primitive — use baked vertices (mirror baked),
    // preserve mirrored flag (multi-level mirror composition).
    const obj: SceneObject = makeObject({
      id, shapeType: clip.shapeType, params: clip.params, color: clip.color,
      transform, visible: true, locked: false,
      vertices: clip.mirrorVertices, indices: clip.mirrorIndices,
      normals: clip.mirrorNormals, mirrored: clip.mirrored,
    })
    // Фаза 9.8: зеркальный примитив — primitive + mirrored (params редактируемы)
    registerObjectInTree(id, obj)
    return { obj, op }
  }
  const mesh = await workerBuildShape(id, clip.shapeType, clip.params, transform)
  const obj: SceneObject = makeObject({ id, shapeType: clip.shapeType, params: clip.params, color: clip.color, transform, visible: true, locked: false, vertices: mesh.vertices, indices: mesh.indices, normals: mesh.normals })
  // Register primitive node in build tree for CSG/mirror/align support
  createPrimitiveNode(id, clip.shapeType, clip.params, transform)
  return { obj, op }
}
