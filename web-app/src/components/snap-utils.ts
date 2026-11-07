// ============================================================
// snap-utils.ts — Привязка (snap) точек линейки к геометрии
// ============================================================
// Поддерживаемые типы привязок:
//   vertex   — вершина (угол) фигуры
//   edge     — середина ребра
//   face     — центр грани (bounding box центра)
//   circle   — центр окружности (для сфер, цилиндров, торов)
//
// При клике в rulerMode точка автоматически «прилипает» к ближайшему
// элементу геометрии, если raycast пересёк фигуру.
// ============================================================

import * as THREE from "three";
import type { SceneObject } from "../csg/types";
import i18n from "../i18n";

// ---- Константы ----

/** Максимальное расстояние (в мировых единицах) для привязки к вершине. */
const SNAP_VERTEX_RADIUS = 2.0;

/** Максимальное расстояние (в мировых единицах) для привязки к ребру. */
const SNAP_EDGE_RADIUS = 2.0;

/** Максимальное расстояние (в мировых единицах) для привязки к грани. */
const SNAP_FACE_RADIUS = 2.0;

/** Максимальное расстояние (в мировых единицах) для привязки к центру окружности. */
const SNAP_CIRCLE_RADIUS = 3.0;

// ---- Типы ----

/** Тип привязки. */
export type SnapType = "vertex" | "edge" | "face" | "circle" | null;

/** Результат поиска привязки. */
export interface SnapResult {
  /** Точка привязки в мировых координатах. */
  point: THREE.Vector3;
  /** Тип привязки. null = нет привязки. */
  type: SnapType;
  /** Расстояние от точки пересечения луча до привязки (в мировых единицах). */
  snapDistance: number;
  /** Расстояние от курсора до точки (в мировых единицах, 0 если raycast не попал). */
  cursorDistance: number;
}

/**
 * Получить все видимые меши из meshMapRef.
 */
export function getSceneMeshes(
  meshMapRef: React.MutableRefObject<
    Map<
      string,
      {
        mesh: THREE.Mesh;
        pivot: THREE.Object3D;
        helper?: THREE.BoxHelper;
      }
    >
  >,
): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  for (const entry of meshMapRef.current.values()) {
    if (entry.mesh.visible) {
      meshes.push(entry.mesh);
    }
  }
  return meshes;
}

/**
 * Получить все pivot-объекты для трансформаций в мировом пространстве.
 */
export function getScenePivots(
  meshMapRef: React.MutableRefObject<
    Map<
      string,
      {
        mesh: THREE.Mesh;
        pivot: THREE.Object3D;
        helper?: THREE.BoxHelper;
      }
    >
  >,
): THREE.Object3D[] {
  const pivots: THREE.Object3D[] = [];
  for (const entry of meshMapRef.current.values()) {
    if (entry.mesh.visible) {
      pivots.push(entry.pivot);
    }
  }
  return pivots;
}

// ============================================================
// UX-AUDIT-35: кандидаты привязки — только треугольники рядом с точкой попадания
// ============================================================
// Раньше на каждый запрос (каждое движение мыши в режиме линейки) все вершины и рёбра меша
// переводились в мир и перебирались: импорт 100k — 60–110 мс на движение. Теперь у геометрии —
// сетка треугольников в локальных координатах (строится один раз, кэш по геометрии: она
// стабильна, пока объект не изменился — UX-AUDIT-21), а запрос берёт треугольники из ячеек вокруг
// точки попадания в радиусе привязки. Результат тот же, что у полного перебора: вершина или
// ребро ближе радиуса привязки лежат в треугольнике, чья рамка задевает зону запроса.
//
// UX-AUDIT-22: геометрия бывает и без индекса (CSG, импорт, цилиндр, конус — нормали по излому,
// UX-AUDIT-20/26): вершина повторена в каждом треугольнике, поэтому общее ребро соседних
// треугольников склеивается по позициям вершин.

/** Радиус, в котором ищутся кандидаты (мир): наибольший из радиусов вершины и ребра. */
const SNAP_QUERY_RADIUS = Math.max(SNAP_VERTEX_RADIUS, SNAP_EDGE_RADIUS);
/** Ячеек сетки по наибольшей стороне рамки (не меньше минимальной ячейки). */
const GRID_CELLS_MAX = 64;
const GRID_CELL_MIN = SNAP_QUERY_RADIUS;

interface TriangleGrid {
  min: THREE.Vector3;
  cell: number;
  nx: number;
  ny: number;
  nz: number;
  cells: Map<number, number[]>;
}

const gridCache = new WeakMap<THREE.BufferGeometry, TriangleGrid>();

/** Вершина `k` треугольника `t` — индекс в position (с индексом или без). */
function cornerIndex(geometry: THREE.BufferGeometry, t: number, k: number): number {
  const idx = geometry.index;
  return idx ? idx.getX(t * 3 + k) : t * 3 + k;
}

function triangleCount(geometry: THREE.BufferGeometry): number {
  const pos = geometry.attributes.position;
  return Math.floor((geometry.index ? geometry.index.count : pos.count) / 3);
}

/** Сетка треугольников геометрии (локальные координаты) — один раз на геометрию. */
function triangleGrid(geometry: THREE.BufferGeometry): TriangleGrid {
  const cached = gridCache.get(geometry);
  if (cached) return cached;
  const pos = geometry.attributes.position;
  if (!geometry.boundingBox) geometry.computeBoundingBox();
  const box = geometry.boundingBox!;
  const size = new THREE.Vector3().subVectors(box.max, box.min);
  const cell = Math.max(GRID_CELL_MIN, Math.max(size.x, size.y, size.z) / GRID_CELLS_MAX);
  const nx = Math.floor(size.x / cell) + 1, ny = Math.floor(size.y / cell) + 1, nz = Math.floor(size.z / cell) + 1;
  const cells = new Map<number, number[]>();
  const clampI = (v: number, n: number) => Math.max(0, Math.min(n - 1, Math.floor(v)));
  const tris = triangleCount(geometry);
  for (let t = 0; t < tris; t++) {
    let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
    for (let k = 0; k < 3; k++) {
      const i = cornerIndex(geometry, t, k);
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
      if (z < z0) z0 = z; if (z > z1) z1 = z;
    }
    const ax = clampI((x0 - box.min.x) / cell, nx), bx = clampI((x1 - box.min.x) / cell, nx);
    const ay = clampI((y0 - box.min.y) / cell, ny), by = clampI((y1 - box.min.y) / cell, ny);
    const az = clampI((z0 - box.min.z) / cell, nz), bz = clampI((z1 - box.min.z) / cell, nz);
    for (let iz = az; iz <= bz; iz++) for (let iy = ay; iy <= by; iy++) for (let ix = ax; ix <= bx; ix++) {
      const key = ix + nx * (iy + ny * iz);
      const list = cells.get(key);
      if (list) list.push(t); else cells.set(key, [t]);
    }
  }
  const grid = { min: box.min.clone(), cell, nx, ny, nz, cells };
  gridCache.set(geometry, grid);
  return grid;
}

/** Треугольники из ячеек, задевающих куб «центр ± радиус» (локальные координаты). */
function trianglesNear(grid: TriangleGrid, c: THREE.Vector3, r: number): number[] {
  const { min, cell, nx, ny, nz, cells } = grid;
  const lo = (v: number, m: number) => Math.max(0, Math.floor((v - r - m) / cell));
  const hi = (v: number, m: number, n: number) => Math.min(n - 1, Math.floor((v + r - m) / cell));
  const seen = new Set<number>();
  for (let iz = lo(c.z, min.z); iz <= hi(c.z, min.z, nz); iz++)
    for (let iy = lo(c.y, min.y); iy <= hi(c.y, min.y, ny); iy++)
      for (let ix = lo(c.x, min.x); ix <= hi(c.x, min.x, nx); ix++) {
        const list = cells.get(ix + nx * (iy + ny * iz));
        if (list) for (const t of list) seen.add(t);
      }
  return [...seen];
}

const _scale = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();

/**
 * Вершины и рёбра (мир) треугольников меша рядом с мировой точкой `hit`. Радиус запроса
 * пересчитан в локальные единицы с запасом на масштаб (÷ наименьший масштаб): всё, что в мире
 * ближе SNAP_QUERY_RADIUS, попадает в кандидаты.
 */
function nearbyWorldGeometry(
  mesh: THREE.Mesh,
  hit: THREE.Vector3,
): { vertices: THREE.Vector3[]; edges: { from: THREE.Vector3; to: THREE.Vector3 }[] } {
  const geometry = mesh.geometry as THREE.BufferGeometry;
  const pos = geometry.attributes.position;
  const vertices: THREE.Vector3[] = [];
  const edges: { from: THREE.Vector3; to: THREE.Vector3 }[] = [];
  if (!pos) return { vertices, edges };
  mesh.matrixWorld.decompose(_p, _q, _scale);
  const minScale = Math.max(1e-9, Math.min(Math.abs(_scale.x), Math.abs(_scale.y), Math.abs(_scale.z)));
  const local = mesh.worldToLocal(hit.clone());
  const tris = trianglesNear(triangleGrid(geometry), local, SNAP_QUERY_RADIUS / minScale);
  const m = mesh.matrixWorld;
  // Канонический индекс вершины: с индексом — сам индекс; без индекса — первый индекс с той же
  // позицией среди кандидатов (числовые ключи Map — без строк: на 100k это и было узким местом).
  const byX = new Map<number, Map<number, Map<number, number>>>();
  const canonical = geometry.index
    ? (i: number) => i
    : (i: number) => {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      let byY = byX.get(x);
      if (!byY) { byY = new Map(); byX.set(x, byY); }
      let byZ = byY.get(y);
      if (!byZ) { byZ = new Map(); byY.set(y, byZ); }
      const found = byZ.get(z);
      if (found !== undefined) return found;
      byZ.set(z, i);
      return i;
    };
  const world = new Map<number, THREE.Vector3>();
  const at = (i: number): THREE.Vector3 => {
    let w = world.get(i);
    if (!w) {
      w = new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)).applyMatrix4(m);
      world.set(i, w);
      vertices.push(w);
    }
    return w;
  };
  const n = pos.count;
  const edgeSet = new Set<number>();
  for (const t of tris) {
    const c0 = canonical(cornerIndex(geometry, t, 0)), c1 = canonical(cornerIndex(geometry, t, 1)), c2 = canonical(cornerIndex(geometry, t, 2));
    for (const [a, b] of [[c0, c1], [c1, c2], [c2, c0]]) {
      const key = a < b ? a * n + b : b * n + a;
      if (edgeSet.has(key)) continue;
      edgeSet.add(key);
      edges.push({ from: at(a), to: at(b) });
    }
  }
  return { vertices, edges };
}

/**
 * Find the closest vertex to a target point.
 * Exported for testing (TEST-R16-3).
 */
export function closestVertex(
  vertices: THREE.Vector3[],
  target: THREE.Vector3,
): { point: THREE.Vector3; distance: number } | null {
  let bestDist = SNAP_VERTEX_RADIUS;
  let bestPoint: THREE.Vector3 | null = null;

  for (const v of vertices) {
    const d = v.distanceTo(target);
    if (d < bestDist) {
      bestDist = d;
      bestPoint = v;
    }
  }

  return bestPoint
    ? { point: bestPoint, distance: bestDist }
    : null;
}

/**
 * Find the closest point on a line segment to a target point.
 * Exported for testing (TEST-R16-3).
 */
export function closestPointOnSegment(
  from: THREE.Vector3,
  to: THREE.Vector3,
  target: THREE.Vector3,
): { point: THREE.Vector3; distance: number } {
  const seg = new THREE.Vector3().subVectors(to, from);
  const lenSq = seg.lengthSq();
  let t = lenSq > 0
    ? seg.dot(new THREE.Vector3().subVectors(target, from)) / lenSq
    : 0;
  t = Math.max(0, Math.min(1, t));
  const point = new THREE.Vector3().copy(from).add(seg.clone().multiplyScalar(t));
  return { point, distance: point.distanceTo(target) };
}

/**
 * Find the closest edge to a target point.
 * Returns the closest point on the edge (not necessarily the midpoint).
 * Exported for testing (TEST-R16-3).
 */
export function closestEdge(
  edges: { from: THREE.Vector3; to: THREE.Vector3 }[],
  target: THREE.Vector3,
): { point: THREE.Vector3; distance: number } | null {
  let bestDist = SNAP_EDGE_RADIUS;
  let bestPoint: THREE.Vector3 | null = null;

  for (const { from, to } of edges) {
    const { point, distance } = closestPointOnSegment(from, to, target);
    if (distance < bestDist) {
      bestDist = distance;
      bestPoint = point;
    }
  }

  return bestPoint
    ? { point: bestPoint, distance: bestDist }
    : null;
}

/**
 * Центр bounding box меша в мировом пространстве.
 */
function faceCenter(mesh: THREE.Mesh): THREE.Vector3 {
  const box = new THREE.Box3();
  box.copy(mesh.geometry.boundingBox || new THREE.Box3())
    .applyMatrix4(mesh.matrixWorld);
  return box.getCenter(new THREE.Vector3());
}

/**
 * Вычислить «центр окружности» фигуры:
 * - sphere → центр bounding box
 * - cylinder/cone → центр основания (минимальный Z)
 * - torus → центр bounding box
 */
function circleCenter(
  mesh: THREE.Mesh,
  shapeType?: string,
): THREE.Vector3 | null {
  if (!shapeType) return null;

  const box = new THREE.Box3();
  box.copy(mesh.geometry.boundingBox || new THREE.Box3())
    .applyMatrix4(mesh.matrixWorld);
  const center = box.getCenter(new THREE.Vector3());

  if (shapeType === "sphere") {
    return center;
  }

  if (shapeType === "cylinder" || shapeType === "cone") {
    return new THREE.Vector3(center.x, center.y, box.min.z);
  }

  if (shapeType === "torus") {
    return center;
  }

  return null;
}

// ============================================================
// Главная функция: найти ближайшую привязку
// ============================================================

/**
 * Главная функция: найти ближайшую привязку к точке пересечения луча сцены.
 *
 * @param raycaster — луч из камеры
 * @param meshMapRef — ref на карту мешей из Viewport3D
 * @param camera — камера для вычисления курсор-дистанции
 * @param screenPos — позиция курсора в NDC
 * @param shapeTypeForMesh — маппинг id → shapeType (для circle snap)
 * @returns результат привязки или null
 */
export function findNearestSnap(
  raycaster: THREE.Raycaster,
  meshMapRef: React.MutableRefObject<
    Map<
      string,
      {
        mesh: THREE.Mesh;
        pivot: THREE.Object3D;
        helper?: THREE.BoxHelper;
      }
    >
  >,
  camera: THREE.Camera,
  screenPos: THREE.Vector2,
  shapeTypeForMesh?: Map<string, string>,
): SnapResult | null {
  // Собираем меши
  const meshes = getSceneMeshes(meshMapRef);
  if (meshes.length === 0) return null;

  // Raycast
  const hits = raycaster.intersectObjects(meshes, false);
  if (hits.length === 0) return null;

  const hit = hits[0];
  const hitPoint = hit.point.clone();
  const hitMesh = hit.object as THREE.Mesh;
  const hitDistance = hit.distance;

  // FIX (LOW-18-27): Reuse the original raycaster instead of creating a second one.
  // The raycaster already has the correct camera ray — no need for a new Raycaster.
  const cursorPoint = new THREE.Vector3()
  raycaster.ray.at(hitDistance, cursorPoint)
  const cursorDistance = hitPoint.distanceTo(cursorPoint)

  // UX-AUDIT-35: вершины и рёбра — только рядом с точкой попадания (сетка треугольников)
  const { vertices: worldVerts, edges: worldEdges } = nearbyWorldGeometry(hitMesh, hitPoint);

  // Находим ближайшую вершину
  const vertResult = closestVertex(worldVerts, hitPoint);
  // Находим ближайшее ребро
  const edgeResult = closestEdge(worldEdges, hitPoint);
  // Центр грани (bounding box)
  const facePoint = faceCenter(hitMesh);
  const faceDist = facePoint.distanceTo(hitPoint);
  // Центр окружности
  const shapeType = shapeTypeForMesh?.get(hitMesh.userData.objectId as string);
  const circlePt = circleCenter(hitMesh, shapeType);
  const circleDist = circlePt ? circlePt.distanceTo(hitPoint) : Infinity;

  // Кандидаты на привязку
  const candidates: {
    type: SnapType;
    point: THREE.Vector3;
    threshold: number;
  }[] = [];

  if (vertResult) {
    candidates.push({
      type: "vertex",
      point: vertResult.point,
      threshold: vertResult.distance,
    });
  }
  if (edgeResult) {
    candidates.push({
      type: "edge",
      point: edgeResult.point,
      threshold: edgeResult.distance,
    });
  }
  if (faceDist <= SNAP_FACE_RADIUS) {
    candidates.push({ type: "face", point: facePoint, threshold: faceDist });
  }
  if (circlePt && circleDist <= SNAP_CIRCLE_RADIUS) {
    candidates.push({
      type: "circle",
      point: circlePt,
      threshold: circleDist,
    });
  }

  // Приоритет: vertex > edge > circle > face
  const priority: Record<string, number> = {
    vertex: 0,
    edge: 1,
    circle: 2,
    face: 3,
  };
  candidates.sort((a, b) => {
    const pa = priority[a.type!] ?? 999;
    const pb = priority[b.type!] ?? 999;
    if (pa !== pb) return pa - pb;
    return a.threshold - b.threshold;
  });

  // Если привязка найдена — возвращаем результат
  if (candidates.length > 0) {
    const best = candidates[0];
    return {
      point: best.point,
      type: best.type,
      snapDistance: best.threshold,
      cursorDistance,
    };
  }

  // Raycast попал, но привязка не найдена — возвращаем point без type
  return {
    point: hitPoint,
    type: null,
    snapDistance: Infinity,
    cursorDistance,
  };
}

// ============================================================
// Визуальные маркеры привязки
// ============================================================

/** Цвет маркера по типу привязки. */
function snapIndicatorColor(type: SnapType): number {
  switch (type) {
    case "vertex":
      return 0xff4444; // красный — вершина
    case "edge":
      return 0x44ff44; // зелёный — ребро
    case "circle":
      return 0x4488ff; // синий — центр окружности
    case "face":
      return 0xffff44; // жёлтый — грань
    default:
      return 0xffffff; // белый — без привязки
  }
}

/**
 * Создать визуальный маркер привязки (маленькая сфера).
 */
export function createSnapIndicator(
  point: THREE.Vector3,
  type: SnapType,
): THREE.Mesh {
  const indicator = new THREE.Mesh(
    new THREE.SphereGeometry(0.5, 8, 8),
    new THREE.MeshBasicMaterial({
      color: snapIndicatorColor(type),
      transparent: true,
      opacity: 0.9,
    }),
  );
  indicator.position.copy(point);
  indicator.userData.isSnapIndicator = true;
  return indicator;
}

/**
 * Удалить все маркеры привязки из сцены.
 */
export function removeSnapIndicators(scene: THREE.Scene | null): void {
  if (!scene) return;
  const toRemove: THREE.Object3D[] = [];
  scene.traverse((obj) => {
    if ((obj as THREE.Mesh).userData.isSnapIndicator) {
      toRemove.push(obj);
    }
  });
  for (const obj of toRemove) {
    scene.remove(obj);
    if ((obj as THREE.Mesh).geometry) (obj as THREE.Mesh).geometry.dispose();
    const mat = (obj as THREE.Mesh).material;
    if (mat && !Array.isArray(mat)) mat.dispose();
  }
}

/**
 * Получить текстовую метку типа привязки.
 * i18n: Uses i18n.t() directly (non-React module).
 */
export function snapLabel(type: SnapType): string {
  switch (type) {
    case "vertex":
      return i18n.t("snap.vertex");
    case "edge":
      return i18n.t("snap.edge");
    case "face":
      return i18n.t("snap.face");
    case "circle":
      return i18n.t("snap.circle");
    default:
      return "";
  }
}
