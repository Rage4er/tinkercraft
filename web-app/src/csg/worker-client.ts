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
type PendingReject  = (r: unknown) => void

let _worker: Worker | null = null
let _ready = false
let _readyResolve: (() => void) | null = null
const _readyPromise = new Promise<void>(res => { _readyResolve = res })
const _pending = new Map<string, [PendingResolve, PendingReject]>()
let _reqCounter = 0

function nextReqId(): string { return `r${++_reqCounter}` }

function getWorker(): Worker {
  if (_worker) return _worker

  _worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })

  _worker.addEventListener('message', (e: MessageEvent) => {
    const msg = e.data as { reqId?: string; type: string }

    if (msg.type === 'ready') {
      _ready = true
      _readyResolve?.()
      return
    }
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

function send<T>(type: string, data: Record<string, unknown>): Promise<T> {
  return new Promise((resolve, reject) => {
    const reqId = nextReqId()
    _pending.set(reqId, [resolve as PendingResolve, reject])
    getWorker().postMessage({ reqId, type, ...data })
  })
}

async function waitReady(): Promise<void> {
  getWorker()
  if (_ready) return
  return _readyPromise
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
  objId: string, vertices: number[], indices: number[],
): Promise<MeshResult> {
  await waitReady()
  return send<MeshResult>('buildImportedMesh', { objId, vertices, indices })
}

export async function workerCsgBoolean(
  idA: string, idB: string, op: CsgBooleanOp, resultId: string,
  transformA?: { x: number; y: number; z: number; rotX: number; rotY: number; rotZ: number; scaleX: number; scaleY: number; scaleZ: number },
  transformB?: { x: number; y: number; z: number; rotX: number; rotY: number; rotZ: number; scaleX: number; scaleY: number; scaleZ: number },
): Promise<MeshResult> {
  await waitReady()
  return send<MeshResult>('csgBoolean', { idA, idB, op, resultId, transformA, transformB })
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
