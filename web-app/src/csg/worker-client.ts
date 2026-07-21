// ============================================================
// Worker Client — Promise-обёртка над CSG Web Worker
// ============================================================

import type { CsgBooleanOp, ShapeType, ShapeParams, TransformNR } from './types'

export interface MeshResult {
  objId: string
  vertices: Float32Array
  indices: Uint32Array
  normals: Float32Array | null
  tris: number
  ms: number
}

export interface SceneMeshResult {
  results: MeshResult[]
  ms: number
}

type PendingResolve = (v: unknown) => void
type PendingReject = (r: unknown) => void

let _worker: Worker | null = null
let _ready = false
let _readyPromise: Promise<void> | null = null
const _pending = new Map<string, [PendingResolve, PendingReject]>()
let _reqCounter = 0

function nextReqId(): string { return `r${++_reqCounter}` }

/**
 * FIX (CRIT-R3-2): Safe worker initialization with handler pattern.
 * Replaces the _readyResolve pattern which could leak on hot-reload.
 * The ready promise is recreated on each call if _ready is false,
 * and the listener is removed after receiving the 'ready' message.
 */
function getReadyPromise(): Promise<void> {
  if (_ready) return Promise.resolve()
  if (!_readyPromise) {
    _readyPromise = new Promise<void>((resolve) => {
      const handler = (e: MessageEvent) => {
        if (e.data?.type === 'ready') {
          _ready = true
          _readyPromise = null
          _worker?.removeEventListener('message', handler)
          resolve()
        }
      }
      _worker?.addEventListener('message', handler)
    })
  }
  return _readyPromise
}

function getWorker(): Worker {
  if (_worker) return _worker

  _worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })

  _worker.addEventListener('message', (e: MessageEvent) => {
    const msg = e.data as { reqId?: string; type: string }

    // Ready message is handled by getReadyPromise() — skip here
    if (msg.type === 'ready') return

    if (!msg.reqId) return
    const entry = _pending.get(msg.reqId)
    if (!entry) return
    _pending.delete(msg.reqId)
    const [resolve, reject] = entry
    if (msg.type === 'error') reject(new Error((msg as unknown as { message: string }).message))
    else resolve(msg)
  })

  _worker.addEventListener('error', (e: ErrorEvent) => {
    console.error('[Worker]', e.message)
    for (const [, [, reject]] of _pending) reject(new Error(e.message))
    _pending.clear()
  })

  return _worker
}

function send<T>(type: string, data: Record<string, unknown>, timeoutMs = 30000): Promise<T> {
  return new Promise((resolve, reject) => {
    const reqId = nextReqId()
    
    // PERF-R8-2: Таймаут для предотвращения бесконечного ожидания
    const timer = setTimeout(() => {
      _pending.delete(reqId)
      reject(new Error(`Worker timeout: ${type} (>${timeoutMs}ms)`))
    }, timeoutMs)
    
    _pending.set(reqId, [
      (v: unknown) => {
        clearTimeout(timer)
        resolve(v as T)
      },
      (r: unknown) => {
        clearTimeout(timer)
        reject(r)
      }
    ])
    
    getWorker().postMessage({ reqId, type, ...data })
  })
}

async function waitReady(): Promise<void> {
  getWorker()
  const p = getReadyPromise()
  if (p) await p
}

// ---- Public API ----

export async function workerBuildShape(
  objId: string, shapeType: ShapeType, params: ShapeParams, transform: TransformNR,
): Promise<MeshResult> {
  await waitReady()
  return send<MeshResult>('buildShape', { objId, shapeType, params, transform })
}

export async function workerApplyFillet(
  objId: string, shapeType: ShapeType, params: ShapeParams, radius: number, transform: TransformNR,
): Promise<MeshResult> {
  await waitReady()
  return send<MeshResult>('applyFillet', { objId, shapeType, params, radius, transform })
}

export async function workerBuildImportedMesh(
  objId: string, vertices: Float32Array | number[], indices: Uint32Array | number[],
): Promise<MeshResult> {
  await waitReady()
  return send<MeshResult>('buildImportedMesh', { objId, vertices, indices })
}

/**
 * Rebuild objects in worker cache with current transforms.
 * Must be called before csgBoolean / mirrorObject to ensure worker cache
 * is in sync with the store (fixes "Objects not found" after undo/redo
 * and incorrect coordinates from stale cached positions).
 */
export async function workerSyncObjects(
  entries: Array<{
    objId: string
    shapeType: ShapeType
    params: ShapeParams
    transform: TransformNR
  }>,
): Promise<void> {
  await waitReady()
  await send<unknown>('syncObjects', { entries })
}

export async function workerSyncMesh(
  objId: string,
  vertices: Float32Array | number[],
  indices: Uint32Array | number[],
  transform?: TransformNR,
): Promise<void> {
  await waitReady()
  await send<unknown>('syncMesh', { objId, vertices, indices, transform: transform ?? { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 } })
}

export async function workerCsgBoolean(
  idA: string, idB: string, op: CsgBooleanOp, resultId: string,
  transformA?: { x: number; y: number; z: number; rotX: number; rotY: number; rotZ: number; scaleX: number; scaleY: number; scaleZ: number },
  transformB?: { x: number; y: number; z: number; rotX: number; rotY: number; rotZ: number; scaleX: number; scaleY: number; scaleZ: number },
): Promise<MeshResult> {
  await waitReady()
  return send<MeshResult>('csgBoolean', { idA, idB, op, resultId, transformA, transformB })
}

/**
 * Combined sync + CSG boolean in a single round-trip (PERF-R6-2).
 * Sends operand metadata so the worker can rebuild cache entries AND
 * perform the boolean in one message, avoiding a separate syncObjects call.
 */
export async function workerCsgBooleanWithSync(
  idA: string, idB: string, op: CsgBooleanOp, resultId: string,
  transformA: { x: number; y: number; z: number; rotX: number; rotY: number; rotZ: number; scaleX: number; scaleY: number; scaleZ: number },
  transformB: { x: number; y: number; z: number; rotX: number; rotY: number; rotZ: number; scaleX: number; scaleY: number; scaleZ: number },
  shapeA?: { shapeType: ShapeType; params: ShapeParams },
  shapeB?: { shapeType: ShapeType; params: ShapeParams },
): Promise<MeshResult> {
  await waitReady()
  return send<MeshResult>('csgBooleanSync', { idA, idB, op, resultId, transformA, transformB, shapeA, shapeB })
}

export async function workerMirrorObject(
  objId: string, plane: 'XY' | 'XZ' | 'YZ',
): Promise<MeshResult> {
  await waitReady()
  return send<MeshResult>('mirrorObject', { objId, plane })
}

export async function workerRebuildScene(
  operations: unknown[],
): Promise<SceneMeshResult> {
  await waitReady()
  return send<SceneMeshResult>('rebuildScene', { operations })
}

export async function workerDeleteObjects(ids: string[]): Promise<void> {
  await waitReady()
  await send<unknown>('deleteObjects', { ids })
}

export async function workerClearAll(): Promise<void> {
  await waitReady()
  await send<unknown>('clearAll', {})
}

export function isWorkerReady(): boolean { return _ready }

/**
 * PERF-R8-3: Terminate worker and cleanup state.
 * Used for HMR cleanup to prevent "ghost" workers accumulating.
 */
export function disposeWorker(): void {
  if (_worker) {
    _worker.terminate()
    _worker = null
    _ready = false
    _readyPromise = null
    _pending.clear()
  }
}
