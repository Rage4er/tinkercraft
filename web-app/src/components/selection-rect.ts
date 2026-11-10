// ============================================================
// selection-rect.ts — рамка выделения, как в AutoCAD (SELECTION-RECT)
// ============================================================
// Направление протяжки задаёт режим:
//  • слева направо — «окно» (window, синяя сплошная): выбираются объекты, ЦЕЛИКОМ внутри рамки
//    (все вершины видимой геометрии — в рамке и перед камерой);
//  • справа налево — «секущая» (crossing, зелёная пунктирная): всё, что рамку ЗАДЕВАЕТ
//    (вершина внутри или треугольник пересекает рамку — рамка внутри большой грани тоже считается).
// Считается по настоящей геометрии мешей (как видит пользователь): вершины × matrixWorld × камера.
// Треугольники, пересекающие плоскость камеры, для «секущей» пропускаются (они за краем кадра).

import * as THREE from 'three'

export type RectMode = 'window' | 'crossing'
/** Прямоугольник в NDC (−1…1, y вверх). */
export interface NdcRect { minX: number; minY: number; maxX: number; maxY: number }

/** Режим по направлению протяжки: вправо (или на месте) — окно, влево — секущая. */
export function rectModeOf(startX: number, endX: number): RectMode {
  return endX >= startX ? 'window' : 'crossing'
}

/** Прямоугольник экрана (px внутри элемента w × h) → NDC. */
export function rectToNdc(x0: number, y0: number, x1: number, y1: number, w: number, h: number): NdcRect {
  const nx = (x: number) => (x / w) * 2 - 1
  const ny = (y: number) => -((y / h) * 2 - 1)
  return { minX: Math.min(nx(x0), nx(x1)), maxX: Math.max(nx(x0), nx(x1)), minY: Math.min(ny(y0), ny(y1)), maxY: Math.max(ny(y0), ny(y1)) }
}

const _m = new THREE.Matrix4()

/** Вершины меша в NDC: [x, y] на вершину и флаг «видна камере» (перед ней, между near и far). */
function projectVertices(mesh: THREE.Mesh, camera: THREE.Camera): { xy: Float32Array; front: Uint8Array; count: number } {
  const pos = (mesh.geometry as THREE.BufferGeometry).getAttribute('position') as THREE.BufferAttribute | undefined
  const count = pos ? pos.count : 0
  const xy = new Float32Array(count * 2)
  const front = new Uint8Array(count)
  if (!pos) return { xy, front, count }
  mesh.updateWorldMatrix(true, false)
  _m.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).multiply(mesh.matrixWorld)
  const e = _m.elements
  for (let i = 0; i < count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i)
    const w = e[3] * x + e[7] * y + e[11] * z + e[15]
    if (w <= 1e-9) continue                                     // за камерой (перспектива)
    const nz = (e[2] * x + e[6] * y + e[10] * z + e[14]) / w
    if (nz < -1 || nz > 1) continue                              // вне ближней / дальней плоскости (и за орто-камерой)
    xy[i * 2] = (e[0] * x + e[4] * y + e[8] * z + e[12]) / w
    xy[i * 2 + 1] = (e[1] * x + e[5] * y + e[9] * z + e[13]) / w
    front[i] = 1
  }
  return { xy, front, count }
}

const inside = (r: NdcRect, x: number, y: number) => x >= r.minX && x <= r.maxX && y >= r.minY && y <= r.maxY

/** Треугольник (NDC) пересекается с прямоугольником — теорема о разделяющей оси. */
export function triangleOverlapsRect(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, r: NdcRect): boolean {
  if (Math.max(ax, bx, cx) < r.minX || Math.min(ax, bx, cx) > r.maxX) return false
  if (Math.max(ay, by, cy) < r.minY || Math.min(ay, by, cy) > r.maxY) return false
  const corners = [r.minX, r.minY, r.maxX, r.minY, r.maxX, r.maxY, r.minX, r.maxY]
  const tri = [ax, ay, bx, by, cx, cy]
  for (let k = 0; k < 3; k++) {
    const x0 = tri[k * 2], y0 = tri[k * 2 + 1]
    const x1 = tri[((k + 1) % 3) * 2], y1 = tri[((k + 1) % 3) * 2 + 1]
    const nx = y1 - y0, ny = x0 - x1                           // нормаль ребра
    let tMin = Infinity, tMax = -Infinity
    for (let i = 0; i < 3; i++) { const p = tri[i * 2] * nx + tri[i * 2 + 1] * ny; tMin = Math.min(tMin, p); tMax = Math.max(tMax, p) }
    let rMin = Infinity, rMax = -Infinity
    for (let i = 0; i < 4; i++) { const p = corners[i * 2] * nx + corners[i * 2 + 1] * ny; rMin = Math.min(rMin, p); rMax = Math.max(rMax, p) }
    if (tMax < rMin || rMax < tMin) return false
  }
  return true
}

/** Попадает ли меш в рамку в данном режиме (по его настоящей геометрии). */
export function meshInRect(mesh: THREE.Mesh, camera: THREE.Camera, rect: NdcRect, mode: RectMode): boolean {
  const { xy, front, count } = projectVertices(mesh, camera)
  if (count === 0) return false
  if (mode === 'window') {
    for (let i = 0; i < count; i++) if (!front[i] || !inside(rect, xy[i * 2], xy[i * 2 + 1])) return false
    return true
  }
  for (let i = 0; i < count; i++) if (front[i] && inside(rect, xy[i * 2], xy[i * 2 + 1])) return true
  const index = (mesh.geometry as THREE.BufferGeometry).getIndex()
  const tris = index ? index.count / 3 : count / 3
  for (let t = 0; t < tris; t++) {
    const a = index ? index.getX(t * 3) : t * 3
    const b = index ? index.getX(t * 3 + 1) : t * 3 + 1
    const c = index ? index.getX(t * 3 + 2) : t * 3 + 2
    if (!front[a] || !front[b] || !front[c]) continue
    if (triangleOverlapsRect(xy[a * 2], xy[a * 2 + 1], xy[b * 2], xy[b * 2 + 1], xy[c * 2], xy[c * 2 + 1], rect)) return true
  }
  return false
}

/** Id видимых объектов, попавших в рамку. */
export function objectsInRect(entries: Iterable<[string, { mesh: THREE.Mesh }]>, camera: THREE.Camera, rect: NdcRect, mode: RectMode): string[] {
  camera.updateMatrixWorld()
  const out: string[] = []
  for (const [id, { mesh }] of entries) {
    if (!mesh.visible) continue
    if (meshInRect(mesh, camera, rect, mode)) out.push(id)
  }
  return out
}
