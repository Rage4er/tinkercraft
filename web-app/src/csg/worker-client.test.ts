// ============================================================
// worker-client.test.ts — проверка реального payload (без worker-bridge)
// ============================================================
//
// Регрессия 8c7a9dc: workerRebuildScene и workerBuildImportedMesh
// отправляли неполные payload ({opCount} вместо {operations},
// {vertexCount,indexCount} вместо {vertices,indices}). Тесты с
// worker-bridge это не ловят — bridge сам строит правильный payload.
//
// Здесь проверяем ЧИСТЫЙ worker-client: FakeWorker с записью всех
// postMessage-сообщений, проверка реального payload который уходит в Worker.
//
// ВАЖНО: vi.stubGlobal('Worker', FakeWorker) применяется ВНУТРИ каждого it(),
// vi.unstubAllGlobals() сбрасывает после. Иначе глобальный Worker
// ломает worker-bridge в последующих тестах.

import { describe, it, expect, vi } from 'vitest'

interface SentMessage {
  reqId: string
  type: string
  [k: string]: unknown
}

function makeFakeWorkerClass() {
  const sentMessages: SentMessage[] = []

  class FakeWorker {
    private _listeners: Map<string, Set<(e: { data: unknown }) => void>> = new Map()
    onmessage: ((e: { data: unknown }) => void) | null = null
    onerror: ((e: unknown) => void) | null = null

    constructor(_url: string | URL, _opts?: unknown) {
      setTimeout(() => this._dispatch('message', { data: { type: 'ready' } }), 0)
    }

    addEventListener(type: string, handler: (e: { data: unknown }) => void) {
      let set = this._listeners.get(type)
      if (!set) { set = new Set(); this._listeners.set(type, set) }
      set.add(handler)
    }

    removeEventListener(type: string, handler: (e: { data: unknown }) => void) {
      this._listeners.get(type)?.delete(handler)
    }

    private _dispatch(type: string, e: { data: unknown }) {
      const set = this._listeners.get(type)
      if (set) for (const h of set) h(e)
    }

    postMessage(m: SentMessage) {
      sentMessages.push(m)
      setTimeout(() => {
        const resp =
          m.type === 'rebuildScene'
            ? { reqId: m.reqId, type: 'rebuildScene', results: [], ms: 0 }
            : m.type === 'buildImportedMesh'
              ? { reqId: m.reqId, type: 'ok', objId: m.objId, vertices: new Float32Array(0), indices: new Uint32Array(0), tris: 0, ms: 0 }
              : { reqId: m.reqId, type: 'ok' }
        this._dispatch('message', { data: resp })
      }, 0)
    }

    terminate() { }
  }

  return {
    FakeWorker,
    getSentMessages: () => sentMessages,
    resetSent: () => { sentMessages.length = 0 },
  }
}

describe('worker-client — payload integrity (regression 8c7a9dc)', () => {

  // ------------------------------------------------------------
  it('workerRebuildScene sends operations array (not opCount)', async () => {
    const { FakeWorker, getSentMessages, resetSent } = makeFakeWorkerClass()
    resetSent()
    vi.stubGlobal('Worker', FakeWorker)
    const workerClient = await import('./worker-client')

    const operations = [
      { id: 'obj_1', type: 'create', shapeType: 'cube', params: { width: 10 } },
      { id: 'obj_2', type: 'create', shapeType: 'prism', params: { radius: 5, height: 10, sides: 3 } },
    ]
    await workerClient.workerRebuildScene(operations)
    vi.unstubAllGlobals()

    const msgs = getSentMessages()
    const msg = msgs.find(m => m.type === 'rebuildScene')
    expect(msg, 'rebuildScene message sent').toBeTruthy()
    // КРИТИЧЕСКАЯ ПРОВЕРКА: payload содержит operations (не только opCount)
    expect(msg!.operations, 'operations field present in payload').toBeDefined()
    expect(Array.isArray(msg!.operations), 'operations is an array').toBe(true)
    expect((msg!.operations as unknown[]).length).toBe(operations.length)
    expect((msg!.operations as unknown[])[0]).toEqual(operations[0])
    const keys = Object.keys(msg!).filter(k => !['reqId', 'type'].includes(k))
    expect(keys).toContain('operations')
  })

  // ------------------------------------------------------------
  it('workerBuildImportedMesh sends vertices/indices (not counts)', async () => {
    const { FakeWorker, getSentMessages, resetSent } = makeFakeWorkerClass()
    resetSent()
    vi.stubGlobal('Worker', FakeWorker)
    vi.resetModules()
    const workerClient = await import('./worker-client')

    const vertices = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0])
    const indices = new Uint32Array([0, 1, 2])
    await workerClient.workerBuildImportedMesh('imported_1', vertices, indices)
    vi.unstubAllGlobals()

    const msgs = getSentMessages()
    const msg = msgs.find(m => m.type === 'buildImportedMesh')
    expect(msg, 'buildImportedMesh message sent').toBeTruthy()
    // КРИТИЧЕСКАЯ ПРОВЕРКА: payload содержит vertices/indices (не только counts)
    expect(msg!.vertices, 'vertices field present in payload').toBeDefined()
    expect(msg!.indices, 'indices field present in payload').toBeDefined()
    const v = msg!.vertices as ArrayLike<number>
    const i = msg!.indices as ArrayLike<number>
    expect(v.length).toBe(vertices.length)
    expect(i.length).toBe(indices.length)
    const keys = Object.keys(msg!).filter(k => !['reqId', 'type'].includes(k))
    expect(keys).toContain('vertices')
    expect(keys).toContain('indices')
  })

  // ------------------------------------------------------------
  it('workerSyncMesh sends vertices/indices (regression guard)', async () => {
    const { FakeWorker, getSentMessages, resetSent } = makeFakeWorkerClass()
    resetSent()
    vi.stubGlobal('Worker', FakeWorker)
    vi.resetModules()
    const workerClient = await import('./worker-client')

    const vertices = [0, 0, 0, 1, 0, 0, 0, 1, 0]
    const indices = [0, 1, 2]
    await workerClient.workerSyncMesh('obj_1', vertices, indices)
    vi.unstubAllGlobals()

    const msgs = getSentMessages()
    const msg = msgs.find(m => m.type === 'syncMesh')
    expect(msg, 'syncMesh message sent').toBeTruthy()
    expect(msg!.vertices).toBeDefined()
    expect(msg!.indices).toBeDefined()
  })
})
