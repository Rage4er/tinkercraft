// ============================================================
// object-geometry — геометрия Three.js для объекта сцены (затенение) — UX-AUDIT-20
// ============================================================
//
// Единая точка для useMeshSync: и создание меша, и обновление вершин (правка размера,
// правка ребёнка CSG). Раньше:
//  • создание: CSG и импорт (пустые `params`) шли в «плоскую» ветку куба — нормаль каждой
//    грани отдельно → сфера после объединения гранёная;
//  • обновление: `computeVertexNormals` по всем вершинам → у куба после правки размера
//    сглаживались углы.
// Теперь:
//  • куб, призма, пирамида — плоские грани (нормаль грани);
//  • CSG и импорт — нормали по углу излома (`toCreasedNormals`, CREASE_ANGLE_DEG): соседние
//    треугольники с углом меньше порога сглаживаются (сфера, цилиндр, тор в составе CSG —
//    гладкие), больше — остаются острыми (рёбра куба);
//  • цилиндр и конус — тоже по излому (UX-AUDIT-26): гладкий бок, острая кромка торца. Раньше —
//    «гладко» по общим вершинам: нормаль кромки усреднялась между торцом и боком (до ≈ 90°),
//    торец выглядел выпуклым, а тот же цилиндр в CSG — с острой кромкой;
//  • сфера и тор — гладкие нормали воркера (или пересчитанные): острых рёбер у них нет.
// Порядок треугольников сохраняется (выбор грани, привязка линейки работают по нему).

import * as THREE from "three";
import { toCreasedNormals } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { SceneObject } from "../csg/types";

/** Порог излома (°): острее — ребро, мягче — гладко. 32 сегмента сферы — 11,25°, грани куба — 90°. */
export const CREASE_ANGLE_DEG = 30;

const FLAT_SHAPES = ["cube", "prism", "pyramid"];
/** UX-AUDIT-26: гладкий бок + острая кромка торца */
const CREASE_SHAPES = ["cylinder", "cone"];

/** Как затенять объект: плоско (грани), по углу излома (CSG, импорт, цилиндр, конус) или гладко. */
export function shadingOf(obj: Pick<SceneObject, "shapeType" | "params">): "flat" | "crease" | "smooth" {
  if (FLAT_SHAPES.includes(obj.shapeType)) return "flat";
  if (CREASE_SHAPES.includes(obj.shapeType)) return "crease";
  if (!obj.params || Object.keys(obj.params).length === 0) return "crease";
  return "smooth";
}

/** Плоское затенение: 3 своих вершины на треугольник, нормаль — по грани. */
function flatGeometry(obj: Pick<SceneObject, "vertices" | "indices">): THREE.BufferGeometry {
  const numTris = obj.indices.length / 3;
  const flatVerts = new Float32Array(numTris * 9);
  const flatNormals = new Float32Array(numTris * 9);
  const flatIndices = new Uint32Array(numTris * 3);
  for (let t = 0; t < numTris; t++) {
    const i0 = obj.indices[t * 3], i1 = obj.indices[t * 3 + 1], i2 = obj.indices[t * 3 + 2];
    const v0x = obj.vertices[i0 * 3], v0y = obj.vertices[i0 * 3 + 1], v0z = obj.vertices[i0 * 3 + 2];
    const v1x = obj.vertices[i1 * 3], v1y = obj.vertices[i1 * 3 + 1], v1z = obj.vertices[i1 * 3 + 2];
    const v2x = obj.vertices[i2 * 3], v2y = obj.vertices[i2 * 3 + 1], v2z = obj.vertices[i2 * 3 + 2];
    const e1x = v1x - v0x, e1y = v1y - v0y, e1z = v1z - v0z;
    const e2x = v2x - v0x, e2y = v2y - v0y, e2z = v2z - v0z;
    let nx = e1y * e2z - e1z * e2y;
    let ny = e1z * e2x - e1x * e2z;
    let nz = e1x * e2y - e1y * e2x;
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (len > 0.0001) { nx /= len; ny /= len; nz /= len; } else { nx = 0; ny = 1; nz = 0; }
    for (let v = 0; v < 3; v++) {
      const dst = (t * 3 + v) * 3;
      const src = obj.indices[t * 3 + v];
      flatVerts[dst] = obj.vertices[src * 3];
      flatVerts[dst + 1] = obj.vertices[src * 3 + 1];
      flatVerts[dst + 2] = obj.vertices[src * 3 + 2];
      flatNormals[dst] = nx; flatNormals[dst + 1] = ny; flatNormals[dst + 2] = nz;
      flatIndices[t * 3 + v] = t * 3 + v;
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(flatVerts, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(flatNormals, 3));
  geometry.setIndex(new THREE.BufferAttribute(flatIndices, 1));
  return geometry;
}

/** Геометрия объекта: позиции = `obj.vertices` (в origin, трансформ — у pivot), нормали — по виду затенения. */
export function buildObjectGeometry(obj: Pick<SceneObject, "shapeType" | "params" | "vertices" | "indices" | "normals">): THREE.BufferGeometry {
  const shading = shadingOf(obj);
  let geometry: THREE.BufferGeometry;
  if (shading === "flat") {
    geometry = flatGeometry(obj);
  } else {
    const indexed = new THREE.BufferGeometry();
    indexed.setAttribute("position", new THREE.Float32BufferAttribute(obj.vertices, 3));
    indexed.setIndex(new THREE.BufferAttribute(obj.indices, 1));
    if (shading === "crease") {
      geometry = toCreasedNormals(indexed, THREE.MathUtils.degToRad(CREASE_ANGLE_DEG));
      indexed.dispose();
    } else {
      geometry = indexed;
      // Smooth shading: нормали из воркера (или пересчитываем)
      if (obj.normals && obj.normals.length > 0) {
        const n = new Float32Array(obj.normals.length);
        for (let i = 0; i < obj.normals.length; i += 3) {
          const nx = obj.normals[i], ny = obj.normals[i + 1], nz = obj.normals[i + 2];
          const length = Math.sqrt(nx * nx + ny * ny + nz * nz);
          if (length > 0.0001) { n[i] = nx / length; n[i + 1] = ny / length; n[i + 2] = nz / length; }
          else { n[i] = 0; n[i + 1] = 1; n[i + 2] = 0; }
        }
        geometry.setAttribute("normal", new THREE.Float32BufferAttribute(n, 3));
      } else {
        geometry.computeVertexNormals();
      }
    }
  }
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}
