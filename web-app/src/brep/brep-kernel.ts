// ============================================================
// brep-kernel.ts — FILLET-CHAMFER-BREP: OCCT (B-Rep) для скругления и фаски
// ============================================================
// Отдельное ядро от manifold: примитив строится в OpenCascade (OCCT WASM),
// ребро выбирается по индексу (порядок `shapes.edge.getEdges`), результат
// триангулируется (`shapeToMesh`, Y-up → Z-up) и отдаётся как mesh.
// Модуль чистый: используется воркером (браузер) и тестами (Node/Vitest).
// Пакет @bitbybit-dev/occt собран под бандлер — импорт динамический, чтобы
// 30 МБ WASM не попадали в основной бандл.

import type { ShapeParams, ShapeType } from '../csg/types'
// FILLET-CHAMFER-BREP: WASM OCCT отдаётся Vite как ассет (dev и build); имя файла — из пакета 1.7.0.
// При обновлении @bitbybit-dev/occt — обновить имя (или найти .wasm в пакете).
import occtWasmUrl from '@bitbybit-dev/occt/bitbybit-dev-occt/bitbybit-dev-occt.1b60444f.wasm?url'

export type BrepKind = 'fillet' | 'chamfer'

/** Примитив, на котором выполняется B-Rep операция (локальные координаты объекта). */
export interface BrepBase {
  shapeType: ShapeType
  params: ShapeParams
}

export interface BrepStep {
  kind: BrepKind
  size: number
  edgeIndexes: number[]
}

export interface BrepEdgeLine {
  /** Индекс ребра в B-Rep — его принимает filletEdges / chamferEdges */
  index: number
  /** Точки полилинии (локальные координаты объекта), x,y,z подряд */
  points: number[]
}

export interface BrepMesh {
  vertices: Float32Array
  indices: Uint32Array
  normals: Float32Array
  /** Рёбра результата — для повторного выбора в режиме правки */
  edges: BrepEdgeLine[]
}

export type BrepErrorCode = 'unsupported' | 'badParams' | 'badSize' | 'badEdge' | 'kernel'

export class BrepError extends Error {
  readonly code: BrepErrorCode
  constructor(code: BrepErrorCode, message: string) {
    super(message)
    this.code = code
    this.name = 'BrepError'
  }
}

interface Kernel {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  service: any
}

let kernelPromise: Promise<Kernel> | null = null

/**
 * FILLET-CHAIN-BREP: B-Rep цепочки в памяти воркера. Ключ — base + шаги;
 * повторный вход в режим (рёбра/следующая фаска) берёт готовое тело, а не
 * пересобирает из меша. Не сериализуется: после перезагрузки цепочка
 * воспроизводится из истории операций.
 */
const shapeCache = new Map<string, unknown>()
const MAX_CACHED_SHAPES = 32

export function brepCacheSize(): number {
  return shapeCache.size
}

export function resetBrepCache(): void {
  shapeCache.clear()
}

function chainKey(base: BrepBase, steps: BrepStep[]): string {
  return JSON.stringify({ s: base.shapeType, p: base.params, st: steps })
}

/** Загрузка OCCT WASM (ленивая, один раз на процесс/воркер). */
export function loadBrepKernel(): Promise<Kernel> {
  if (!kernelPromise) {
    kernelPromise = (async () => {
      const [{ default: createKernel }, { OCCTService }] = await Promise.all([
        import('@bitbybit-dev/occt/bitbybit-dev-occt/bitbybit-dev-occt'),
        import('@bitbybit-dev/occt'),
      ])
      // Node (тесты) грузит WASM из FS сам; браузер/воркер — по URL ассета Vite.
      const g = globalThis as { process?: { versions?: { node?: string } } }
      const isNode = !!g.process?.versions?.node
      const occ = await createKernel(isNode ? {} : { locateFile: () => occtWasmUrl })
      return { service: new OCCTService(occ) }
    })().catch((e) => {
      kernelPromise = null
      throw new BrepError('kernel', `OCCT init failed: ${e instanceof Error ? e.message : String(e)}`)
    })
  }
  return kernelPromise
}

/** Сброс кэша ядра (тесты; в браузере не нужен). */
export function resetBrepKernel(): void {
  kernelPromise = null
}

const num = (v: number | undefined, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : fallback

/**
 * Примитив приложения → тело OCCT. Приложение Z-up; OCCT строит Y-up,
 * `shapeToMesh(adjustYtoZ)` переводит обратно в Z-up.
 * Оси: куб — width X, height Y, depth Z; цилиндр/конус — высота по Z.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createBaseShape(service: any, base: BrepBase): any {
  const p = base.params
  if (base.shapeType === 'cube') {
    return service.shapes.solid.createBox({
      width: num(p.width, 20), length: num(p.depth, 20), height: num(p.height, 20),
      center: [0, 0, 0], originOnCenter: true,
    })
  }
  if (base.shapeType === 'cylinder') {
    return service.shapes.solid.createCylinder({
      radius: num(p.radius, 10), height: num(p.height, 20),
      center: [0, 0, 0], direction: [0, 1, 0], angle: 360, originOnCenter: true,
    })
  }
  if (base.shapeType === 'cone') {
    const h = num(p.height, 24)
    return service.shapes.solid.createCone({
      radius1: num(p.radius, 10), radius2: 0, height: h, angle: 360,
      center: [0, -h / 2, 0], direction: [0, 1, 0],
    })
  }
  if (base.shapeType === 'sphere') {
    return service.shapes.solid.createSphere({ radius: num(p.radius, 12), center: [0, 0, 0] })
  }
  if (base.shapeType === 'prism') {
    // Призма: многоугольник в плоскости XZ (Y-up OCCT) → extrude по Y; после adjustYtoZ — Z-up.
    const sides = Math.max(3, Math.min(64, Math.round(num(p.sides, 6))))
    const r = num(p.radius, 12)
    const h = num(p.height, 20)
    const points: number[][] = []
    for (let i = 0; i < sides; i++) {
      const a = (i / sides) * Math.PI * 2
      points.push([r * Math.cos(a), -h / 2, r * Math.sin(a)])
    }
    const face = service.shapes.face.createPolygonFace({ points })
    return service.operations.extrude({ shape: face, direction: [0, h, 0] })
  }
  throw new BrepError('unsupported', `B-Rep: unsupported primitive "${base.shapeType}"`)
}

/** Поддерживается ли примитив B-Rep инструментом (только примитивы, не CSG/импорт/резьба). */
export function isBrepShape(shapeType: ShapeType): boolean {
  return shapeType === 'cube' || shapeType === 'cylinder' || shapeType === 'cone' || shapeType === 'sphere' || shapeType === 'prism'
}

/** Предел радиуса/размера: не больше половины меньшей стороны рамки. */
export function maxBrepSize(base: BrepBase): number {
  const p = base.params
  const dims = base.shapeType === 'cube'
    ? [num(p.width, 20), num(p.height, 20), num(p.depth, 20)]
    : base.shapeType === 'sphere'
      ? [num(p.radius, 12) * 2, num(p.radius, 12) * 2, num(p.radius, 12) * 2]
      : [num(p.radius, 10) * 2, num(p.radius, 10) * 2, num(p.height, 20)]
  return Math.min(...dims) / 2
}

function sanitizeBase(base: BrepBase): BrepBase {
  if (!isBrepShape(base.shapeType)) throw new BrepError('unsupported', `B-Rep: unsupported primitive "${base.shapeType}"`)
  return { shapeType: base.shapeType, params: { ...base.params } }
}

function checkSize(base: BrepBase, size: number): number {
  if (!Number.isFinite(size) || size <= 0) throw new BrepError('badSize', 'B-Rep: size must be greater than zero')
  const max = maxBrepSize(base)
  if (size > max + 1e-9) throw new BrepError('badSize', `B-Rep: size ${size} exceeds the limit ${max}`)
  return size
}

interface RawEdge {
  edgeIndex: number
  vertexCoord: Array<{ x: number; y: number; z: number }>
}

/**
 * Тело OCCT для цепочки: примитив + последовательность fillet/chamfer.
 * Результат кэшируется в памяти воркера (FILLET-CHAIN-BREP), поэтому при
 * повторном входе в режим B-Rep не пересобирается из триангулированного меша.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function shapeForChain(service: any, base: BrepBase, steps: BrepStep[]): any {
  const key = chainKey(base, steps)
  const cached = shapeCache.get(key)
  if (cached) return cached
  let shape = createBaseShape(service, base)
  for (const step of steps) {
    const next = step.kind === 'fillet'
      ? service.fillets.filletEdges({ shape, radius: step.size, indexes: step.edgeIndexes })
      : service.fillets.chamferEdges({ shape, distance: step.size, indexes: step.edgeIndexes })
    shape = next
  }
  if (shapeCache.size >= MAX_CACHED_SHAPES) shapeCache.clear()
  shapeCache.set(key, shape)
  return shape
}

/** Полилинии рёбер B-Rep цепочки (после предыдущих скруглений/фасок). */
export async function brepEdgesForChain(baseInput: BrepBase, steps: BrepStep[] = []): Promise<BrepEdgeLine[]> {
  const base = sanitizeBase(baseInput)
  const safeSteps = normalizeSteps(steps)
  const { service } = await loadBrepKernel()
  try {
    const shape = shapeForChain(service, base, safeSteps)
    const mesh = service.shapeToMesh({ shape, precision: 0.2, adjustYtoZ: true })
    return (mesh.edgeList as RawEdge[]).map((e) => {
      const points: number[] = []
      for (const v of e.vertexCoord as unknown as Array<number | { x: number; y: number; z: number }>) {
        if (Array.isArray(v)) points.push(...v)
        else if (typeof v === 'object') points.push(v.x, v.y, v.z)
      }
      return { index: e.edgeIndex, points }
    })
  } catch (e) {
    if (e instanceof BrepError) throw e
    throw new BrepError('kernel', `B-Rep edges: ${e instanceof Error ? e.message : String(e)}`)
  }
}

function normalizeSteps(steps: BrepStep[]): BrepStep[] {
  return steps.map((s) => {
    if (s.kind !== 'fillet' && s.kind !== 'chamfer') throw new BrepError('unsupported', 'B-Rep: unknown step kind')
    if (!Number.isFinite(s.size) || s.size <= 0) throw new BrepError('badSize', 'B-Rep: step size must be positive')
    const edgeIndexes = [...new Set(s.edgeIndexes)].filter((i) => Number.isInteger(i) && i >= 0).sort((a, b) => a - b)
    if (edgeIndexes.length === 0) throw new BrepError('badEdge', 'B-Rep: step has no edges')
    return { kind: s.kind, size: s.size, edgeIndexes }
  })
}

/** Полилинии рёбер примитива (без цепочки) — совместимость. */
export async function brepEdges(baseInput: BrepBase): Promise<BrepEdgeLine[]> {
  return brepEdgesForChain(baseInput, [])
}

/** Скругление/фаска следующего шага цепочки (B-Rep, не меш). */
export async function brepFilletChain(
  baseInput: BrepBase,
  steps: BrepStep[],
  kind: BrepKind,
  sizeInput: number,
  edgeIndexes: number[],
): Promise<BrepMesh> {
  const base = sanitizeBase(baseInput)
  const size = checkSize(base, sizeInput)
  const safeSteps = normalizeSteps(steps)
  const indexes = [...new Set(edgeIndexes)].filter((i) => Number.isInteger(i) && i >= 0).sort((a, b) => a - b)
  if (indexes.length === 0) throw new BrepError('badEdge', 'B-Rep: no edge selected')
  const { service } = await loadBrepKernel()
  try {
    const current = shapeForChain(service, base, safeSteps)
    const edgesCount = service.shapes.edge.getEdges({ shape: current }).length
    if (indexes.some((i) => i >= edgesCount)) {
      throw new BrepError('badEdge', `B-Rep: edge index out of range (0..${edgesCount - 1})`)
    }
    const result = kind === 'fillet'
      ? service.fillets.filletEdges({ shape: current, radius: size, indexes })
      : service.fillets.chamferEdges({ shape: current, distance: size, indexes })
    const chain = [...safeSteps, { kind, size, edgeIndexes: indexes }]
    const key = chainKey(base, chain)
    if (shapeCache.size >= MAX_CACHED_SHAPES) shapeCache.clear()
    shapeCache.set(key, result)
    const mesh = service.shapeToMesh({ shape: result, precision: 0.15, adjustYtoZ: true })
    return meshFromOcct(mesh)
  } catch (e) {
    if (e instanceof BrepError) throw e
    throw new BrepError('kernel', `B-Rep ${kind}: ${e instanceof Error ? e.message : String(e)}`)
  }
}

export async function brepFillet(
  baseInput: BrepBase,
  kind: BrepKind,
  sizeInput: number,
  edgeIndexes: number[],
): Promise<BrepMesh> {
  return brepFilletChain(baseInput, [], kind, sizeInput, edgeIndexes)
}

/** Сборка одного indexed-меша из списка граней OCCT + рёбра результата. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function meshFromOcct(mesh: any): BrepMesh {
  const verts: number[] = []
  const norms: number[] = []
  const inds: number[] = []
  for (const f of mesh.faceList) {
    const offset = verts.length / 3
    verts.push(...f.vertexCoord)
    norms.push(...f.normalCoord)
    for (const i of f.triIndexes) inds.push(i + offset)
  }
  const edges: BrepEdgeLine[] = []
  for (const e of mesh.edgeList) {
    const points: number[] = []
    for (const v of e.vertexCoord as Array<number | { x: number; y: number; z: number }>) {
      if (Array.isArray(v)) points.push(...v)
      else if (typeof v === 'object') points.push(v.x, v.y, v.z)
    }
    edges.push({ index: e.edgeIndex, points })
  }
  return {
    vertices: new Float32Array(verts),
    indices: new Uint32Array(inds),
    normals: new Float32Array(norms),
    edges,
  }
}

/** AABB меша — для SceneObject.aabb. */
export function meshAabb(vertices: Float32Array): { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } } {
  const min = { x: Infinity, y: Infinity, z: Infinity }
  const max = { x: -Infinity, y: -Infinity, z: -Infinity }
  for (let i = 0; i < vertices.length; i += 3) {
    min.x = Math.min(min.x, vertices[i]); max.x = Math.max(max.x, vertices[i])
    min.y = Math.min(min.y, vertices[i + 1]); max.y = Math.max(max.y, vertices[i + 1])
    min.z = Math.min(min.z, vertices[i + 2]); max.z = Math.max(max.z, vertices[i + 2])
  }
  return { min, max }
}
