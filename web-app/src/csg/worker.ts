// ============================================================
// CSG Web Worker - manifold-3d in isolated thread
// Operations handlers moved to worker-handlers.ts
// ============================================================

import type {
  BuildShapeMessage,
  ApplyFilletMessage,
  BuildImportedMeshMessage,
  CsgBooleanMessage,
  MirrorObjectMessage,
  RebuildSceneMessage,
  DeleteObjectsMessage,
  ClearAllMessage,
} from './worker-handlers'
import {
  handleBuildShape,
  handleApplyFillet,
  handleBuildImportedMesh,
  handleCsgBoolean,
  handleMirrorObject,
  safePostMessage,
  cache,
} from './worker-handlers'
import { applyMoveDelta, applyMirrorToTransform, applyAlignToTransform, makeDefaultTransform } from './rebuildOps'

let wasm!: import('./worker-handlers').ManifoldAPI

const initPromise: Promise<void> = (async () => {
  const Module = await import("manifold-3d");
  const rawApi = await Module.default();

  if (!rawApi?.setup || !rawApi?.Manifold || !rawApi?.CrossSection) {
    throw new Error('Invalid manifold API: missing setup, Manifold, or CrossSection');
  }
  wasm = rawApi as unknown as import('./worker-handlers').ManifoldAPI;
  wasm.setup();
  self.postMessage({ type: "ready" });
})();

async function handleRebuildScene(msg: RebuildSceneMessage): Promise<void> {
  const t0 = performance.now();
  const shapeInfos: Map<string, { shapeType: string; params: Record<string, number>; filletRadius: number }> = new Map();
  const currentTransforms: Map<string, import('./worker-handlers').RebuildTransform> = new Map();
  type Op = Record<string, unknown>;
  const ops = msg.operations as Op[];

  for (const op of ops) {
    if (op.type === "add_shape") {
      const raw = op.transform as { x: number; y: number; z: number; rotX: number; rotY: number; rotZ: number; scaleX?: number; scaleY?: number; scaleZ?: number };
      const t: import('./worker-handlers').RebuildTransform = {
        x: raw.x, y: raw.y, z: raw.z, rotX: raw.rotX, rotY: raw.rotY, rotZ: raw.rotZ,
        scaleX: raw.scaleX ?? 1, scaleY: raw.scaleY ?? 1, scaleZ: raw.scaleZ ?? 1,
      };
      const st = op.shapeType as string;
      const par = op.params as Record<string, number>;
      const { buildPrimitive, applyTransform } = await import('./worker-handlers');
      const m = applyTransform(buildPrimitive(st, par), t);
      cache.set(op.id as string, m);
      shapeInfos.set(op.id as string, { shapeType: st, params: par, filletRadius: 0 });
      currentTransforms.set(op.id as string, { ...t });
    } else if (op.type === "delete") {
      for (const id of op.ids as string[]) { cache.delete(id); shapeInfos.delete(id); currentTransforms.delete(id); }
    }
  }

  const results: Array<{ objId: string; vertices: Float32Array; indices: Uint32Array; normals: Float32Array | null; tris: number }> = [];
  const transfers: ArrayBuffer[] = [];
  for (const [objId, m] of cache) {
    if (!m) continue;
    const { extractMesh } = await import('./worker-handlers');
    const { vertices, indices, normals, tris } = extractMesh(m);
    results.push({ objId, vertices, indices, normals, tris });
    transfers.push(vertices.buffer as ArrayBuffer, indices.buffer as ArrayBuffer);
    if (normals) transfers.push(normals.buffer as ArrayBuffer);
  }

  safePostMessage({ reqId: msg.reqId, type: "sceneBuilt", results, ms: performance.now() - t0 }, transfers);
}

function handleDeleteObjects(msg: DeleteObjectsMessage): void {
  for (const id of msg.ids) cache.delete(id);
  safePostMessage({ reqId: msg.reqId, type: "ok" });
}

function handleClearAll(msg: ClearAllMessage): void {
  cache.clear();
  safePostMessage({ reqId: msg.reqId, type: "ok" });
}

self.addEventListener("message", async (e: MessageEvent) => {
  await initPromise;
  const msg = e.data as { reqId: string; type: string; [k: string]: unknown };
  try {
    switch (msg.type) {
      case "buildShape": await handleBuildShape(msg as unknown as BuildShapeMessage); break;
      case "applyFillet": await handleApplyFillet(msg as unknown as ApplyFilletMessage); break;
      case "buildImportedMesh": await handleBuildImportedMesh(msg as unknown as BuildImportedMeshMessage); break;
      case "csgBoolean": await handleCsgBoolean(msg as unknown as CsgBooleanMessage); break;
      case "mirrorObject": await handleMirrorObject(msg as unknown as MirrorObjectMessage); break;
      case "rebuildScene": await handleRebuildScene(msg as unknown as RebuildSceneMessage); break;
      case "deleteObjects": handleDeleteObjects(msg as unknown as DeleteObjectsMessage); break;
      case "clearAll": handleClearAll(msg as ClearAllMessage); break;
      default: safePostMessage({ reqId: msg.reqId, type: "error", message: `Unknown: ${msg.type}` });
    }
  } catch (err) {
    safePostMessage({ reqId: msg.reqId, type: "error", message: String(err) });
  }
});

