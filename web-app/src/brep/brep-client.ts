// ============================================================
// brep-client.ts — FILLET-CHAMFER-BREP: мост к OCCT-воркеру
// ============================================================
// Один воркер на сессию, промисы по id. Воркер создаётся лениво — при первом
// входе в режим «Скругление» / «Фаска»; WASM (30 МБ) грузится внутри воркера.

import type { BrepBase, BrepEdgeLine, BrepKind, BrepMesh, BrepStep } from './brep-kernel'
import type { BrepRequest, BrepResponse } from './brep.worker'

interface Pending {
  resolve: (v: BrepResponse) => void
  reject: (e: Error) => void
}

let worker: Worker | null = null
let seq = 0
const pending = new Map<number, Pending>()

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./brep.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (e: MessageEvent<BrepResponse>) => {
      const p = pending.get(e.data.id)
      if (!p) return
      pending.delete(e.data.id)
      if (e.data.ok) p.resolve(e.data)
      else p.reject(new Error(e.data.message))
    }
    worker.onerror = (e) => {
      const err = new Error(e.message || 'OCCT worker error')
      for (const p of pending.values()) p.reject(err)
      pending.clear()
    }
  }
  return worker
}

function call(req: BrepRequest): Promise<BrepResponse> {
  return new Promise((resolve, reject) => {
    pending.set(req.id, { resolve, reject })
    getWorker().postMessage(req)
  })
}

export async function brepWorkerEdges(base: BrepBase, steps: BrepStep[] = []): Promise<BrepEdgeLine[]> {
  const res = await call({ id: ++seq, type: 'edges', base, steps })
  if (!res.ok || res.type !== 'edges') throw new Error('OCCT: invalid edges response')
  return res.edges
}

export async function brepWorkerFillet(
  base: BrepBase,
  steps: BrepStep[],
  kind: BrepKind,
  size: number,
  edgeIndexes: number[],
): Promise<BrepMesh> {
  const res = await call({ id: ++seq, type: 'result', base, steps, kind, size, edgeIndexes })
  if (!res.ok || res.type !== 'result') throw new Error('OCCT: invalid mesh response')
  return res.mesh
}

/** Есть ли уже созданный воркер (для статуса/тестов). */
export function isBrepWorkerStarted(): boolean {
  return worker !== null
}
