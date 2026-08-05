import {
  useEffect,
  useRef,
  useCallback,
  useState,
} from "react";
import * as THREE from "three";
import type { SceneObject, TransformNR } from "../csg/types";
import ViewCube from "./ViewCube";
import {
  useThreeInit,
  useMeshSync,
  useRulerMode,
  useMirrorPreview,
  type GizmoMode,
} from "./viewport-hooks";

export type { GizmoMode } from "./viewport-hooks";

// Interaction thresholds
const DRAG_THRESHOLD_PX = 4;

interface DragRect {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
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
}: Props) {
  const [webglOk] = useState<boolean>(() => checkWebGL());

  // ---- Хук 1: Инициализация Three.js ----
  const {
    sceneReady,
    containerRef,
    sceneRef,
    cameraRef,
    activeCameraRef,
    controlsRef,
    transformCtRef,
    meshMapRef,
    fitTargetRef,
    cubeCamera,
    cubeCtrl,
  } = useThreeInit(webglOk, cameraMode, onFpsUpdate);

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
    if (gizmoMode === "none" || selectedIds.size === 0) {
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
  }, [gizmoMode, selectedIds, transformCtRef, meshMapRef]);

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
        // FIX (LOW-18-24): Use existing boundingBox if available instead of recomputing
        const mb = m.geometry.boundingBox ?? m.geometry.computeBoundingBox();
        if (m.geometry.boundingBox) box.union(m.geometry.boundingBox.clone().applyMatrix4(m.matrixWorld));
      }
      const center = new THREE.Vector3();
      const size = new THREE.Vector3();
      box.getCenter(center);
      box.getSize(size);
      const dist = Math.max(size.x, size.y, size.z, 1) * 2.5;
      fitTargetRef.current = {
        camPos: new THREE.Vector3(
          center.x + dist * 0.5,
          center.y - dist * 0.9,
          center.z + dist * 0.6,
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

  // ---- Drag-select helpers ----
  const performDragSelect = useCallback(
    (rect: DragRect) => {
      const camera = cameraRef.current;
      const container = containerRef.current;
      if (!camera || !container) return;

      const cw = container.clientWidth,
        ch = container.clientHeight;
      const minX = (Math.min(rect.startX, rect.endX) / cw) * 2 - 1;
      const maxX = (Math.max(rect.startX, rect.endX) / cw) * 2 - 1;
      const minY = -((Math.max(rect.startY, rect.endY) / ch) * 2 - 1);
      const maxY = -((Math.min(rect.startY, rect.endY) / ch) * 2 - 1);

      const selected: string[] = [];
      for (const [id, entry] of meshMapRef.current) {
        const m = entry.mesh;
        if (!m.visible) continue;
        // FIX (MED-18-28): Use existing boundingSphere if available instead of recomputing
        const sphere = m.geometry.boundingSphere ?? m.geometry.computeBoundingSphere();
        if (!m.geometry.boundingSphere) continue;
        const center = m.geometry.boundingSphere.center.clone().applyMatrix4(m.matrixWorld);
        const ndc = center.project(camera);
        if (ndc.x >= minX && ndc.x <= maxX && ndc.y >= minY && ndc.y <= maxY)
          selected.push(id);
      }
      if (selected.length > 0) {
        if (onMultiSelect) onMultiSelect(selected);
        else onSelect(selected[0], false);
      }
    },
    [onSelect, onMultiSelect, cameraRef, containerRef, meshMapRef],
  );

  // ---- Pointer handlers ----
  const pointerDownPos = useRef<{ x: number; y: number } | null>(null);
  const isDraggingRef = useRef(false);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      // Ruler mode: handled by useRulerMode
      if (rulerMode) {
        handleRulerPointerDown(e, cameraRef.current, containerRef.current);
        e.stopPropagation();
        return;
      }
      pointerDownPos.current = { x: e.clientX, y: e.clientY };
      isDraggingRef.current = false;
    },
    [rulerMode, handleRulerPointerDown, cameraRef, containerRef],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      // Ruler mode: handled by useRulerMode
      if (rulerMode) {
        handleRulerPointerMove(e, cameraRef.current, containerRef.current);
        return;
      }

      if (!pointerDownPos.current) return;
      const dx = e.clientX - pointerDownPos.current.x;
      const dy = e.clientY - pointerDownPos.current.y;
      if (Math.hypot(dx, dy) > DRAG_THRESHOLD_PX) isDraggingRef.current = true;
    },
    [rulerMode, handleRulerPointerMove, cameraRef, containerRef],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      // Ruler mode: measurement already handled in pointerDown
      if (rulerMode) {
        e.stopPropagation();
        return;
      }

      const start = pointerDownPos.current;
      pointerDownPos.current = null;

      if (!start) return;

      // If it was a click (not drag) — select object via Raycaster
      if (!isDraggingRef.current) {
        const camera = activeCameraRef.current ?? cameraRef.current;
        const container = containerRef.current;
        if (camera && container) {
          const rect = container.getBoundingClientRect();
          const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
          const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
          const raycaster = new THREE.Raycaster();
          raycaster.setFromCamera(new THREE.Vector2(x, y), camera);
          const meshes: THREE.Mesh[] = [];
          for (const entry of meshMapRef.current.values()) {
            if (entry.mesh.visible) meshes.push(entry.mesh);
          }
          const hits = raycaster.intersectObjects(meshes, false);
          if (hits.length > 0) {
            const id = hits[0].object.userData.objectId as string;
            onSelect(id, e.shiftKey);
          } else {
            onSelect(null, false);
          }
        }
        return;
      }

      // If it was a drag (box selection)
      if (isDraggingRef.current) {
        const rect: DragRect = {
          startX: start.x,
          startY: start.y,
          endX: e.clientX,
          endY: e.clientY,
        };
        performDragSelect(rect);
        isDraggingRef.current = false;
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
    ],
  );

  return (
    <div
      ref={containerRef as React.RefObject<HTMLDivElement>}
      className="viewport viewport-canvas"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {!workerOk && (
        <div className="viewport-loading">
          <div className="spinner" />
          <span className="viewport-origin-label">
            Загрузка CSG (WASM)…
          </span>
        </div>
      )}
      <ViewCube mainCamera={cubeCamera} mainControls={cubeCtrl} />
    </div>
  );
}
