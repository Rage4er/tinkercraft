// ============================================================
// CSG Web Worker — manifold-3d в изолированном потоке
// Хранит Map<id, ManifoldObj> в памяти воркера.
// ============================================================

// ---- Type-safe Manifold WASM interface ----

import { buildSRTMatrixAroundCenter } from './worker-matrix'
import { applyMoveDelta, applyMirrorToTransform, applyAlignToTransform, makeDefaultTransform, type RebuildTransform } from './rebuildOps'

interface ManifoldMesh {
  numProp: number;
  vertProperties: Float32Array;
  triVerts: ArrayBuffer;
}

interface ManifoldObject {
  transform(matrix: number[]): ManifoldObject;
  add(other: ManifoldObject): ManifoldObject;
  subtract(other: ManifoldObject): ManifoldObject;
  intersect(other: ManifoldObject): ManifoldObject;
  getMesh(): ManifoldMesh;
  refine(recursions: number): ManifoldObject;
  warp(fn: (v: number[]) => void): ManifoldObject;
}

interface CrossSection {
  translate(offset: [number, number]): CrossSection;
}

interface ManifoldConstructor {
  new (mesh: {
    vertProperties: Float32Array;
    triVerts: Uint32Array | ArrayBuffer;
    numProp: number;
  }): ManifoldObject;
  cube(size: [number, number, number], center: boolean): ManifoldObject;
  sphere(radius: number, segments: number): ManifoldObject;
  cylinder(
    height: number,
    radiusTop: number,
    radiusBottom: number,
    segments: number,
    center: boolean,
  ): ManifoldObject;
  revolve(crossSection: CrossSection, segments: number): ManifoldObject;
}

interface CrossSectionConstructor {
  circle(radius: number, segments: number): CrossSection;
}

interface ManifoldAPI {
  Manifold: ManifoldConstructor;
  CrossSection: CrossSectionConstructor;
  setup(): void;
}

type M = ManifoldObject;

// Definite assignment: wasm is initialised inside initPromise (awaited before
// any message handler runs), so it is never null when functions use it.
let wasm!: ManifoldAPI;

const initPromise: Promise<void> = (async () => {
  const Module = await import("manifold-3d");
  const rawApi = await Module.default();

  // Runtime validation: ensure manifold API has expected methods
  if (!rawApi?.setup || !rawApi?.Manifold || !rawApi?.CrossSection) {
    throw new Error(
      'Invalid manifold API: missing setup, Manifold, or CrossSection',
    );
  }
  wasm = rawApi as unknown as ManifoldAPI;
  wasm.setup();
  self.postMessage({ type: "ready" });
})();

// Кэш manifold-объектов по id (null = non-manifold import, CSG not supported)
const cache = new Map<string, ManifoldObject | null>();

interface ShapeInfo {
  shapeType: string;
  params: Record<string, number>;
  filletRadius: number;
}

// ---- Валидация входных данных (SEC-1) ----

/** Clamp a value to [min, max]; returns min for NaN/Infinity. */
function clamp(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, v));
}

/** Sanitise user-supplied params: drop non-numbers, clamp to ±1e6. */
function sanitizeParams(params: Record<string, unknown>): Record<string, number> {
  const result: Record<string, number> = {};
  for (const [key, val] of Object.entries(params)) {
    if (key.startsWith('_')) continue; // skip internal fields (_verts, _tris)
    const n = typeof val === 'number' ? val : NaN;
    result[key] = Number.isFinite(n) ? clamp(n, -1e6, 1e6) : 0;
  }
  return result;
}

// ---- Утилиты ----

/**
 * Safe postMessage wrapper (FIX WARN-R3-4).
 * postMessage with transferList can throw DataCloneError for very large meshes.
 */
function safePostMessage(msg: unknown, transferList?: ArrayBuffer[]): void {
  try {
    if (transferList && transferList.length > 0) {
      (self as unknown as Worker).postMessage(msg, transferList as Transferable[]);
    } else {
      (self as unknown as Worker).postMessage(msg);
    }
  } catch (err) {
    console.error('[Worker] postMessage failed:', err);
    // Send error message without transfer list
    self.postMessage({
      type: "error",
      message: `postMessage failed: ${String(err)}`,
    });
  }
}

function buildPrimitive(shapeType: string, params: Record<string, number>): M {
  const { Manifold } = wasm;
  switch (shapeType) {
    case "cube": {
      let width = params.width;
      let height = params.height;
      let depth = params.depth;
      
      if (width === undefined || width <= 0) width = 20;
      if (height === undefined || height <= 0) height = 20;
      if (depth === undefined || depth <= 0) depth = 20;
      
      return Manifold.cube([width, height, depth], true);
    }
    case "sphere":
      return Manifold.sphere(params.radius ?? 12, params.segments ?? 32);
    case "cylinder":
      return Manifold.cylinder(
        params.height ?? 30,
        params.radius ?? 10,
        params.radius ?? 10,
        params.segments ?? 32,
        true,
      );
    case "cone":
      return Manifold.cylinder(
        params.height ?? 30,
        params.radius ?? 10,
        0,
        params.segments ?? 32,
        true,
      );
    case "torus": {
      const torusRadius = params.torusRadius ?? 15;
      const tubeRadius  = params.tubeRadius  ?? 4;
      const segments    = Math.max(8,  Math.round(params.segments     ?? 32));
      const tubeSegs    = Math.max(4,  Math.round(params.tubeSegments ?? 16));
      const { CrossSection } = wasm;
      const circle     = CrossSection.circle(tubeRadius, tubeSegs);
      const translated = circle.translate([torusRadius, 0]);
      return wasm.Manifold.revolve(translated, segments);
    }
    case "prism": {
      const sides = Math.max(3, Math.round(params.sides ?? 6));
      return Manifold.cylinder(
        params.height ?? 20,
        params.radius ?? 12,
        params.radius ?? 12,
        sides,
        true,
      );
    }
    case "pyramid": {
      const sides = Math.max(3, Math.round(params.sides ?? 4));
      return Manifold.cylinder(
        params.height ?? 20,
        params.radius ?? 12,
        0,
        sides,
        true,
      );
    }
    default:
      return Manifold.cube([20, 20, 20], true);
  }
}

/** Скруглённый бокс через warp + refine (только для cube) */
function buildRoundedBox(w: number, h: number, d: number, r: number): M {
  const { Manifold } = wasm;
  const maxR = Math.min(w, h, d) / 2 - 0.1;
  const cr = Math.max(0.01, Math.min(r, maxR));
  const hw = w / 2 - cr,
    hh = h / 2 - cr,
    hd = d / 2 - cr;

  const cube = Manifold.cube([w, h, d], true);
  const refined = cube.refine(6);

  return refined.warp((v: number[]) => {
    const x = v[0],
      y = v[1],
      z = v[2];
    const ex = Math.max(0, Math.abs(x) - hw);
    const ey = Math.max(0, Math.abs(y) - hh);
    const ez = Math.max(0, Math.abs(z) - hd);
    const len = Math.sqrt(ex * ex + ey * ey + ez * ez);
    if (len < 1e-9) return;
    const s = cr / len;
    v[0] = Math.sign(x) * hw + ex * s * Math.sign(x || 1);
    v[1] = Math.sign(y) * hh + ey * s * Math.sign(y || 1);
    v[2] = Math.sign(z) * hd + ez * s * Math.sign(z || 1);
  });
}

function buildPrimitiveWithFillet(
  shapeType: string,
  params: Record<string, number>,
  r: number,
): M {
  if (r > 0 && shapeType === "cube") {
    return buildRoundedBox(
      params.width ?? 20,
      params.height ?? 20,
      params.depth ?? 20,
      r,
    );
  }
  return buildPrimitive(shapeType, params);
}

/**
 * Apply ONLY translation to the manifold geometry.
 * Rotation is NOT baked into geometry — it is applied via pivot.rotation in Three.js.
 * This avoids double-rotation problems when syncing from store to scene.
 */
// Translation-only: Viewport3D applies rotation/scale visually via pivot,
// so we must NOT bake them here (would double-apply on every rebuild).
function applyTransform(
  manifold: M,
  t: { x: number; y: number; z: number },
): M {
  const m: number[] = [
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    t.x, t.y, t.z, 1,
  ];
  return manifold.transform(m);
}

// Apply scale+rotation around the object's own world-space center before CSG.
// The cached geometry has translation baked in (vertices at world coords), so
// applying RS around the world origin would shift the shape. The correct matrix
// is T(pos) × RS × T(-pos), whose translation column is: pos − RS·pos.
//
// rotX/Y/Z in degrees; Euler XYZ (Three.js default): R = Rz·Ry·Rx; column-major.
type FullSRT = {
  x: number; y: number; z: number;
  rotX: number; rotY: number; rotZ: number;
  scaleX: number; scaleY: number; scaleZ: number;
};

function applySRAroundCenter(manifold: M, t: FullSRT): M {
  const matrix = buildSRTMatrixAroundCenter(
    { x: t.x, y: t.y, z: t.z },
    { rotX: t.rotX, rotY: t.rotY, rotZ: t.rotZ },
    { scaleX: t.scaleX, scaleY: t.scaleY, scaleZ: t.scaleZ },
  )
  return manifold.transform(matrix)
}

// Returns true when the transform has non-trivial rotation or scale
function hasSR(t: { rotX: number; rotY: number; rotZ: number; scaleX: number; scaleY: number; scaleZ: number }): boolean {
  return (
    Math.abs(t.rotX) > 1e-6 || Math.abs(t.rotY) > 1e-6 || Math.abs(t.rotZ) > 1e-6 ||
    Math.abs(t.scaleX - 1) > 1e-6 || Math.abs(t.scaleY - 1) > 1e-6 || Math.abs(t.scaleZ - 1) > 1e-6
  );
}

function getMirrorMatrix(plane: string): number[] {
  // FIX: Mat4 requires 16 values (4x4 column-major order).
  switch (plane) {
    case "YZ":
      // Mirror X: [-1, 0, 0, 0,  0, 1, 0, 0,  0, 0, 1, 0,  0, 0, 0, 1]
      return [-1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    case "XZ":
      // Mirror Y: [1, 0, 0, 0,  0, -1, 0, 0,  0, 0, 1, 0,  0, 0, 0, 1]
      return [1, 0, 0, 0, 0, -1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    case "XY":
      // Mirror Z: [1, 0, 0, 0,  0, 1, 0, 0,  0, 0, -1, 0,  0, 0, 0, 1]
      return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, -1, 0, 0, 0, 0, 1];
    default:
      return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  }
}

function extractMesh(manifold: M): {
  vertices: Float32Array;
  indices: Uint32Array;
  normals: Float32Array | null;
  tris: number;
} {
  const mesh = manifold.getMesh();
  const numProp = mesh.numProp ?? 3;
  const raw: Float32Array = mesh.vertProperties;
  let vertices: Float32Array;
  let normals: Float32Array | null = null;
  if (numProp === 3) {
    vertices = new Float32Array(raw);
  } else {
    // numProp >= 6: xyz + normal (and possibly more attributes)
    const count = raw.length / numProp;
    vertices = new Float32Array(count * 3);
    if (numProp >= 6) {
      normals = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        vertices[i * 3]     = raw[i * numProp];
        vertices[i * 3 + 1] = raw[i * numProp + 1];
        vertices[i * 3 + 2] = raw[i * numProp + 2];
        normals[i * 3]      = raw[i * numProp + 3];
        normals[i * 3 + 1]  = raw[i * numProp + 4];
        normals[i * 3 + 2]  = raw[i * numProp + 5];
      }
    } else {
      for (let i = 0; i < count; i++) {
        vertices[i * 3]     = raw[i * numProp];
        vertices[i * 3 + 1] = raw[i * numProp + 1];
        vertices[i * 3 + 2] = raw[i * numProp + 2];
      }
    }
  }
  const indices = new Uint32Array(mesh.triVerts);
  return { vertices, indices, normals, tris: indices.length / 3 };
}

// ---- Message handler ----

self.addEventListener("message", async (e: MessageEvent) => {
  await initPromise;

  const msg = e.data as { reqId: string; type: string; [k: string]: unknown };

  try {
    switch (msg.type) {
      // ── Построить примитив ──
      case "buildShape": {
        const t0 = performance.now();
        const shapeType = msg.shapeType as string;
        const params = msg.params as Record<string, number>;
        const transform = msg.transform as {
          x: number; y: number; z: number;
          rotX: number; rotY: number; rotZ: number;
          scaleX?: number; scaleY?: number; scaleZ?: number;
        };

        let m: M;
        if (shapeType === "import_mesh") {
          const verts = new Float32Array(params._verts as unknown as number[]);
          const tris = new Uint32Array(params._tris as unknown as number[]);
          m = new wasm.Manifold({
            numProp: 3,
            vertProperties: verts,
            triVerts: tris,
          });
        } else {
          const safeP = sanitizeParams(params);
          m = buildPrimitive(shapeType, safeP);
          m = applyTransform(m, transform);
        }
        cache.set(msg.objId as string, m);
        const { vertices, indices, normals, tris } = extractMesh(m);
        const transferList: ArrayBuffer[] = [vertices.buffer as ArrayBuffer, indices.buffer as ArrayBuffer];
        if (normals) transferList.push(normals.buffer as ArrayBuffer);
        safePostMessage(
          {
            reqId: msg.reqId,
            type: "mesh",
            objId: msg.objId,
            vertices,
            indices,
            normals,
            tris,
            ms: performance.now() - t0,
          },
          transferList,
        );
        break;
      }

      // ── Применить fillet к существующему объекту ──
      case "applyFillet": {
        const t0 = performance.now();
        const shapeType = msg.shapeType as string;
        const params = msg.params as Record<string, number>;
        const radius = msg.radius as number;
        const transform = msg.transform as {
          x: number; y: number; z: number;
          rotX: number; rotY: number; rotZ: number;
          scaleX?: number; scaleY?: number; scaleZ?: number;
        };

        let m = buildPrimitiveWithFillet(shapeType, sanitizeParams(params), clamp(radius, 0, 1e4));
        m = applyTransform(m, transform);
        cache.set(msg.objId as string, m);
        const { vertices, indices, normals, tris } = extractMesh(m);
        const transferList: ArrayBuffer[] = [vertices.buffer as ArrayBuffer, indices.buffer as ArrayBuffer];
        if (normals) transferList.push(normals.buffer as ArrayBuffer);
        safePostMessage(
          {
            reqId: msg.reqId,
            type: "mesh",
            objId: msg.objId,
            vertices,
            indices,
            normals,
            tris,
            ms: performance.now() - t0,
          },
          transferList,
        );
        break;
      }

      // ── Построить импортированный меш ──
      case "buildImportedMesh": {
        const t0 = performance.now();
        const verts = new Float32Array(msg.vertices as number[]);
        const tris = new Uint32Array(msg.indices as number[]);
        try {
          const m = new wasm.Manifold({
            numProp: 3,
            vertProperties: verts,
            triVerts: tris,
          });
          cache.set(msg.objId as string, m);
          const { vertices, indices, normals, tris: numTris } = extractMesh(m);
          const transferList: ArrayBuffer[] = [vertices.buffer as ArrayBuffer, indices.buffer as ArrayBuffer];
          if (normals) transferList.push(normals.buffer as ArrayBuffer);
          safePostMessage(
            {
              reqId: msg.reqId,
              type: "mesh",
              objId: msg.objId,
              vertices,
              indices,
              normals,
              tris: numTris,
              ms: performance.now() - t0,
            },
            transferList,
          );
        } catch (me) {
          // Manifold failed (non-manifold STL) — return raw mesh without CSG support
          const { vertices, indices } = { vertices: verts, indices: tris };
          cache.set(msg.objId as string, null);
          safePostMessage(
            {
              reqId: msg.reqId,
              type: "mesh",
              objId: msg.objId,
              vertices,
              indices,
              tris: tris.length / 3,
              ms: performance.now() - t0,
              nonManifold: true,
            },
            [vertices.buffer, indices.buffer],
          );
        }
        break;
      }

      // ── CSG булева ──
      case "csgBoolean": {
        const t0 = performance.now();
        let a = cache.get(msg.idA as string);
        let b = cache.get(msg.idB as string);
        if (!a || !b)
          throw new Error(`Objects not found: ${msg.idA}, ${msg.idB}`);

        // Apply scale+rotation around each object's own center so CSG sees
        // the correctly-oriented geometry. The cache has translation-only geometry;
        // scale/rotation live on the Three.js pivot and are supplied by the caller.
        const tA = msg.transformA as FullSRT | undefined;
        const tB = msg.transformB as FullSRT | undefined;
        if (tA && hasSR(tA)) a = applySRAroundCenter(a, tA);
        if (tB && hasSR(tB)) b = applySRAroundCenter(b, tB);

        let result: M;
        switch (msg.op) {
          case "union":
            result = a.add(b);
            break;
          case "subtract":
            result = a.subtract(b);
            break;
          default:
            result = a.intersect(b);
            break;
        }
        cache.delete(msg.idA as string);
        cache.delete(msg.idB as string);
        cache.set(msg.resultId as string, result);
        const { vertices, indices, normals, tris } = extractMesh(result);
        const transferList: ArrayBuffer[] = [vertices.buffer as ArrayBuffer, indices.buffer as ArrayBuffer];
        if (normals) transferList.push(normals.buffer as ArrayBuffer);
        safePostMessage(
          {
            reqId: msg.reqId,
            type: "mesh",
            objId: msg.resultId,
            vertices,
            indices,
            normals,
            tris,
            ms: performance.now() - t0,
          },
          transferList,
        );
        break;
      }

      // ── Зеркало in-place ──
      case "mirrorObject": {
        const t0 = performance.now();
        const src = cache.get(msg.objId as string);
        if (!src) throw new Error(`Object not found: ${msg.objId}`);
        const m = src.transform(getMirrorMatrix(msg.plane as string));
        cache.set(msg.objId as string, m);
        const { vertices, indices, normals, tris } = extractMesh(m);
        const transferList: ArrayBuffer[] = [vertices.buffer as ArrayBuffer, indices.buffer as ArrayBuffer];
        if (normals) transferList.push(normals.buffer as ArrayBuffer);
        safePostMessage(
          {
            reqId: msg.reqId,
            type: "mesh",
            objId: msg.objId,
            vertices,
            indices,
            normals,
            tris,
            ms: performance.now() - t0,
          },
          transferList,
        );
        break;
      }

      // ── Пересобрать сцену из истории ──
      case "rebuildScene": {
        const t0 = performance.now();
        cache.clear();

        const shapeInfos: Map<string, ShapeInfo> = new Map();
        const currentTransforms: Map<string, RebuildTransform> = new Map();

        type Op = Record<string, unknown>;
        const ops = msg.operations as Op[];

        for (const op of ops) {
          if (op.type === "add_shape") {
            const raw = op.transform as {
              x: number; y: number; z: number;
              rotX: number; rotY: number; rotZ: number;
              scaleX?: number; scaleY?: number; scaleZ?: number;
            };
            const t: RebuildTransform = {
              x: raw.x, y: raw.y, z: raw.z,
              rotX: raw.rotX, rotY: raw.rotY, rotZ: raw.rotZ,
              scaleX: raw.scaleX ?? 1, scaleY: raw.scaleY ?? 1, scaleZ: raw.scaleZ ?? 1,
            };
            const st = op.shapeType as string;
            const par = op.params as Record<string, number>;
            const m = applyTransform(buildPrimitive(st, par), t);
            cache.set(op.id as string, m);
            shapeInfos.set(op.id as string, {
              shapeType: st,
              params: par,
              filletRadius: 0,
            });
            currentTransforms.set(op.id as string, { ...t });
          } else if (op.type === "import_mesh") {
            const verts = new Float32Array(
              op.operations as unknown as number[],
            );
            const tris = new Uint32Array(op.operations as unknown as number[]);
            try {
              const m = new wasm.Manifold({
                numProp: 3,
                vertProperties: verts,
                triVerts: tris,
              });
              cache.set(op.id as string, m);
              shapeInfos.set(op.id as string, {
                shapeType: "import_mesh",
                params: {},
                filletRadius: 0,
              });
              const nullT: RebuildTransform = { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 };
              currentTransforms.set(op.id as string, nullT);
            } catch (ie) {
              console.warn("import_mesh rebuild error:", ie);
            }
          } else if (op.type === "fillet") {
            const id = op.id as string;
            const info = shapeInfos.get(id);
            const t = currentTransforms.get(id);
            if (info && t && info.shapeType !== "import_mesh") {
              const r = op.radius as number;
              info.filletRadius = r;
              let m = buildPrimitiveWithFillet(info.shapeType, info.params, r);
              m = applyTransform(m, t);
              cache.set(id, m);
            }
          } else if (op.type === "move") {
            const d  = op.delta    as { x: number; y: number; z: number };
            const rd = (op as { rotDelta?:   { x: number; y: number; z: number } }).rotDelta;
            const sd = (op as { scaleDelta?: { x: number; y: number; z: number } }).scaleDelta;
            for (const id of op.ids as string[]) {
              const info = shapeInfos.get(id);
              const t = currentTransforms.get(id);
              if (t) {
                const nt = applyMoveDelta(t, d, rd, sd) as RebuildTransform;
                currentTransforms.set(id, nt);
                if (info) {
                  // Примитив — пересобираем из базовой формы
                  let m = buildPrimitiveWithFillet(
                    info.shapeType,
                    info.params,
                    info.filletRadius,
                  );
                  m = applyTransform(m, nt);
                  cache.set(id, m);
                }
              } else {
                const cm = cache.get(id);
                if (cm)
                  cache.set(
                    id,
                    cm.transform([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, d.x, d.y, d.z, 1]),
                  );
            }
            }
          } else if (op.type === "mirror") {
            const flip = getMirrorMatrix(op.plane as string);
            for (const id of op.ids as string[]) {
              const cm = cache.get(id);
              if (cm) cache.set(id, cm.transform(flip));
              const t = currentTransforms.get(id);
              if (t) {
                const nt = applyMirrorToTransform(t, op.plane as 'XY' | 'XZ' | 'YZ');
                currentTransforms.set(id, nt);
              }
            }
          } else if (op.type === "align") {
            const deltas = op.deltas as Record<string, number> | undefined;
            if (deltas) {
              const axis = (op.axis as string).toLowerCase() as "x" | "y" | "z";
              for (const [id, delta] of Object.entries(deltas)) {
                const dx = axis === "x" ? delta : 0;
                const dy = axis === "y" ? delta : 0;
                const dz = axis === "z" ? delta : 0;
                const info = shapeInfos.get(id);
                const t = currentTransforms.get(id);
                if (t) {
                  const nt = { ...t, [axis]: t[axis] + delta };
                  currentTransforms.set(id, nt);
                  if (info) {
                    let m = buildPrimitiveWithFillet(
                      info.shapeType,
                      info.params,
                      info.filletRadius,
                    );
                    m = applyTransform(m, nt);
                    cache.set(id, m);
                  } else {
                    const cm = cache.get(id);
                    if (cm)
                      cache.set(
                        id,
                        cm.transform([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, dx, dy, dz, 1]),
                      );
                  }
                } else {
                  const cm = cache.get(id);
                  if (cm)
                    cache.set(
                      id,
                      cm.transform([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, dx, dy, dz, 1]),
                    );
                }
              }
            }
          } else if (op.type === "resize_dims") {
            const id = op.id as string;
            const np = op.params as Record<string, number>;
            const info = shapeInfos.get(id);
            const t = currentTransforms.get(id);
            if (info && t) {
              info.params = { ...info.params, ...np };
              let m = buildPrimitiveWithFillet(
                info.shapeType,
                info.params,
                info.filletRadius,
              );
              m = applyTransform(m, t);
              cache.set(id, m);
            }
          } else if (op.type === "group") {
            const ids = op.ids as string[];
            let a = cache.get(ids[0]);
            let b = cache.get(ids[1]);
            if (a && b) {
              // Apply scale+rotation from accumulated currentTransforms so the
              // boolean op sees the correctly-oriented geometry.
              const tA = currentTransforms.get(ids[0]);
              const tB = currentTransforms.get(ids[1]);
              if (tA && hasSR(tA)) a = applySRAroundCenter(a, tA);
              if (tB && hasSR(tB)) b = applySRAroundCenter(b, tB);
              let result: M;
              const isIntersect = op.isIntersect as boolean;
              const subtractOp = op.subtractOp as boolean | undefined;
              if (isIntersect) result = a.intersect(b);
              else if (subtractOp) result = a.subtract(b);
              else result = a.add(b);
              cache.delete((op.ids as string[])[0]);
              cache.delete((op.ids as string[])[1]);
              cache.set(op.resultId as string, result);
            }
          } else if (op.type === "delete") {
            for (const id of op.ids as string[]) {
              cache.delete(id);
              shapeInfos.delete(id);
              currentTransforms.delete(id);
            }
          }
          // visibility / color — no geometry change
        }

        const results: Array<{
          objId: string;
          vertices: Float32Array;
          indices: Uint32Array;
          normals: Float32Array | null;
          tris: number;
        }> = [];
        const transfers: ArrayBuffer[] = [];
        for (const [objId, m] of cache) {
          if (!m) continue; // skip non-manifold imports
          const { vertices, indices, normals, tris } = extractMesh(m);
          results.push({ objId, vertices, indices, normals, tris });
          transfers.push(
            vertices.buffer as ArrayBuffer,
            indices.buffer as ArrayBuffer,
          );
          if (normals) transfers.push(normals.buffer as ArrayBuffer);
        }

        safePostMessage(
          {
            reqId: msg.reqId,
            type: "sceneBuilt",
            results,
            ms: performance.now() - t0,
          },
          transfers,
        );
        break;
      }

      case "deleteObjects": {
        for (const id of msg.ids as string[]) cache.delete(id);
        self.postMessage({ reqId: msg.reqId, type: "ok" });
        break;
      }

      case "clearAll": {
        cache.clear();
        self.postMessage({ reqId: msg.reqId, type: "ok" });
        break;
      }

      default:
        self.postMessage({
          reqId: msg.reqId,
          type: "error",
          message: `Unknown: ${msg.type}`,
        });
    }
  } catch (err) {
    self.postMessage({ reqId: msg.reqId, type: "error", message: String(err) });
  }
});
