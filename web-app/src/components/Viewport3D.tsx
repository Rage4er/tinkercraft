import {
  useEffect,
  useRef,
  useCallback,
  useState,
} from "react";
import * as THREE from "three";
import type { SceneObject, TransformNR } from "../csg/types";
import ViewCube from "./ViewCube";
import { useTranslation } from "react-i18next";
import {
  useThreeInit,
  useMeshSync,
  useRulerMode,
  useMirrorPreview,
  usePlacementPreview,
  useDimensionsRender,
  useDimensionModePreview,
  type GizmoMode,
  setGridColor,
} from "./viewport-hooks";
import { devLogEvent, devLogPointer, devLogTransform } from "../utils/debug";
import { fmtPoint, fmtPoint2 } from "../utils/debug-format";
import { useAlignModeStore } from "../store/align-mode";
import { pickFace, planarFaceTriangles } from "./align-picking";
import { usePlacementModeStore } from "../store/placement-mode";
import type { PlacementAim } from "../store/placement";
import { useDimensionModeStore, type DimensionHover } from "../store/dimension-mode";
import { useDimensionsStore } from "../store/dimensions-store";
import { useDocumentStore } from "../store/document-store";
import { isDimensionAlive } from "../store/dimensions";
import { findNearestSnap } from "./snap-utils";
import { useSettingsStore } from "../store/settings";
import { themeById, hexColor } from "../themes";
import { pickDimension } from "./dimension-render";
import { createMiddleDoubleClick } from "./viewport-nav";
import { objectsInRect, rectModeOf, rectToNdc, type RectMode } from "./selection-rect";
import { fitDistance, FIT_DIR } from "./camera-fit";

export type { GizmoMode } from "./viewport-hooks";

// Interaction thresholds
const DRAG_THRESHOLD_PX = 4;
/** ALIGN-UI-REVIT: не чаще одного raycast наведения за столько мс */
const ALIGN_HOVER_THROTTLE_MS = 50;
/** PLUG-AND-PLAY: превью размещения — не чаще раза за столько мс (последнее положение — догоняется) */
const PLACEMENT_AIM_THROTTLE_MS = 50;

/** Полупрозрачная подсветка (поверх меша, вне raycast) из мировых треугольников. */
function makeAlignHighlight(positions: Float32Array, color: number, opacity: number): THREE.Mesh {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const m = new THREE.MeshBasicMaterial({
    color, transparent: true, opacity, side: THREE.DoubleSide, depthTest: false, depthWrite: false,
  });
  const mesh = new THREE.Mesh(g, m);
  mesh.renderOrder = 999;
  mesh.raycast = () => { };
  mesh.userData.alignHighlight = true;
  return mesh;
}

/** Плоскость оси X/Y/Z через начало координат (квадрат 400 мм) — подсветка плоскости режима. */
function axisPlanePositions(axis: "X" | "Y" | "Z"): Float32Array {
  const s = 200;
  const q = axis === "X"
    ? [[0, -s, -s], [0, s, -s], [0, s, s], [0, -s, s]]
    : axis === "Y"
      ? [[-s, 0, -s], [s, 0, -s], [s, 0, s], [-s, 0, s]]
      : [[-s, -s, 0], [s, -s, 0], [s, s, 0], [-s, s, 0]];
  return new Float32Array([...q[0], ...q[1], ...q[2], ...q[0], ...q[2], ...q[3]]);
}

/**
 * PLUG-AND-PLAY: идёт ли размещение. Обработчики читают стор, а не ref после рендера: клик по
 * иконке и клик по сцене, пришедшие из очереди ввода подряд (медленный CPU), обрабатываются до
 * перерисовки.
 */
const isPlacing = () => usePlacementModeStore.getState().placementMode !== null;
/** DIMENSIONS: идёт ли режим «Размер» (из стора — как `isPlacing`). */
const isDimensioning = () => useDimensionModeStore.getState().dimensionMode !== null;
/** DIMENSIONS: наведение в режиме «Размер» — не чаще раза за столько мс (последнее — догоняется). */
const DIMENSION_HOVER_THROTTLE_MS = 50;

function disposeHighlight(scene: THREE.Scene, mesh: THREE.Mesh): void {
  scene.remove(mesh);
  mesh.geometry.dispose();
  (mesh.material as THREE.Material).dispose();
}


interface Props {
  workerOk: boolean;
  objects: SceneObject[];
  selectedIds: Set<string>;
  onSelect: (id: string | null, addToSelection: boolean) => void;
  onMultiSelect?: (ids: string[]) => void;
  onFpsUpdate: (fps: number) => void;
  fitViewRef?: React.MutableRefObject<(() => void) | null>;
  resetViewRef?: React.MutableRefObject<(() => void) | null>;
  gizmoMode: GizmoMode;
  onTransformEnd: (id: string, transform: TransformNR) => void;
  snapValue: number;
  rulerMode?: boolean;
  onRulerMeasure?: (dist: number) => void;
  cameraMode?: 'perspective' | 'orthographic';
  previewObject?: (SceneObject & { isMirrorPreview: boolean }) | null;
  mirrorPreviewPlane?: 'XY' | 'XZ' | 'YZ' | null;
  busy?: boolean;
  theme?: 'dark' | 'light';
}

function checkWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return !!(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

export default function Viewport3D({
  objects,
  selectedIds,
  onSelect,
  onMultiSelect,
  onFpsUpdate,
  fitViewRef,
  resetViewRef,
  gizmoMode,
  onTransformEnd,
  snapValue,
  rulerMode = false,
  onRulerMeasure,
  workerOk,
  cameraMode = 'perspective',
  previewObject = null,
  mirrorPreviewPlane = null,
  busy = false,
  theme = 'dark',
}: Props) {
  const { t } = useTranslation();
  const [webglOk] = useState<boolean>(() => checkWebGL());

  // ---- Хук 1: Инициализация Three.js ----
  const {
    sceneReady,
    containerRef,
    sceneRef,
    gridRef,
    cameraRef,
    activeCameraRef,
    controlsRef,
    transformCtRef,
    meshMapRef,
    fitTargetRef,
    cubeCamera,
    cubeCtrl,
  } = useThreeInit(webglOk, cameraMode, onFpsUpdate, selectedIds);

  // ---- Refs for props ----
  const onTransformEndRef = useRef(onTransformEnd);
  useEffect(() => {
    onTransformEndRef.current = onTransformEnd;
  }, [onTransformEnd]);

  const snapValueRef = useRef(snapValue);
  useEffect(() => {
    snapValueRef.current = snapValue;
  }, [snapValue]);

  const selectedIdsRef = useRef(selectedIds);
  useEffect(() => {
    selectedIdsRef.current = selectedIds;
  }, [selectedIds]);

  const objectsRef = useRef(objects);
  useEffect(() => {
    objectsRef.current = objects;
  }, [objects]);

  // ---- Смена фона и грида при смене темы ----
  // THEME-ENGINE: цвета сцены — из темы настроек (src/themes/*.json); база темы — проп `theme`
  const themeId = useSettingsStore((s) => s.theme);
  useEffect(() => {
    if (!sceneRef.current) return;
    const chosen = themeById(themeId);
    const def = chosen.base === theme ? chosen : themeById(theme);
    sceneRef.current.background = new THREE.Color(hexColor(def.scene.background));
    setGridColor(gridRef.current, theme, { minor: hexColor(def.scene.gridMinor), major: hexColor(def.scene.gridMajor) });
  }, [theme, themeId, sceneRef, gridRef]);

  // ---- Хук 2: Синхронизация mesh ----
  useMeshSync(objects, sceneReady, sceneRef, meshMapRef, selectedIds);

  // ---- Хук 3: Логика линейки (ruler) ----
  const {
    shapeTypeMapRef,
    handleRulerPointerDown,
    handleRulerPointerMove,
  } = useRulerMode(rulerMode, sceneRef, cameraRef, meshMapRef, onRulerMeasure);

  // Sync shapeType map for circle snap detection
  useEffect(() => {
    const map = new Map<string, string>();
    for (const [id, obj] of Object.entries(objects)) {
      map.set(id, obj.shapeType);
    }
    shapeTypeMapRef.current = map;
  }, [objects, shapeTypeMapRef]);

  // ---- ALIGN-UI-REVIT: режим выравнивания ----
  const alignMode = useAlignModeStore((s) => s.alignMode);
  const alignActive = alignMode !== null;
  const alignActiveRef = useRef(alignActive);
  useEffect(() => {
    alignActiveRef.current = alignActive;
  }, [alignActive]);
  const alignHoverAtRef = useRef(0);
  const hovered = alignMode?.hoveredFace ?? null;
  const alignPlane = alignMode?.plane ?? null;

  /** Луч из камеры через точку экрана (null — нет камеры / контейнера). */
  const rayAt = useCallback(
    (clientX: number, clientY: number) => {
      const camera = activeCameraRef.current ?? cameraRef.current;
      const container = containerRef.current;
      if (!camera || !container) return null;
      const rect = container.getBoundingClientRect();
      const x = ((clientX - rect.left) / rect.width) * 2 - 1;
      const y = -((clientY - rect.top) / rect.height) * 2 + 1;
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(new THREE.Vector2(x, y), camera);
      return raycaster;
    },
    [activeCameraRef, cameraRef, containerRef],
  );

  /** Грань под курсором (мировые нормаль и точка) или null. */
  const pickAt = useCallback(
    (clientX: number, clientY: number) => {
      const raycaster = rayAt(clientX, clientY);
      if (!raycaster) return null;
      const meshes: THREE.Mesh[] = [];
      for (const entry of meshMapRef.current.values()) if (entry.mesh.visible) meshes.push(entry.mesh);
      return pickFace(raycaster, meshes);
    },
    [rayAt, meshMapRef],
  );

  // ---- PLUG-AND-PLAY: режим размещения ----
  const placement = usePlacementModeStore((s) => s.placementMode);
  const placementActive = placement !== null;
  usePlacementPreview(sceneRef, objects.length);

  /** Куда смотрит курсор: луч и грань объекта под ним (null — нет камеры). */
  const aimAt = useCallback(
    (clientX: number, clientY: number): PlacementAim | null => {
      const raycaster = rayAt(clientX, clientY);
      if (!raycaster) return null;
      const meshes: THREE.Mesh[] = [];
      for (const entry of meshMapRef.current.values()) if (entry.mesh.visible) meshes.push(entry.mesh);
      const { origin, direction } = raycaster.ray;
      return {
        ray: { origin: { x: origin.x, y: origin.y, z: origin.z }, direction: { x: direction.x, y: direction.y, z: direction.z } },
        face: pickFace(raycaster, meshes),
      };
    },
    [rayAt, meshMapRef],
  );
  // превью: не чаще PLACEMENT_AIM_THROTTLE_MS, последнее положение курсора догоняется таймером
  const placementAimAtRef = useRef(0);
  const placementAimTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const placementAimPosRef = useRef<{ x: number; y: number } | null>(null);
  const clearPlacementAimTimer = useCallback(() => {
    if (placementAimTimerRef.current) clearTimeout(placementAimTimerRef.current);
    placementAimTimerRef.current = null;
  }, []);
  const schedulePlacementAim = useCallback(
    (clientX: number, clientY: number) => {
      placementAimPosRef.current = { x: clientX, y: clientY };
      const run = () => {
        placementAimTimerRef.current = null;
        const pos = placementAimPosRef.current;
        if (!pos || !isPlacing()) return;
        placementAimAtRef.current = performance.now();
        usePlacementModeStore.getState().aim(aimAt(pos.x, pos.y));
      };
      const wait = PLACEMENT_AIM_THROTTLE_MS - (performance.now() - placementAimAtRef.current);
      if (wait <= 0) { clearPlacementAimTimer(); run(); }
      else if (!placementAimTimerRef.current) placementAimTimerRef.current = setTimeout(run, wait);
    },
    [aimAt, clearPlacementAimTimer],
  );
  useEffect(() => clearPlacementAimTimer, [clearPlacementAimTimer]);

  // ---- DIMENSIONS: слой размеров и режим «Размер» ----
  const dimRootRef = useDimensionsRender(sceneRef, sceneReady);
  useDimensionModePreview(sceneRef);
  const dimMode = useDimensionModeStore((s) => s.dimensionMode);
  const dimensionActive = dimMode !== null;
  const dimensionsList = useDimensionsStore((s) => s.dimensions);
  const showDimensions = useDimensionsStore((s) => s.showDimensions);
  const docObjects = useDocumentStore((s) => s.objects);
  const visibleDimensions = showDimensions ? dimensionsList.filter((d) => isDimensionAlive(d, docObjects)).length : 0;

  /** Точка объекта под курсором с привязкой (вершина > ребро > центр окружности > грань) или null. */
  const snapAt = useCallback(
    (clientX: number, clientY: number): DimensionHover | null => {
      const raycaster = rayAt(clientX, clientY);
      const camera = activeCameraRef.current ?? cameraRef.current;
      const container = containerRef.current;
      if (!raycaster || !camera || !container) return null;
      const rect = container.getBoundingClientRect();
      const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
      const snap = findNearestSnap(raycaster, meshMapRef, camera, ndc, shapeTypeMapRef.current);
      if (!snap?.objectId) return null;
      return { objectId: snap.objectId, point: { x: snap.point.x, y: snap.point.y, z: snap.point.z }, snap: snap.type };
    },
    [rayAt, activeCameraRef, cameraRef, containerRef, meshMapRef, shapeTypeMapRef],
  );
  const dimHoverAtRef = useRef(0);
  const dimHoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dimHoverPosRef = useRef<{ x: number; y: number } | null>(null);
  const clearDimHoverTimer = useCallback(() => {
    if (dimHoverTimerRef.current) clearTimeout(dimHoverTimerRef.current);
    dimHoverTimerRef.current = null;
  }, []);
  const scheduleDimHover = useCallback(
    (clientX: number, clientY: number) => {
      dimHoverPosRef.current = { x: clientX, y: clientY };
      const run = () => {
        dimHoverTimerRef.current = null;
        const pos = dimHoverPosRef.current;
        if (!pos || !isDimensioning()) return;
        dimHoverAtRef.current = performance.now();
        useDimensionModeStore.getState().setHover(snapAt(pos.x, pos.y));
      };
      const wait = DIMENSION_HOVER_THROTTLE_MS - (performance.now() - dimHoverAtRef.current);
      if (wait <= 0) { clearDimHoverTimer(); run(); }
      else if (!dimHoverTimerRef.current) dimHoverTimerRef.current = setTimeout(run, wait);
    },
    [snapAt, clearDimHoverTimer],
  );
  useEffect(() => clearDimHoverTimer, [clearDimHoverTimer]);

  // подсветка грани под курсором (вся плоская грань — то, что встанет в плоскость)
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || !hovered) return;
    const entry = meshMapRef.current.get(hovered.objectId);
    if (!entry) return;
    const hl = makeAlignHighlight(planarFaceTriangles(entry.mesh, hovered.triangleIndex), 0x89b4fa, 0.45);
    scene.add(hl);
    return () => disposeHighlight(scene, hl);
  }, [hovered, objects, sceneRef, meshMapRef]);

  // подсветка выбранной плоскости A (грань объекта или плоскость оси)
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || !alignPlane) return;
    let positions: Float32Array | null = null;
    if ("axis" in alignPlane) positions = axisPlanePositions(alignPlane.axis);
    else if (alignPlane.triangleIndex !== undefined) {
      const entry = meshMapRef.current.get(alignPlane.objectId);
      if (entry) positions = planarFaceTriangles(entry.mesh, alignPlane.triangleIndex);
    }
    if (!positions || positions.length === 0) return;
    const hl = makeAlignHighlight(positions, 0xf9e2af, "axis" in alignPlane ? 0.12 : 0.5);
    scene.add(hl);
    return () => disposeHighlight(scene, hl);
  }, [alignPlane, objects, sceneRef, meshMapRef]);

  // ---- Хук 4: Mirror preview ----
  useMirrorPreview(previewObject, mirrorPreviewPlane, sceneRef);

  // ---- Gizmo mode ----
  useEffect(() => {
    type TC = {
      detach(): void;
      attach(o: THREE.Object3D): void;
      setMode(m: string): void;
    };
    const tc = transformCtRef.current as unknown as TC | null;
    if (!tc) return;
    // PLUG-AND-PLAY: на время размещения гизмо скрыт (клик — место фигуры, а не захват гизмо)
    if (gizmoMode === "none" || selectedIds.size === 0 || placementActive || dimensionActive) {
      tc.detach();
      return;
    }
    const entry = meshMapRef.current.get([...selectedIds][0]);
    if (!entry) {
      tc.detach();
      return;
    }
    tc.setMode(gizmoMode);
    tc.attach(entry.pivot);
  }, [gizmoMode, selectedIds, transformCtRef, meshMapRef, placementActive, dimensionActive]);

  // ---- TransformControls mouseUp handler ----
  useEffect(() => {
    const tc = transformCtRef.current;
    if (!tc) return;

    const handleMouseUp = () => {
      const obj = (tc as unknown as { object: THREE.Object3D | undefined }).object;
      if (!obj) return;
      const id = obj.userData.objectId as string;
      const pos = obj.position;
      const rot = obj.rotation;
      const scl = obj.scale;
      const snap = snapValueRef.current;
      const sx = snap > 0 ? Math.round(pos.x / snap) * snap : pos.x;
      const sy = snap > 0 ? Math.round(pos.y / snap) * snap : pos.y;
      const sz = snap > 0 ? Math.round(pos.z / snap) * snap : pos.z;
      if (snap > 0) obj.position.set(sx, sy, sz);
      const rx = THREE.MathUtils.radToDeg(rot.x);
      const ry = THREE.MathUtils.radToDeg(rot.y);
      const rz = THREE.MathUtils.radToDeg(rot.z);
      devLogTransform('gizmoMouseUp', id, { x: sx, y: sy, z: sz, rotX: rx, rotY: ry, rotZ: rz, scaleX: scl.x, scaleY: scl.y, scaleZ: scl.z });
      devLogEvent('transform', 'gizmoMouseUp', { id, raw: fmtPoint({ x: pos.x, y: pos.y, z: pos.z }), snapped: fmtPoint({ x: sx, y: sy, z: sz }) });
      onTransformEndRef.current(id, {
        x: sx, y: sy, z: sz,
        rotX: rx, rotY: ry, rotZ: rz,
        scaleX: scl.x, scaleY: scl.y, scaleZ: scl.z,
      });
    };

    tc.addEventListener("mouseUp", handleMouseUp);
    return () => {
      tc.removeEventListener("mouseUp", handleMouseUp);
    };
  }, [transformCtRef]);

  // ---- FitView ----
  useEffect(() => {
    if (!fitViewRef) return;
    fitViewRef.current = () => {
      const camera = cameraRef.current;
      const controls = controlsRef.current;
      const map = meshMapRef.current;
      if (!camera || !controls) return;
      if (map.size === 0) {
        fitTargetRef.current = {
          camPos: new THREE.Vector3(150, -200, 120),
          target: new THREE.Vector3(0, 0, 0),
        };
        return;
      }
      const box = new THREE.Box3();
      for (const entry of map.values()) {
        const m = entry.mesh;
        // FIT-STALE-MATRIX: matrixWorld нового / сдвинутого объекта обновляется только при отрисовке —
        // F в том же кадре, что и добавление фигуры, вписывал её прежнее место (новая — в начале координат)
        m.updateWorldMatrix(true, false);
        // FIX (LOW-18-24): Use existing boundingBox if available instead of recomputing
        const mb = m.geometry.boundingBox ?? m.geometry.computeBoundingBox();
        if (m.geometry.boundingBox) box.union(m.geometry.boundingBox.clone().applyMatrix4(m.matrixWorld));
      }
      const center = new THREE.Vector3();
      const size = new THREE.Vector3();
      box.getCenter(center);
      box.getSize(size);
      // UX-AUDIT-39: расстояние — с учётом соотношения сторон вьюпорта (узкий — сцена не обрезается)
      const dist = fitDistance(size, camera.fov, camera.aspect);
      fitTargetRef.current = {
        camPos: new THREE.Vector3(
          center.x + dist * FIT_DIR.x,
          center.y + dist * FIT_DIR.y,
          center.z + dist * FIT_DIR.z,
        ),
        target: center.clone(),
      };
    };
  }, [fitViewRef, cameraRef, controlsRef, meshMapRef, fitTargetRef]);

  // ---- ResetView ----
  useEffect(() => {
    if (!resetViewRef) return;
    resetViewRef.current = () => {
      fitTargetRef.current = {
        camPos: new THREE.Vector3(150, -200, 120),
        target: new THREE.Vector3(0, 0, 0),
      };
    };
  }, [resetViewRef, fitTargetRef]);

  // ---- SELECTION-RECT: рамка выделения (как AutoCAD) ----
  // ЛКМ-протяжка в обычном режиме: слева направо — окно (только целиком внутри, синяя сплошная),
  // справа налево — секущая (всё, что задевает, зелёная пунктирная). Shift — добавить к выделению.
  // Не рисуется при перетаскивании гизмо и в режимах (выравнивание, размещение, размер, линейка).
  const selRectRef = useRef<HTMLDivElement | null>(null);
  const boxGestureRef = useRef(false);
  const drawSelRect = useCallback((x0: number, y0: number, x1: number, y1: number) => {
    const el = selRectRef.current;
    const container = containerRef.current;
    if (!el || !container) return;
    const r = container.getBoundingClientRect();
    const mode: RectMode = rectModeOf(x0, x1);
    el.hidden = false;
    el.className = `sel-rect ${mode}`;
    el.dataset.mode = mode;
    el.style.left = `${Math.min(x0, x1) - r.left}px`;
    el.style.top = `${Math.min(y0, y1) - r.top}px`;
    el.style.width = `${Math.abs(x1 - x0)}px`;
    el.style.height = `${Math.abs(y1 - y0)}px`;
  }, [containerRef]);
  const hideSelRect = useCallback(() => {
    if (selRectRef.current) selRectRef.current.hidden = true;
  }, []);
  const performDragSelect = useCallback(
    (x0: number, y0: number, x1: number, y1: number, add: boolean) => {
      const camera = activeCameraRef.current ?? cameraRef.current;
      const container = containerRef.current;
      if (!camera || !container) return;
      const r = container.getBoundingClientRect();
      const mode = rectModeOf(x0, x1);
      const rect = rectToNdc(x0 - r.left, y0 - r.top, x1 - r.left, y1 - r.top, r.width, r.height);
      const found = objectsInRect(meshMapRef.current, camera, rect, mode);
      devLogEvent('select', 'rect', { mode, found: found.length });
      if (found.length === 0) return;
      const ids = add ? [...new Set([...selectedIdsRef.current, ...found])] : found;
      if (onMultiSelect) onMultiSelect(ids);
      else onSelect(ids[0], false);
    },
    [onSelect, onMultiSelect, activeCameraRef, cameraRef, containerRef, meshMapRef],
  );

  // ---- Pointer handlers ----
  const pointerDownPos = useRef<{ x: number; y: number } | null>(null);
  const isDraggingRef = useRef(false);
  // VIEWPORT-NAV: двойной клик СКМ — «Вписать в экран» (как F)
  const middleDoubleClickRef = useRef(createMiddleDoubleClick());

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      // VIEWPORT-NAV: двойной клик СКМ — «Вписать в экран» (как F), в любом режиме
      if (e.button === 1) {
        e.preventDefault();                                   // без автопрокрутки браузера
        if (middleDoubleClickRef.current(e.clientX, e.clientY, e.timeStamp)) {
          devLogEvent('view', 'fit', { by: 'middle-double-click' });
          fitViewRef?.current?.();
        }
      }
      // Ruler mode: handled by useRulerMode
      if (rulerMode) {
        // VIEWPORT-NAV: точка линейки — ЛКМ (ПКМ / СКМ — вращение и сдвиг вида)
        // ORTHO-RAYCAST: камера вида (в ортографии — ортографическая), а не всегда перспективная
        if (e.button === 0) handleRulerPointerDown(e, activeCameraRef.current ?? cameraRef.current, containerRef.current);
        e.stopPropagation();
        return;
      }
      // SELECTION-RECT: рамка — ЛКМ в обычном режиме, не по ручке гизмо
      const tc = transformCtRef.current as unknown as { dragging?: boolean; axis?: string | null } | null;
      boxGestureRef.current = e.button === 0 && !isPlacing() && !isDimensioning() && !alignActiveRef.current
        && !(tc && (tc.dragging || tc.axis));
      // отпускание за пределами вьюпорта тоже приходит сюда: OrbitControls захватывает указатель на
      // канвасе (любой кнопкой), событие всплывает в контейнер. Свой захват НЕ брать — отнимет у
      // OrbitControls pointerup, и он «залипнет» (следующая ПКМ-протяжка не вращает)
      devLogPointer('down', { screenX: e.clientX, screenY: e.clientY });
      devLogEvent('pointer', 'down', { screen: fmtPoint2({ x: e.clientX, y: e.clientY }) });
      pointerDownPos.current = { x: e.clientX, y: e.clientY };
      isDraggingRef.current = false;
    },
    [rulerMode, handleRulerPointerDown, activeCameraRef, cameraRef, containerRef, fitViewRef],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      // Ruler mode: handled by useRulerMode
      if (rulerMode) {
        handleRulerPointerMove(e, activeCameraRef.current ?? cameraRef.current, containerRef.current);
        return;
      }

      // PLUG-AND-PLAY: превью под курсором (без нажатых кнопок — при перетаскивании вращается камера)
      if (isPlacing() && e.buttons === 0) schedulePlacementAim(e.clientX, e.clientY);
      // DIMENSIONS: точка с привязкой под курсором (маркер, превью A → курсор)
      if (isDimensioning() && e.buttons === 0) scheduleDimHover(e.clientX, e.clientY);

      // ALIGN-UI-REVIT: подсветка грани при наведении (без нажатых кнопок, throttle)
      if (alignActiveRef.current && e.buttons === 0) {
        const now = performance.now();
        if (now - alignHoverAtRef.current >= ALIGN_HOVER_THROTTLE_MS) {
          alignHoverAtRef.current = now;
          const pick = pickAt(e.clientX, e.clientY);
          useAlignModeStore.getState().setHoveredFace(pick ? { objectId: pick.objectId, triangleIndex: pick.triangleIndex, normal: pick.normal } : null);
        }
      }

      if (!pointerDownPos.current) return;
      const dx = e.clientX - pointerDownPos.current.x;
      const dy = e.clientY - pointerDownPos.current.y;
      if (Math.hypot(dx, dy) > DRAG_THRESHOLD_PX) isDraggingRef.current = true;
      if (isDraggingRef.current && boxGestureRef.current) {
        const tc = transformCtRef.current as unknown as { dragging?: boolean } | null;
        if (tc?.dragging) { boxGestureRef.current = false; hideSelRect(); }
        else drawSelRect(pointerDownPos.current.x, pointerDownPos.current.y, e.clientX, e.clientY);
      }
    },
    [rulerMode, handleRulerPointerMove, activeCameraRef, cameraRef, containerRef, pickAt, schedulePlacementAim, scheduleDimHover, drawSelRect, hideSelRect, transformCtRef],
  );

  // PLUG-AND-PLAY: курсор ушёл из вьюпорта — превью скрыто (Enter — рядом с прошлыми)
  const handlePointerLeave = useCallback(() => {
    if (isDimensioning()) {
      clearDimHoverTimer();
      dimHoverPosRef.current = null;
      useDimensionModeStore.getState().setHover(null);
    }
    if (!isPlacing()) return;
    clearPlacementAimTimer();
    placementAimPosRef.current = null;
    usePlacementModeStore.getState().aim(null);
  }, [clearPlacementAimTimer, clearDimHoverTimer]);

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      // Ruler mode: measurement already handled in pointerDown
      if (rulerMode) {
        e.stopPropagation();
        return;
      }

      devLogPointer('up', { screenX: e.clientX, screenY: e.clientY });
      devLogEvent('pointer', 'up', { screen: fmtPoint2({ x: e.clientX, y: e.clientY }) });

      const start = pointerDownPos.current;
      pointerDownPos.current = null;
      const boxGesture = boxGestureRef.current;
      boxGestureRef.current = false;
      hideSelRect();

      if (!start) return;

      // PLUG-AND-PLAY: в режиме размещения клик — поставить фигуру (место — в точке клика),
      // правый клик — отмена; перетаскивание — вращение/панорама камеры. Выделение не меняется.
      if (isPlacing()) {
        const wasDrag = isDraggingRef.current;
        isDraggingRef.current = false;
        if (wasDrag) return;
        const store = usePlacementModeStore.getState();
        if (e.button === 2) {
          store.cancelPlacement();
          return;
        }
        if (e.button !== 0) return;
        clearPlacementAimTimer();
        const aim = aimAt(e.clientX, e.clientY);
        devLogEvent('placement', 'click', { face: aim?.face ? `${aim.face.objectId}#${aim.face.triangleIndex}` : 'none' });
        if (aim) void store.confirmPlacement(aim);
        return;
      }

      // DIMENSIONS: в режиме «Размер» клик — точка (A, затем B → размер), правый клик — выход;
      // перетаскивание — камера. Выделение не меняется.
      if (isDimensioning()) {
        const wasDrag = isDraggingRef.current;
        isDraggingRef.current = false;
        if (wasDrag) return;
        const mode = useDimensionModeStore.getState();
        if (e.button === 2) {
          mode.exitDimensionMode();
          return;
        }
        if (e.button !== 0) return;
        clearDimHoverTimer();
        const pick = snapAt(e.clientX, e.clientY);
        devLogEvent('dimension', 'click', { pick: pick ? `${pick.objectId}:${pick.snap}` : 'none' });
        if (pick) mode.clickPoint({ objectId: pick.objectId, point: pick.point });
        return;
      }

      // ALIGN-UI-REVIT: в режиме клик — выбор грани (A, затем B), правый клик — выход;
      // перетаскивание остаётся вращением/панорамой камеры. Выделение не меняется.
      if (alignActiveRef.current) {
        const wasDrag = isDraggingRef.current;
        isDraggingRef.current = false;
        if (wasDrag) return;
        const store = useAlignModeStore.getState();
        if (e.button === 2) {
          store.exitAlignMode();
          return;
        }
        if (e.button !== 0) return;
        const pick = pickAt(e.clientX, e.clientY);
        devLogEvent('align', 'click', { pick: pick ? `${pick.objectId}#${pick.triangleIndex}` : 'none' });
        if (pick) void store.clickFace(pick);
        return;
      }

      // VIEWPORT-NAV: выбор и рамка — только ЛКМ (ПКМ — вращение вида, СКМ — сдвиг)
      if (e.button !== 0) {
        isDraggingRef.current = false;
        return;
      }

      // If it was a click (not drag) — select object via Raycaster
      if (!isDraggingRef.current) {
        const camera = activeCameraRef.current ?? cameraRef.current;
        const container = containerRef.current;
        if (camera && container) {
          const rect = container.getBoundingClientRect();
          const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
          const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
          devLogPointer('raycast', { ndcX: x, ndcY: y });
          devLogEvent('raycast', 'start', { ndc: fmtPoint2({ x, y }) });
          const raycaster = new THREE.Raycaster();
          raycaster.setFromCamera(new THREE.Vector2(x, y), camera);
          // DIMENSIONS: размер рисуется поверх объектов — клик по нему выделяет размер
          const dims = useDimensionsStore.getState();
          const dimId = dimRootRef.current ? pickDimension(raycaster, dimRootRef.current) : null;
          if (dimId) {
            devLogEvent('select', 'dimension', { id: dimId });
            dims.selectDimension(dimId);
            onSelect(null, false);
            return;
          }
          if (dims.selectedDimensionId) dims.selectDimension(null);
          const meshes: THREE.Mesh[] = [];
          for (const entry of meshMapRef.current.values()) {
            if (entry.mesh.visible) meshes.push(entry.mesh);
          }
          const hits = raycaster.intersectObjects(meshes, false);
          devLogEvent('raycast', 'hits', { count: hits.length, meshes: meshes.length });
          if (hits.length > 0) {
            const id = hits[0].object.userData.objectId as string;
            const point = hits[0].point;
            devLogEvent('select', 'object', { id, shiftKey: e.shiftKey, point: fmtPoint(point) });
            onSelect(id, e.shiftKey);
          } else {
            devLogEvent('select', 'deselect', {});
            onSelect(null, false);
          }
        }
        return;
      }

      // SELECTION-RECT: протяжка ЛКМ — рамка (окно / секущая по направлению)
      if (isDraggingRef.current) {
        isDraggingRef.current = false;
        if (!boxGesture) return;                              // гизмо, режимы
        devLogEvent('select', 'drag', { start: fmtPoint2(start), end: fmtPoint2({ x: e.clientX, y: e.clientY }) });
        performDragSelect(start.x, start.y, e.clientX, e.clientY, e.shiftKey);
      }
    },
    [
      rulerMode,
      onSelect,
      activeCameraRef,
      cameraRef,
      containerRef,
      meshMapRef,
      performDragSelect,
      hideSelRect,
      pickAt,
      aimAt,
      clearPlacementAimTimer,
      snapAt,
      clearDimHoverTimer,
      dimRootRef,
    ],
  );

  return (
    <div
      ref={containerRef as React.RefObject<HTMLDivElement>}
      className="viewport viewport-canvas"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerLeave}
      onContextMenu={(e) => { if (alignActiveRef.current || isPlacing() || isDimensioning()) e.preventDefault(); }}
      style={alignActive || placementActive || dimMode ? { cursor: "crosshair" } : undefined}
      data-camera={cameraMode}
      data-dimension-mode={dimMode ? (dimMode.first ? "b" : "a") : undefined}
      data-dimension-hover={dimMode?.hover ? `${dimMode.hover.objectId}|${dimMode.hover.snap ?? ""}|${[dimMode.hover.point.x, dimMode.hover.point.y, dimMode.hover.point.z].map((v) => v.toFixed(4)).join(",")}` : undefined}
      data-dimensions-visible={showDimensions ? "1" : "0"}
      data-dimension-count={visibleDimensions}
      data-placement={placement?.shapeType}
      data-placement-plane={placement?.preview ? (placement.preview.plane.kind === "axis" ? placement.preview.plane.axis : placement.preview.plane.kind) : undefined}
      data-placement-face={placement?.preview?.plane.kind === "face" ? placement.preview.plane.objectId : undefined}
      data-placement-normal={placement?.preview ? [placement.preview.plane.normal.x, placement.preview.plane.normal.y, placement.preview.plane.normal.z].map((v) => (Math.round(v * 100) / 100 + 0).toFixed(2)).join(",") : undefined}
      data-placement-pos={placement?.preview ? [placement.preview.transform.x, placement.preview.transform.y, placement.preview.transform.z].map((v) => (Math.round(v * 100) / 100 + 0).toString()).join(",") : undefined}
      data-align-mode={alignActive ? (alignPlane ? "face-b" : "plane") : undefined}
      data-align-hover={hovered ? `${hovered.objectId}:${hovered.triangleIndex}` : undefined}
      data-align-hover-normal={hovered?.normal ? [hovered.normal.x, hovered.normal.y, hovered.normal.z].map((v) => v.toFixed(2)).join(",") : undefined}
    >
      {!workerOk && (
        <div className="viewport-loading">
          <div className="spinner" />
          <span className="viewport-origin-label">
            {t("viewportStatus.loadingCsg")}
          </span>
        </div>
      )}
      <div ref={selRectRef} className="sel-rect" data-testid="selection-rect" hidden />
      <ViewCube mainCamera={cubeCamera} mainControls={cubeCtrl} />
    </div>
  );
}
