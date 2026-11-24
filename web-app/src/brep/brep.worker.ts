// ============================================================
// brep.worker.ts — FILLET-CHAMFER-BREP: OCCT в Web Worker (UI не блокируется)
// ============================================================
// Сообщения: edges (полилинии рёбер примитива), result (fillet/chamfer → меш).
// Инициализация WASM — при первом сообщении (ленивая), в brep-kernel.ts.

import {
  brepEdgesForChain, brepFilletChain, BrepError,
  type BrepBase, type BrepEdgeLine, type BrepKind, type BrepMesh, type BrepStep,
} from './brep-kernel'

export type BrepRequest =
  | { id: number; type: 'edges'; base: BrepBase; steps?: BrepStep[] }
  | { id: number; type: 'result'; base: BrepBase; steps?: BrepStep[]; kind: BrepKind; size: number; edgeIndexes: number[] }

export type BrepResponse =
  | { id: number; ok: true; type: 'edges'; edges: BrepEdgeLine[] }
  | { id: number; ok: true; type: 'result'; mesh: BrepMesh }
  | { id: number; ok: false; code: string; message: string }

self.onmessage = async (e: MessageEvent<BrepRequest>) => {
  const msg = e.data
  try {
    if (msg.type === 'edges') {
      const edges = await brepEdgesForChain(msg.base, msg.steps ?? [])
      const res: BrepResponse = { id: msg.id, ok: true, type: 'edges', edges }
      self.postMessage(res)
      return
    }
    const mesh = await brepFilletChain(msg.base, msg.steps ?? [], msg.kind, msg.size, msg.edgeIndexes)
    const res: BrepResponse = { id: msg.id, ok: true, type: 'result', mesh }
    const post = self.postMessage as unknown as (m: BrepResponse, transfer: Transferable[]) => void
    post(res, [mesh.vertices.buffer, mesh.indices.buffer, mesh.normals.buffer])
  } catch (err) {
    const res: BrepResponse = {
      id: msg.id, ok: false,
      code: err instanceof BrepError ? err.code : 'kernel',
      message: err instanceof Error ? err.message : String(err),
    }
    self.postMessage(res)
  }
}
