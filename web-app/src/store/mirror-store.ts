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
// 3. Для primitive: resetSubtreeTransform + rebuildNode + mirrorVerticesInPlace
//    Для CSG/import: mirrorTreeNode (отражает все nodы) + reset root to identity + rebuildNode
// 4. mirrorPoint/mirrorEuler → вычисляем отражённую позицию/поворот
// 5. Создаём SceneObject с transform = {mirroredPos, mirroredRot, abs(scale)}
//    Для primitive — сохраняем shapeType/params (остаются редактируемыми)
//    Для CSG/import — shapeType: 'import_mesh' (baked)
//
// FIX (MIRROR-INNER-CSG): Воркер применяет localTransform для внутренних boolean-нод
// после центрирования, чтобы они оказались на правильной позиции для внешнего CSG.
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
    mirrorTreeNode,
    mirrorVerticesInPlace,
    mirrorPoint,
    mirrorEuler,
    logMirrorTreeSnapshot,
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

    // isPrimitive: непустые params — объект можно перестроить из параметров
    // Для CSG-результатов params = {} → не примитив
    const isPrimitive =
        obj.shapeType &&
        obj.shapeType !== 'import_mesh' &&
        obj.params &&
        Object.keys(obj.params).length > 0

    let vertices: Float32Array
    let indices: Uint32Array
    let normals: Float32Array | null

    if (isPrimitive) {
        // ── Primitive ──────────────────────────────────────────────────────────
        // ensureInTree создаёт primitive-ноду (не boolean), resetSubtreeTransform
        // сбрасывает только эту одну ноду к identity, rebuildNode строит геометрию
        // в origin, mirrorVerticesInPlace отражает вершины.

        // 1. Регистрируем оригинал в дереве
        ensureInTree(id, obj)
        syncNodeTransform(id, obj.transform)

        // 2. Клонируем и обнуляем transform у клона (геометрия строится вокруг origin)
        cloneSubtree(id, newId)
        resetSubtreeTransform(newId)
        const rebuiltMesh = await rebuildNode(newId)

        vertices = rebuiltMesh.vertices
        indices = rebuiltMesh.indices
        normals = rebuiltMesh.normals ?? null

        // 3. Отражаем вершины (negate перпендикулярной оси) и исправляем winding order.
        //
        // FIX (MIRROR-WINDING): инвертирование одной оси позиций переворачивает CCW→CW.
        // Manifold-3d определяет «снаружи/внутри» по winding order — вывернутый меш
        // делает булевы операции неработоспособными.
        mirrorVerticesInPlace(vertices, normals, plane)
        for (let i = 0; i < indices.length; i += 3) {
            const tmp = indices[i + 1]
            indices[i + 1] = indices[i + 2]
            indices[i + 2] = tmp
        }

        deleteNode(newId, true)
    } else {
        // ── CSG-результат или import ───────────────────────────────────────────
        //
        // Для CSG-результатов используем tree-rebuild: клонируем поддерево,
        // зеркалим позиции дочерних примитивов, пересобираем CSG через manifold.
        // Это сохраняет параметричность дерева.
        //
        // Дочерние примитивы в дереве всегда синхронизированы с текущим положением
        // CSG-объекта в сцене: moveObject транслирует их при каждом перемещении
        // (см. FIX MIRROR-SYNC-TREE в document-store.ts). Поэтому tree-rebuild
        // даёт геометрию, точно соответствующую визуальному положению объекта.
        //
        // Для import_mesh (нет дерева) — baked-путь через ensureInTree/cloneSubtree
        // создаёт baked-ноду, mirrorNodeRecursive зеркалит вершины и transform.

        // 1. Регистрируем оригинал в дереве (если ещё не зарегистрирован)
        ensureInTree(id, obj)
        syncNodeTransform(id, obj.transform)
        logMirrorTreeSnapshot(id, 'source-before-clone')

        // 2. Клонируем поддерево
        const idMap = new Map<string, string>()
        cloneSubtree(id, newId, idMap)
        logMirrorTreeSnapshot(newId, `clone-before-mirror source=${id}`)

        // 3. Зеркалим всё поддерево (примитивы + inner boolean localTransforms)
        mirrorTreeNode(newId, plane)
        logMirrorTreeSnapshot(newId, `clone-after-mirror plane=${plane} source=${id}`)

        // 4. Сбрасываем root в identity → rebuildNode вернёт центрированную геометрию
        //    (translation-only shape, без rotation/scale — они применяются через
        //    Viewport3D pivot). Inner boolean localTransforms применяются воркером.
        syncNodeTransform(newId, {
            x: 0, y: 0, z: 0,
            rotX: 0, rotY: 0, rotZ: 0,
            scaleX: 1, scaleY: 1, scaleZ: 1,
        })
        logMirrorTreeSnapshot(newId, `clone-before-rebuild plane=${plane} source=${id}`)

        const rebuiltMesh = await rebuildNode(newId)
        deleteNode(newId, true)

        vertices = rebuiltMesh.vertices
        indices = rebuiltMesh.indices
        normals = rebuiltMesh.normals ?? null
    }

    // Вычисляем отражённую позицию и поворот для SceneObject.transform.
    // Геометрия центрирована в origin; Viewport3D применяет TRS через pivot.
    // Children positions в дереве — translation-only (moveObject синхронизирует
    // только translation, rotation/scale — render-time через Viewport3D).
    // Поэтому центрированный CSG результат имеет правильную форму (translation-only),
    // и mirrored TRS применяется Viewport3D как для обычного CSG-объекта.
    const mirroredPos = mirrorPoint(
        { x: obj.transform.x, y: obj.transform.y, z: obj.transform.z },
        plane,
    )

    // FIX (MIRROR-ROT): без отражения поворота повёрнутый объект выглядит как копия, а не зеркало.
    // mirrorEuler инвертирует оси, лежащие в плоскости зеркала; перпендикулярная ось не меняется.
    // Это НЕ двойное отражение: вершины центрированы (translation-only shape),
    // поворот не запечён — применяется через pivot в Viewport3D.
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
            rotX: mirroredRot.x,
            rotY: mirroredRot.y,
            rotZ: mirroredRot.z,
            // Scale всегда положительный (abs), геометрия отражена через позиции/повороты в дереве
            scaleX: Math.abs(obj.transform.scaleX),
            scaleY: Math.abs(obj.transform.scaleY),
            scaleZ: Math.abs(obj.transform.scaleZ),
        },
        vertices,
        indices,
        normals,
        color: obj.color,
        visible: obj.visible ?? true,
        locked: obj.locked ?? false,
        name: obj.name,
    }

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

        // Исправление MIRROR-19-2: preview для multi-select
        // Работаем со всеми выделенными объектами, а не только с первым
        const results: SceneObject[] = []
        for (const id of ids) {
            const obj = objects[id]
            if (!obj) continue

            const result = await mirrorObject(obj, plane)
            results.push(result.object)
        }

        // Если нет объектов для зеркала, возвращаем null
        if (results.length === 0) return null

        // Если один объект, возвращаем его напрямую (старое поведение)
        if (results.length === 1) return results[0]

        // Если несколько объектов, объединяем их геометрию
        // Объединяем вершины, индексы и нормали всех объектов
        let totalVertices: number[] = []
        let totalIndices: number[] = []
        let totalNormals: number[] = []
        let vertexOffset = 0

        for (const result of results) {
            // Добавляем вершины
            totalVertices = totalVertices.concat(Array.from(result.vertices))

            // Корректируем индексы с учетом смещения
            for (let i = 0; i < result.indices.length; i++) {
                totalIndices.push(result.indices[i] + vertexOffset)
            }

            // Добавляем нормали, если есть
            if (result.normals) {
                totalNormals = totalNormals.concat(Array.from(result.normals))
            }

            // Обновляем смещение для следующего объекта
            vertexOffset += result.vertices.length / 3
        }

        // Создаем объединенный объект
        const mergedObject: SceneObject = {
            id: nextId(),
            shapeType: 'import_mesh',
            params: {},
            transform: {
                x: 0, y: 0, z: 0,
                rotX: 0, rotY: 0, rotZ: 0,
                scaleX: 1, scaleY: 1, scaleZ: 1
            },
            vertices: new Float32Array(totalVertices),
            indices: new Uint32Array(totalIndices),
            normals: totalNormals.length > 0 ? new Float32Array(totalNormals) : null,
            color: results[0].color, // Берем цвет первого объекта
            visible: true,
            locked: false,
            name: "Multi-mirror preview"
        }

        return mergedObject
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
