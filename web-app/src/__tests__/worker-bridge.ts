// ============================================================
// Worker Bridge — интеграционные тесты Фазы 8 (jsdom)
// ============================================================
//
// jsdom не имеет транспорта Web Worker, но сам manifold-3d WASM
// работает в node/vitest (проверено спайком: initWasm + handleCsgBooleanSync
// дают настоящий union). Мост заменяет ТОЛЬКО транспорт postMessage:
// функции клиента вызываются напрямую в настоящих worker-handlers,
// ответы перехватываются из self.postMessage по reqId.
//
// Это честная интеграция: реальная CSG-математика manifold, реальные
// центрирования (centerMassAtOrigin), реальные handlers, реальный store.
// Не мокается NOTHING из csg/worker-handlers.ts и csg/geometry-utils.ts.

import {
  initWasm,
  handleBuildShape,
  handleApplyFillet,
  handleBuildImportedMesh,
  handleCsgBoolean,
  handleCsgBooleanSync,
  handleMirrorObject,
  handleRebuildScene,
  handleSyncObjects,
  handleSyncMesh,
  handleRebuildTreeNode,
  disposeCached,
  disposeAllCached,
  safePostMessage,
} from '../csg/worker-handlers'
import type { MeshResult, SceneMeshResult } from '../csg/worker-client'
import type { ShapeType, ShapeParams, TransformNR } from '../csg/types'

type BridgeMsg = { reqId: string; type: string; [k: string]: unknown }

const pending = new Map<string, (m: BridgeMsg) => void>()
let seq = 0
let wasmReady: Promise<void> | null = null

/**
 * jsdom: window.postMessage(message, targetOrigin) — вызов из safePostMessage
 * с transferList падает. Подменяем транспорт синхронным роутером по reqId.
 */
function installTransport(): void {
  ;(globalThis as Record<string, unknown>).postMessage = (msg: BridgeMsg) => {
    if (msg && typeof msg.reqId === 'string' && pending.has(msg.reqId)) {
      const cb = pending.get(msg.reqId)!
      pending.delete(msg.reqId)
      cb(msg)
    }
  }
}

/** Диспетчер — зеркалит switch из csg/worker.ts (включая deleteObjects/clearAll). */
async function dispatch(msg: BridgeMsg): Promise<void> {
  switch (msg.type) {
    case 'buildShape': await handleBuildShape(msg as never); break
    case 'applyFillet': await handleApplyFillet(msg as never); break
    case 'buildImportedMesh': await handleBuildImportedMesh(msg as never); break
    case 'csgBoolean': await handleCsgBoolean(msg as never); break
    case 'csgBooleanSync': await handleCsgBooleanSync(msg as never); break
    case 'mirrorObject': await handleMirrorObject(msg as never); break
    case 'rebuildScene': await handleRebuildScene(msg as never); break
    case 'syncObjects': await handleSyncObjects(msg as never); break
    case 'syncMesh': await handleSyncMesh(msg as never); break
    case 'rebuildTreeNode': await handleRebuildTreeNode(msg as never); break
    case 'deleteObjects':
      for (const id of (msg.ids as string[]) ?? []) disposeCached(id)
      safePostMessage({ reqId: msg.reqId, type: 'ok' })
      break
    case 'clearAll':
      disposeAllCached()
      safePostMessage({ reqId: msg.reqId, type: 'ok' })
      break
    default:
      safePostMessage({ reqId: msg.reqId, type: 'error', message: `Unknown: ${msg.type}` })
  }
}

/** Один «поход в воркер»: reqId → ожидание ответа с тем же reqId. */
async function call(type: string, fields: Record<string, unknown>): Promise<BridgeMsg> {
  if (!wasmReady) {
    installTransport()
    wasmReady = initWasm()
  }
  await wasmReady
  const reqId = `bridge-${++seq}`
  const msg: BridgeMsg = { reqId, type, ...fields }
  const response = new Promise<BridgeMsg>((resolve) => pending.set(reqId, resolve))
  try {
    await dispatch(msg)
  } catch (e) {
    // Как worker.ts: ошибка хендлера → error-ответ с reqId
    safePostMessage({ reqId, type: 'error', message: String(e) })
  }
  const resp = await response
  if (resp.type === 'error') throw new Error(`worker ${type} failed: ${String(resp.message)}`)
  return resp
}

function toMeshResult(resp: BridgeMsg): MeshResult {
  return {
    objId: resp.objId as string,
    vertices: resp.vertices as Float32Array,
    indices: resp.indices as Uint32Array,
    normals: (resp.normals as Float32Array | null) ?? null,
    tris: resp.tris as number,
    ms: resp.ms as number,
  }
}

// ---- Публичный API — сигнатуры 1-в-1 как у csg/worker-client.ts ----

export async function workerBuildShape(
  objId: string, shapeType: ShapeType, params: ShapeParams, transform: TransformNR,
): Promise<MeshResult> {
  return toMeshResult(await call('buildShape', { objId, shapeType, params, transform }))
}

export async function workerApplyFillet(
  objId: string, shapeType: ShapeType, params: ShapeParams, radius: number, transform: TransformNR,
): Promise<MeshResult> {
  return toMeshResult(await call('applyFillet', { objId, shapeType, params, radius, transform }))
}

export async function workerBuildImportedMesh(
  objId: string, vertices: Float32Array | number[], indices: Uint32Array | number[],
): Promise<MeshResult> {
  return toMeshResult(await call('buildImportedMesh', { objId, vertices, indices }))
}

export async function workerSyncObjects(
  entries: Array<{ objId: string; shapeType: ShapeType; params: ShapeParams; transform: TransformNR }>,
): Promise<void> {
  await call('syncObjects', { entries })
}

export async function workerSyncMesh(
  objId: string, vertices: Float32Array | number[], indices: Uint32Array | number[], transform?: TransformNR,
): Promise<void> {
  await call('syncMesh', {
    objId, vertices, indices,
    transform: transform ?? { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 },
  })
}

export async function workerCsgBoolean(
  idA: string, idB: string, op: 'union' | 'subtract' | 'intersect', resultId: string,
  transformA?: TransformNR, transformB?: TransformNR,
): Promise<MeshResult> {
  return toMeshResult(await call('csgBoolean', { idA, idB, op, resultId, transformA, transformB }))
}

export async function workerCsgBooleanWithSync(
  idA: string, idB: string, op: 'union' | 'subtract' | 'intersect', resultId: string,
  transformA: TransformNR, transformB: TransformNR,
  shapeA?: { shapeType: ShapeType; params: ShapeParams },
  shapeB?: { shapeType: ShapeType; params: ShapeParams },
): Promise<MeshResult> {
  return toMeshResult(await call('csgBooleanSync', { idA, idB, op, resultId, transformA, transformB, shapeA, shapeB }))
}

export async function workerMirrorObject(
  objId: string, plane: 'XY' | 'XZ' | 'YZ', shapeType?: string, params?: Record<string, number>,
  transform?: TransformNR, mirrorCenter?: { x: number; y: number; z: number },
): Promise<MeshResult> {
  return toMeshResult(await call('mirrorObject', { objId, plane, shapeType, params, transform, mirrorCenter }))
}

export async function workerRebuildScene(operations: unknown[]): Promise<SceneMeshResult> {
  const resp = await call('rebuildScene', { operations })
  return { results: resp.results as MeshResult[], ms: resp.ms as number }
}

export async function workerDeleteObjects(ids: string[]): Promise<void> {
  await call('deleteObjects', { ids })
}

export async function workerClearAll(): Promise<void> {
  await call('clearAll', {})
}

export async function workerRebuildNode(
  nodeId: string,
  nodes: Array<{
    id: string
    type: 'primitive' | 'boolean' | 'baked'
    shapeType?: string
    params?: Record<string, number>
    localTransform?: TransformNR
    vertices?: number[]
    indices?: number[]
    normals?: number[]
    operation?: 'union' | 'subtract' | 'intersect'
    children?: string[]
  }>,
): Promise<MeshResult> {
  return toMeshResult(await call('rebuildTreeNode', { nodeId, nodeCount: nodes.length, nodes }))
}

export function isWorkerReady(): boolean { return true }
export function disposeWorker(): void { /* no-op: транспорта нет */ }
