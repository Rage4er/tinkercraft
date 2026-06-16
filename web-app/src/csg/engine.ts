// ============================================================
// CSG движок — обёртка над manifold-3d
// Фаза 0: синхронная инициализация, операции в main thread.
// Фаза 1: перенос в Web Worker.
// ============================================================

import type { SceneObject, ShapeType, ShapeParams, TransformNR, CsgBooleanOp } from './types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ManifoldWasm = any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ManifoldObj = any

let wasm: ManifoldWasm | null = null
let initPromise: Promise<ManifoldWasm> | null = null

export async function initEngine(): Promise<ManifoldWasm> {
  if (wasm) return wasm
  if (initPromise) return initPromise

  initPromise = (async () => {
    const Module = await import('manifold-3d')
    const m = await Module.default()
    m.setup()
    wasm = m
    return m
  })()

  return initPromise
}

export function isEngineReady(): boolean {
  return wasm !== null
}

// ---- Создание примитивов ----

function createPrimitive(w: ManifoldWasm, shapeType: ShapeType, params: ShapeParams): ManifoldObj {
  const { Manifold } = w

  switch (shapeType) {
    case 'cube':
      return Manifold.cube(
        [params.width ?? 20, params.depth ?? 20, params.height ?? 20],
        true
      )

    case 'sphere':
      return Manifold.sphere(params.radius ?? 12, params.segments ?? 32)

    case 'cylinder':
      return Manifold.cylinder(
        params.height ?? 30,
        params.radius ?? 10,
        params.radius ?? 10,
        params.segments ?? 32,
        true
      )

    case 'cone':
      return Manifold.cylinder(
        params.height ?? 30,
        params.radius ?? 10,
        0,
        params.segments ?? 32,
        true
      )

    case 'torus': {
      // manifold не имеет встроенного torus — строим через revolve
      // Упрощение: возвращаем сферу как fallback
      return Manifold.sphere(params.radius ?? 12, 32)
    }

    default:
      return Manifold.cube([20, 20, 20], true)
  }
}

// ---- Применить TransformNR к manifold ----

function applyTransform(w: ManifoldWasm, manifold: ManifoldObj, t: TransformNR): ManifoldObj {
  const rx = t.rotX * (Math.PI / 180)
  const ry = t.rotY * (Math.PI / 180)
  const rz = t.rotZ * (Math.PI / 180)

  // Матрица вращения (ZYX порядок)
  const cx = Math.cos(rx), sx = Math.sin(rx)
  const cy = Math.cos(ry), sy = Math.sin(ry)
  const cz = Math.cos(rz), sz = Math.sin(rz)

  // Колонки 3×4 affine матрицы (column-major для manifold)
  const m = [
    cy * cz,  cy * sz,  -sy,
    sx * sy * cz - cx * sz,  sx * sy * sz + cx * cz,  sx * cy,
    cx * sy * cz + sx * sz,  cx * sy * sz - sx * cz,  cx * cy,
    t.x, t.y, t.z,
  ]

  return manifold.transform(m)
}

// ---- Mesh → Float32Array / Uint32Array ----

function manifoldToArrays(manifold: ManifoldObj): { vertices: Float32Array; indices: Uint32Array } {
  const mesh = manifold.getMesh()

  // vertProperties может содержать только xyz (numProp=3) или xyz+normals (numProp=6)
  const numProp: number = mesh.numProp ?? 3
  const rawVerts: Float32Array = mesh.vertProperties

  let vertices: Float32Array
  if (numProp === 3) {
    vertices = rawVerts
  } else {
    // Берём только xyz
    const count = rawVerts.length / numProp
    vertices = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      vertices[i * 3]     = rawVerts[i * numProp]
      vertices[i * 3 + 1] = rawVerts[i * numProp + 1]
      vertices[i * 3 + 2] = rawVerts[i * numProp + 2]
    }
  }

  const indices = new Uint32Array(mesh.triVerts)
  return { vertices, indices }
}

// ---- Публичное API ----

export async function buildSceneObject(
  id: string,
  shapeType: ShapeType,
  params: ShapeParams,
  color: string,
  transform: TransformNR,
): Promise<SceneObject> {
  const w = await initEngine()
  let manifold = createPrimitive(w, shapeType, params)
  manifold = applyTransform(w, manifold, transform)
  const { vertices, indices } = manifoldToArrays(manifold)

  return {
    id,
    shapeType,
    params,
    color,
    transform,
    visible: true,
    locked: false,
    vertices,
    indices,
  }
}

export async function csgBoolean(
  objA: SceneObject,
  objB: SceneObject,
  op: CsgBooleanOp,
  resultId: string,
): Promise<SceneObject> {
  const w = await initEngine()
  const { Manifold } = w

  // Восстанавливаем manifold из mesh данных
  function fromArrays(verts: Float32Array, idx: Uint32Array): ManifoldObj {
    return new Manifold({ vertProperties: verts, triVerts: idx, numProp: 3 })
  }

  const a = fromArrays(objA.vertices, objA.indices)
  const b = fromArrays(objB.vertices, objB.indices)

  let result: ManifoldObj
  switch (op) {
    case 'union':    result = a.add(b);       break
    case 'subtract': result = a.subtract(b);  break
    case 'intersect': result = a.intersect(b); break
  }

  const { vertices, indices } = manifoldToArrays(result)

  return {
    id: resultId,
    shapeType: 'cube',
    params: {},
    color: objA.color,
    transform: { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0 },
    visible: true,
    locked: false,
    vertices,
    indices,
  }
}

export function countTriangles(obj: SceneObject): number {
  return obj.indices.length / 3
}
