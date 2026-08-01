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

/**
 * Собрать все вершины меша в мировом пространстве.
 */
function collectWorldVertices(
  mesh: THREE.Mesh,
  vertices: THREE.Vector3[] = [],
): THREE.Vector3[] {
  const pos = mesh.geometry.attributes.position;
  if (!pos) return vertices;

  for (let i = 0; i < pos.count; i++) {
    const v = new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i));
    v.applyMatrix4(mesh.matrixWorld);
    vertices.push(v);
  }
  return vertices;
}

/**
 * Собрать все рёбра (попарные точки) меша в мировом пространстве.
 */
function collectWorldEdges(
  mesh: THREE.Mesh,
  edges: { from: THREE.Vector3; to: THREE.Vector3 }[] = [],
): { from: THREE.Vector3; to: THREE.Vector3 }[] {
  const pos = mesh.geometry.attributes.position;
  const idx = mesh.geometry.index;
  if (!pos || !idx) return edges;

  // Deduplicate edges using a Set with canonical key "i1,i2" (i1 < i2)
  const edgeSet = new Set<string>();

  for (let i = 0; i < idx.count; i += 3) {
    const indices = [idx.getX(i), idx.getX(i + 1), idx.getX(i + 2)];
    const triEdges = [
      [0, 1],
      [1, 2],
      [2, 0],
    ];
    for (const [a, b] of triEdges) {
      const i1 = indices[a];
      const i2 = indices[b];
      const key = i1 < i2 ? `${i1},${i2}` : `${i2},${i1}`;
      if (edgeSet.has(key)) continue;
      edgeSet.add(key);

      const from = new THREE.Vector3(
        pos.getX(i1),
        pos.getY(i1),
        pos.getZ(i1),
      );
      const to = new THREE.Vector3(
        pos.getX(i2),
        pos.getY(i2),
        pos.getZ(i2),
      );
      from.applyMatrix4(mesh.matrixWorld);
      to.applyMatrix4(mesh.matrixWorld);
      edges.push({ from, to });
    }
  }
  return edges;
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

  // Курсор-дистанция: расстояние от точки на луче (на глубине hitDistance) до hitPoint
  const cursorRay = new THREE.Raycaster();
  cursorRay.setFromCamera(screenPos, camera);
  const cursorPoint = new THREE.Vector3();
  cursorRay.ray.at(hitDistance, cursorPoint);
  const cursorDistance = hitPoint.distanceTo(cursorPoint);

  // Собираем вершины и рёбра в мировом пространстве
  const worldVerts: THREE.Vector3[] = [];
  const worldEdges: { from: THREE.Vector3; to: THREE.Vector3 }[] = [];
  collectWorldVertices(hitMesh, worldVerts);
  collectWorldEdges(hitMesh, worldEdges);

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
 */
export function snapLabel(type: SnapType): string {
  switch (type) {
    case "vertex":
      return "Точка";
    case "edge":
      return "Ребро";
    case "face":
      return "Грань";
    case "circle":
      return "Центр";
    default:
      return "";
  }
}
