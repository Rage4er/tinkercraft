// ============================================================
// CSG Web Worker - manifold-3d in isolated thread
// Operations handlers moved to worker-handlers.ts
// ============================================================

import {
  handleBuildShape,
  handleApplyFillet,
  handleBuildImportedMesh,
  handleCsgBoolean,
  handleCsgBooleanSync,
  handleMirrorObject,
  handleRebuildScene,
  handleSyncObjects,
  safePostMessage,
  cache,
  initWasm,
} from './worker-handlers'

const initPromise = initWasm()

self.addEventListener('message', async (e: MessageEvent) => {
  await initPromise
  const msg = e.data as { reqId: string; type: string;[k: string]: unknown }
  try {
    switch (msg.type) {
      case 'buildShape': await handleBuildShape(msg as unknown as import('./worker-handlers').BuildShapeMessage); break
      case 'applyFillet': await handleApplyFillet(msg as unknown as import('./worker-handlers').ApplyFilletMessage); break
      case 'buildImportedMesh': await handleBuildImportedMesh(msg as unknown as import('./worker-handlers').BuildImportedMeshMessage); break
      case 'csgBoolean': await handleCsgBoolean(msg as unknown as import('./worker-handlers').CsgBooleanMessage); break
      case 'csgBooleanSync': await handleCsgBooleanSync(msg as unknown as import('./worker-handlers').CsgBooleanSyncMessage); break
      case 'mirrorObject': await handleMirrorObject(msg as unknown as import('./worker-handlers').MirrorObjectMessage); break
      case 'rebuildScene': await handleRebuildScene(msg as unknown as import('./worker-handlers').RebuildSceneMessage); break
      case 'syncObjects': await handleSyncObjects(msg as unknown as import('./worker-handlers').SyncObjectsMessage); break
      case 'deleteObjects':
        for (const id of (msg.ids as string[])) cache.delete(id)
        safePostMessage({ reqId: msg.reqId, type: 'ok' })
        break
      case 'clearAll':
        cache.clear()
        safePostMessage({ reqId: msg.reqId, type: 'ok' })
        break
      default: safePostMessage({ reqId: msg.reqId, type: 'error', message: `Unknown: ${msg.type}` })
    }
  } catch (err) {
    safePostMessage({ reqId: msg.reqId, type: 'error', message: String(err) })
  }
})
