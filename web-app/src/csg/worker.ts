// ============================================================
// CSG Web Worker — manifold-3d в изолированном потоке
// Хранит Map<id, ManifoldObj> в памяти воркера.
// ============================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type M = any;

let wasm: M = null;

const initPromise: Promise<void> = (async () => {
  const Module = await import("manifold-3d");
  wasm = await Module.default();
  wasm.setup();
  self.postMessage({ type: "ready" });
})();

// Кэш manifold-объектов по id
const cache = new Map<string, M>();

interface ShapeInfo {
  shapeType: string;
  params: Record<string, number>;
  filletRadius: number;
}

// ---- Утилиты ----

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
function applyTransform(
  manifold: M,
  t: {
    x: number;
    y: number;
    z: number;
    rotX: number;
    rotY: number;
    rotZ: number;
  },
): M {
  // Translation-only matrix (identity rotation, position from t)
  const m: number[] = [
    1, 0, 0, 0,  // Column 0
    0, 1, 0, 0,  // Column 1
    0, 0, 1, 0,  // Column 2
    t.x, t.y, t.z, 1,  // Column 3 (Translation)
  ];
  return manifold.transform(m);
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
  tris: number;
} {
  const mesh = manifold.getMesh();
  const numProp = mesh.numProp ?? 3;
  const raw: Float32Array = mesh.vertProperties;
  let vertices: Float32Array;
  if (numProp === 3) {
    vertices = new Float32Array(raw);
  } else {
    const count = raw.length / numProp;
    vertices = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      vertices[i * 3] = raw[i * numProp];
      vertices[i * 3 + 1] = raw[i * numProp + 1];
      vertices[i * 3 + 2] = raw[i * numProp + 2];
    }
  }
  const indices = new Uint32Array(mesh.triVerts);
  return { vertices, indices, tris: indices.length / 3 };
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
          x: number;
          y: number;
          z: number;
          rotX: number;
          rotY: number;
          rotZ: number;
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
          m = buildPrimitive(shapeType, params);
          m = applyTransform(m, transform);
        }
        cache.set(msg.objId as string, m);
        const { vertices, indices, tris } = extractMesh(m);
        (self as unknown as Worker).postMessage(
          {
            reqId: msg.reqId,
            type: "mesh",
            objId: msg.objId,
            vertices,
            indices,
            tris,
            ms: performance.now() - t0,
          },
          [vertices.buffer, indices.buffer],
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
          x: number;
          y: number;
          z: number;
          rotX: number;
          rotY: number;
          rotZ: number;
        };

        let m = buildPrimitiveWithFillet(shapeType, params, radius);
        m = applyTransform(m, transform);
        cache.set(msg.objId as string, m);
        const { vertices, indices, tris } = extractMesh(m);
        (self as unknown as Worker).postMessage(
          {
            reqId: msg.reqId,
            type: "mesh",
            objId: msg.objId,
            vertices,
            indices,
            tris,
            ms: performance.now() - t0,
          },
          [vertices.buffer, indices.buffer],
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
          const { vertices, indices, tris: numTris } = extractMesh(m);
          (self as unknown as Worker).postMessage(
            {
              reqId: msg.reqId,
              type: "mesh",
              objId: msg.objId,
              vertices,
              indices,
              tris: numTris,
              ms: performance.now() - t0,
            },
            [vertices.buffer, indices.buffer],
          );
        } catch (me) {
          // Manifold failed (non-manifold STL) — return raw mesh without CSG support
          const { vertices, indices } = { vertices: verts, indices: tris };
          cache.set(msg.objId as string, null);
          (self as unknown as Worker).postMessage(
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
        const a = cache.get(msg.idA as string);
        const b = cache.get(msg.idB as string);
        if (!a || !b)
          throw new Error(`Objects not found: ${msg.idA}, ${msg.idB}`);
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
        const { vertices, indices, tris } = extractMesh(result);
        (self as unknown as Worker).postMessage(
          {
            reqId: msg.reqId,
            type: "mesh",
            objId: msg.resultId,
            vertices,
            indices,
            tris,
            ms: performance.now() - t0,
          },
          [vertices.buffer, indices.buffer],
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
        const { vertices, indices, tris } = extractMesh(m);
        (self as unknown as Worker).postMessage(
          {
            reqId: msg.reqId,
            type: "mesh",
            objId: msg.objId,
            vertices,
            indices,
            tris,
            ms: performance.now() - t0,
          },
          [vertices.buffer, indices.buffer],
        );
        break;
      }

      // ── Пересобрать сцену из истории ──
      case "rebuildScene": {
        const t0 = performance.now();
        cache.clear();

        const shapeInfos: Map<string, ShapeInfo> = new Map();
        const currentTransforms: Map<
          string,
          {
            x: number;
            y: number;
            z: number;
            rotX: number;
            rotY: number;
            rotZ: number;
          }
        > = new Map();

        type Op = Record<string, unknown>;
        const ops = msg.operations as Op[];

        for (const op of ops) {
          if (op.type === "add_shape") {
            const t = op.transform as {
              x: number;
              y: number;
              z: number;
              rotX: number;
              rotY: number;
              rotZ: number;
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
              const nullT = { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0 };
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
            const d = op.delta as { x: number; y: number; z: number };
            const rd = (op as { rotDelta?: { x: number; y: number; z: number } }).rotDelta;
            for (const id of op.ids as string[]) {
              const info = shapeInfos.get(id);
              const t = currentTransforms.get(id);
              if (t) {
                const nt = {
                  ...t,
                  x: t.x + d.x, y: t.y + d.y, z: t.z + d.z,
                  rotX: t.rotX + (rd?.x ?? 0),
                  rotY: t.rotY + (rd?.y ?? 0),
                  rotZ: t.rotZ + (rd?.z ?? 0),
                };
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
                const nt = { ...t };
                const plane = op.plane as string;
                if (plane === "YZ") nt.x = -nt.x;
                if (plane === "XZ") nt.y = -nt.y;
                if (plane === "XY") nt.z = -nt.z;
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
            const a = cache.get(ids[0]);
            const b = cache.get(ids[1]);
            if (a && b) {
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
          tris: number;
        }> = [];
        const transfers: ArrayBuffer[] = [];
        for (const [objId, m] of cache) {
          const { vertices, indices, tris } = extractMesh(m);
          results.push({ objId, vertices, indices, tris });
          transfers.push(
            vertices.buffer as ArrayBuffer,
            indices.buffer as ArrayBuffer,
          );
        }

        (self as unknown as Worker).postMessage(
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
