// ============================================================
// MirrorStore — вся логика зеркала в одном месте
// ============================================================
//
// Единый метод mirrorObject для preview и confirm.
// Preview = mirrorObject + прозрачность.
// Confirm = mirrorObject + фиксация в истории.
//
// Алгоритм для ВСЕХ типов объектов:
// 1. ensureInTree + syncNodeTransform → регистрация в build tree
// 2. cloneSubtree → копируем дерево
// 3. resetSubtreeTransform → обнуляем transform у клона (identity)
// 4. rebuildNode → перестраиваем геометрию с transform=identity
// 5. mirrorVerticesInPlace → отражаем вершины (negate перпендикулярной оси)
// 6. mirrorPoint → вычисляем отражённую позицию
// 7. Создаём SceneObject с transform = {mirrorPoint, оригинальные rot/scale}
//    Rotation/scale НЕ отражаются — геометрия уже отражена в вершинах,
//    а rotation/scale применяются через pivot в Viewport3D.
//    Если бы мы отразили rotation/scale, было бы двойное отражение.
// 8. Для primitive — сохраняем shapeType/params (остаются редактируемыми)
//    Для CSG/import — shapeType: 'import_mesh' (baked)
// ============================================================

import type { TransformNR, SceneObject, ShapeType, ShapeParams } from '../csg/types'
import { nextId } from './helpers'
import { notify } from './notifications'
import {
    getNode,
    createPrimitiveNode,
    createBakedNode,
    syncNodeTransform,
    cloneSubtree,
    rebuildNode,
    deleteNode,
    resetSubtreeTransform,
    mirrorVerticesInPlace,
    mirrorPoint,
    mirrorEuler,
} from '../csg/history-tree'
import { workerSyncObjects, workerSyncMesh } from '../csg/worker-client'

// ── Типы ──

export interface MirrorResult {
    object: SceneObject
    id: string
}

// ── Синхронизация объектов с воркером ──

async function syncObjectsForOperation(
    ids: string[],
    objects: Record<string, SceneObject>,
): Promise<void> {
    const meshSyncs: Promise<void>[] = []
    const regularEntries: { objId: string; shapeType: ShapeType; params: ShapeParams; transform: TransformNR }[] = []

    for (const id of ids) {
        const obj = objects[id]
        if (!obj) continue

        const isImport = obj.shapeType === 'import_mesh'
        // FIX (MIRROR-CSG-DETECT): прежняя проверка `shapeType==='cube' && !params.width`
        // слишком узкая — CSG-результат может иметь любой shapeType-заглушку.
        // Надёжный признак CSG/baked: нет params или params пустой объект.
        const isCsgResult = !isImport && (!obj.params || Object.keys(obj.params).length === 0)

        if (isCsgResult || isImport) {
            meshSyncs.push(
                workerSyncMesh(id, obj.vertices, obj.indices, obj.transform)
                    .catch(e => console.warn('[Mirror] workerSyncMesh failed:', e)),
            )
        } else if (obj.shapeType && obj.params) {
            regularEntries.push({
                objId: id,
                shapeType: obj.shapeType as ShapeType,
                params: obj.params,
                transform: { ...obj.transform },
            })
        }
    }

    await Promise.all(meshSyncs)

    if (regularEntries.length > 0) {
        await workerSyncObjects(regularEntries)
            .catch(e => console.warn('[Mirror] workerSyncObjects failed:', e))
    }
}

// ── Регистрация объекта в build tree ──

function ensureInTree(id: string, obj: SceneObject): void {
    if (getNode(id) !== undefined) return

    if (obj.shapeType && obj.params && obj.shapeType !== 'import_mesh') {
        createPrimitiveNode(id, obj.shapeType, obj.params, obj.transform)
    } else {
        createBakedNode(
            id,
            obj.vertices || new Float32Array(),
            obj.indices || new Uint32Array(),
            obj.normals || null,
            obj.transform,
        )
    }
}

// ── Единый метод для preview и confirm ──

export async function mirrorObject(
    obj: SceneObject,
    plane: 'XY' | 'XZ' | 'YZ',
): Promise<MirrorResult> {
    const id = obj.id
    const newId = nextId()

    // 1. Регистрируем оригинал в дереве
    ensureInTree(id, obj)
    syncNodeTransform(id, obj.transform)

    // 2. Клонируем и обнуляем transform у клона
    //    Это нужно, чтобы rebuildNode не bake-ил transform в вершины.
    //    После resetSubtreeTransform геометрия строится вокруг origin,
    //    mirrorVerticesInPlace отражает её.
    cloneSubtree(id, newId)
    resetSubtreeTransform(newId)
    const rebuiltMesh = await rebuildNode(newId)

    // 3. Отражаем вершины (negate перпендикулярной оси) и исправляем winding order.
    //
    // FIX (MIRROR-WINDING): инвертирование одной оси позиций переворачивает порядок обхода
    // треугольников CCW→CW. Manifold-3d определяет «снаружи/внутри» по winding order,
    // поэтому вывернутый меш делает булевы операции неработоспособными.
    // Решение: после отражения вершин — переставить v1↔v2 в каждом треугольнике.
    mirrorVerticesInPlace(rebuiltMesh.vertices, rebuiltMesh.normals, plane)
    // Исправляем winding: меняем местами второй и третий индексы каждого треугольника
    for (let i = 0; i < rebuiltMesh.indices.length; i += 3) {
        const tmp = rebuiltMesh.indices[i + 1]
        rebuiltMesh.indices[i + 1] = rebuiltMesh.indices[i + 2]
        rebuiltMesh.indices[i + 2] = tmp
    }

    // 4. Вычисляем отражённую позицию (mirrorPoint)
    //    Геометрия строится с identity-трансформацией (resetSubtreeTransform),
    //    поэтому поворот/scale НЕ запечены в вершины — они применяются через pivot в Viewport3D.
    //    Это означает, что rotation И scale нужно зеркалить явно (шаг 5).
    const mirroredPos = mirrorPoint(
        { x: obj.transform.x, y: obj.transform.y, z: obj.transform.z },
        plane,
    )

    // 5. Для primitive сохраняем shapeType/params (остаются редактируемыми)
    //    Для CSG/import: shapeType: 'import_mesh' (baked)
    //    isPrimitive требует непустые params — CSG-результат имеет shapeType='cube' с {} и не должен
    //    считаться примитивом, иначе пользователь получает объект с обнулёнными параметрами.
    const isPrimitive =
        obj.shapeType &&
        obj.shapeType !== 'import_mesh' &&
        obj.params &&
        Object.keys(obj.params).length > 0

    // Применяем зеркальное отражение поворота через mirrorEuler.
    // FIX (MIRROR-ROT): без отражения поворота повёрнутые объекты выглядят как копии, а не зеркало.
    // mirrorEuler корректно инвертирует оси, лежащие в плоскости зеркала; перпендикулярная ось не меняется.
    // Это НЕ двойное отражение: вершины строятся с identity-трансформацией (resetSubtreeTransform),
    // поэтому поворот не запечён в вершины — он применяется только через pivot в Viewport3D.
    const mirroredRot = mirrorEuler(
        { x: obj.transform.rotX, y: obj.transform.rotY, z: obj.transform.rotZ },
        plane,
    )

    const newObj: SceneObject = {
        id: newId,
        shapeType: (isPrimitive ? obj.shapeType : 'import_mesh') as ShapeType,
        params: (isPrimitive ? { ...obj.params } : {}) as ShapeParams,
        transform: {
            x: Math.round(mirroredPos.x * 1e6) / 1e6,
            y: Math.round(mirroredPos.y * 1e6) / 1e6,
            z: Math.round(mirroredPos.z * 1e6) / 1e6,
            // Поворот отражается через mirrorEuler — это исправляет "зеркало = копия" для повёрнутых объектов
            rotX: mirroredRot.x,
            rotY: mirroredRot.y,
            rotZ: mirroredRot.z,
            // Scale всегда положительный (abs), геометрия уже отражена на уровне вершин
            scaleX: Math.abs(obj.transform.scaleX),
            scaleY: Math.abs(obj.transform.scaleY),
            scaleZ: Math.abs(obj.transform.scaleZ),
        },
        vertices: rebuiltMesh.vertices,
        indices: rebuiltMesh.indices,
        normals: rebuiltMesh.normals ?? null,
        color: obj.color,
        visible: obj.visible ?? true,
        locked: obj.locked ?? false,
        name: obj.name,
    }

    // 6. Очищаем временную ноду
    deleteNode(newId, true)

    return { object: newObj, id: newId }
}

// ── Preview зеркала ──

export async function previewMirror(
    plane: 'XY' | 'XZ' | 'YZ',
    ids: string[],
    objects: Record<string, SceneObject>,
): Promise<SceneObject | null> {
    console.log(`[MIRROR:previewMirror] plane=${plane} ids=${JSON.stringify(ids)}`)
    if (ids.length === 0) {
        console.log('[MIRROR:previewMirror] no ids, returning null')
        return null
    }

    try {
        await syncObjectsForOperation(ids, objects)

        const id = ids[0]
        const obj = objects[id]
        if (!obj) return null

        const result = await mirrorObject(obj, plane)
        return result.object
    } catch (e) {
        console.error('[Mirror] previewMirror error:', e)
        return null
    }
}

// ── Confirm зеркала ──

export async function mirrorSelected(
    plane: 'XY' | 'XZ' | 'YZ',
    ids: string[],
    objects: Record<string, SceneObject>,
): Promise<{ newObjects: Record<string, SceneObject>; newIds: string[]; operation: { type: 'mirror'; originalIds: string[]; ids: string[]; plane: 'XY' | 'XZ' | 'YZ' } } | null> {
    console.log(`[MIRROR:mirrorSelected] plane=${plane} ids=${JSON.stringify(ids)}`)
    if (ids.length === 0) {
        console.log('[MIRROR:mirrorSelected] no ids, returning null')
        return null
    }

    try {
        await syncObjectsForOperation(ids, objects)

        const newObjects: Record<string, SceneObject> = {}
        const newIds: string[] = []
        const originalIds: string[] = []

        for (const id of ids) {
            originalIds.push(id)
            const obj = objects[id]
            if (!obj) continue

            const result = await mirrorObject(obj, plane)
            newObjects[result.id] = result.object
            newIds.push(result.id)
        }

        return {
            newObjects,
            newIds,
            operation: { type: 'mirror', originalIds, ids: newIds, plane },
        }
    } catch (e) {
        console.error('[Mirror] mirrorSelected error:', e)
        notify('Ошибка зеркального отражения', 'error')
        return null
    }
}
