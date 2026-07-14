import {
  useLayoutEffect,
  useEffect,
  useRef,
  useCallback,
  useState,
} from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";
import type { SceneObject, TransformNR } from "../csg/types";
import WebGLFallback from "./WebGLFallback";
import ViewCube from "./ViewCube";

export type GizmoMode = "translate" | "rotate" | "scale" | null;

interface FitTarget {
  camPos: THREE.Vector3;
  target: THREE.Vector3;
}
interface DragRect {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

interface Props {
  busy: boolean;
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
}

function checkWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return !!(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

// Центрирует геометрию меша и возвращает контейнер (pivot), в котором находится сам меш.
// Worker применяет полный TRS к геометрии (translation + rotation + scale запекаются в Manifold).
// Pivot.position устанавливается в (0,0,0) — sync-effect позже установит
// правильную позицию из store (obj.transform).
function centerGeometry(mesh: THREE.Mesh, objectId: string): THREE.Object3D {
  mesh.geometry.computeBoundingBox();
  const box = mesh.geometry.boundingBox!;
  const center = new THREE.Vector3();
  box.getCenter(center);

  // Смещаем геометрию так, чтобы её центр оказался в (0,0,0)
  mesh.geometry.translate(-center.x, -center.y, -center.z);

  // Создаём контейнер‑объект, в котором будет находиться сам меш
  const container = new THREE.Object3D();
  // Pivot остаётся в (0,0,0) — sync-effect установит позицию из store
  container.userData.objectId = objectId; // важно для TransformControls
  container.add(mesh);
  return container;
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
  busy,
  workerOk,
  cameraMode = 'perspective',
}: Props) {
  const [webglOk] = useState<boolean>(() => checkWebGL());
  const [sceneReady, setSceneReady] = useState(false);
  const [cubeCamera, setCubeCamera] = useState<THREE.PerspectiveCamera | null>(
    null,
  );
  const [cubeCtrl, setCubeCtrl] = useState<OrbitControls | null>(null);
  const [dragRect, setDragRect] = useState<DragRect | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const initRanRef = useRef(false); // <-- added to track initialization
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const orthoCameraRef = useRef<THREE.OrthographicCamera | null>(null);
  const cameraModeRef = useRef<'perspective' | 'orthographic'>(cameraMode);
  const activeCameraRef = useRef<THREE.Camera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const transformCtRef = useRef<TransformControls | null>(null);
  const meshMapRef = useRef<
    Map<
      string,
      { mesh: THREE.Mesh; pivot: THREE.Object3D; helper?: THREE.BoxHelper }
    >
  >(new Map());
  const rulerLineRef = useRef<THREE.Line | null>(null);
  const rulerMarkersRef = useRef<THREE.Mesh[]>([]);
  const rulerPointsRef = useRef<THREE.Vector3[]>([]);
  const rafRef = useRef<number | null>(null);
  const fpsRef = useRef({ last: performance.now(), frames: 0 });
  const currentMeshRef = useRef<THREE.Object3D | null>(null);

  const fitTargetRef = useRef<FitTarget | null>(null);
  // Keep cameraModeRef in sync with prop
  useEffect(() => {
    cameraModeRef.current = cameraMode;
  }, [cameraMode]);

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

  const pointerDownPos = useRef<{ x: number; y: number } | null>(null);
  const isDraggingRef = useRef(false);

  // ---- Init Three.js ----
  useLayoutEffect(() => {
    if (!webglOk) return;
    // Prevent double-init in StrictMode
    if (initRanRef.current) return;
    const container = containerRef.current;
    if (!container) return;

    const w = container.clientWidth;
    const h = container.clientHeight;
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      failIfMajorPerformanceCaveat: false,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setClearColor(0x1e1e2e);
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    // Z-up coordinate system: X=right, Y=forward/depth, Z=up (height)
    const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 10000);
    camera.up.set(0, 0, 1);
    camera.position.set(150, -200, 120);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    // Orthographic camera — frustum set dynamically each frame from persp distance
    const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10000);
    ortho.up.set(0, 0, 1);
    ortho.position.set(150, -200, 120);
    orthoCameraRef.current = ortho;
    activeCameraRef.current = camera;

    scene.add(new THREE.AmbientLight(0xffffff, 0.45));

    const sun = new THREE.DirectionalLight(0xffffff, 1.2);
    // Z-up: high Z = above, Y = depth
    sun.position.set(100, -80, 200);
    sun.castShadow = true;
    sun.shadow.mapSize.width = sun.shadow.mapSize.height = 2048;
    sun.shadow.camera.left = sun.shadow.camera.bottom = -200;
    sun.shadow.camera.right = sun.shadow.camera.top = 200;
    sun.shadow.camera.near = 0.1;
    sun.shadow.camera.far = 1000;
    scene.add(sun);

    const fill = new THREE.DirectionalLight(0x8888ff, 0.4);
    fill.position.set(-100, 80, 50);
    scene.add(fill);

    // Grid in XY plane (Z=0 is the work surface in Z-up world)
    const grid = new THREE.GridHelper(400, 40, 0x3a3a5c, 0x2a2a4a);
    grid.rotation.x = Math.PI / 2; // rotate from XZ to XY plane
    grid.position.z = -0.5;
    scene.add(grid);

    // Shadow receiver: PlaneGeometry is already in XY plane — no rotation needed in Z-up
    const groundGeo = new THREE.PlaneGeometry(400, 400);
    const groundMat = new THREE.ShadowMaterial({ opacity: 0.25 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.position.z = -0.5;
    ground.receiveShadow = true;
    scene.add(ground);

    // Axes helper on the XY work plane
    const axes = new THREE.AxesHelper(20);
    axes.position.set(-170, -170, -0.4);
    scene.add(axes);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 10;
    controls.maxDistance = 2000;
    controls.maxPolarAngle = Math.PI - 0.01; // allow full rotation including bottom view
    controlsRef.current = controls;
    setCubeCamera(camera);
    setCubeCtrl(controls);

    const tc = new TransformControls(camera, renderer.domElement);
    tc.setSize(0.8);
    tc.setSpace("local"); // Use local space so gizmo moves relative to object's own axes
    tc.addEventListener("dragging-changed", (e: { value: unknown }) => {
      controls.enabled = !e.value;
    });
    tc.addEventListener("mouseUp", () => {
      const obj = (tc as unknown as { object: THREE.Object3D | undefined })
        .object;
      if (!obj) return;
      const id = obj.userData.objectId as string;
      // obj is the pivot (container), so position/rotation/scale are in world space
      const pos = obj.position;
      const rot = obj.rotation;
      const scl = obj.scale;
      const snap = snapValueRef.current;
      // Snap position
      const sx = snap > 0 ? Math.round(pos.x / snap) * snap : pos.x;
      const sy = snap > 0 ? Math.round(pos.y / snap) * snap : pos.y;
      const sz = snap > 0 ? Math.round(pos.z / snap) * snap : pos.z;
      // Apply snap directly to pivot so there's no visual jump
      if (snap > 0) obj.position.set(sx, sy, sz);
      // Convert Three.js radians → degrees for the store
      const rx = THREE.MathUtils.radToDeg(rot.x);
      const ry = THREE.MathUtils.radToDeg(rot.y);
      const rz = THREE.MathUtils.radToDeg(rot.z);
      onTransformEnd(id, {
        x: sx,
        y: sy,
        z: sz,
        rotX: rx,
        rotY: ry,
        rotZ: rz,
        scaleX: scl.x,
        scaleY: scl.y,
        scaleZ: scl.z,
      });
    });
    scene.add((tc as unknown as { getHelper(): THREE.Object3D }).getHelper());
    transformCtRef.current = tc;

    const ro = new ResizeObserver(() => {
      const cw = container.clientWidth;
      const ch = container.clientHeight;
      renderer.setSize(cw, ch);
      camera.aspect = cw / ch;
      camera.updateProjectionMatrix();
      // ortho frustum is recomputed each frame, no action needed here
    });
    ro.observe(container);

    const animate = () => {
      rafRef.current = requestAnimationFrame(animate);
      const ft = fitTargetRef.current;
      if (ft) {
        camera.position.lerp(ft.camPos, 0.12);
        controls.target.lerp(ft.target, 0.12);
        controls.update();
        if (
          camera.position.distanceTo(ft.camPos) < 0.5 &&
          controls.target.distanceTo(ft.target) < 0.5
        ) {
          camera.position.copy(ft.camPos);
          controls.target.copy(ft.target);
          fitTargetRef.current = null;
        }
      } else {
        controls.update();
      }

      // Pick active camera and sync ortho from persp each frame
      let activeCam: THREE.Camera = camera;
      if (cameraModeRef.current === 'orthographic' && orthoCameraRef.current) {
        const orthoC = orthoCameraRef.current;
        orthoC.position.copy(camera.position);
        orthoC.quaternion.copy(camera.quaternion);
        const dist = camera.position.distanceTo(controls.target);
        const halfH = dist * Math.tan(THREE.MathUtils.degToRad(22.5)); // FOV 45
        const aspect = renderer.domElement.width / Math.max(1, renderer.domElement.height);
        orthoC.left   = -halfH * aspect;
        orthoC.right  =  halfH * aspect;
        orthoC.top    =  halfH;
        orthoC.bottom = -halfH;
        orthoC.updateProjectionMatrix();
        activeCam = orthoC;
      }
      activeCameraRef.current = activeCam;
      renderer.render(scene, activeCam);
      const now = performance.now();
      fpsRef.current.frames++;
      if (now - fpsRef.current.last >= 500) {
        onFpsUpdate(
          Math.round(
            (fpsRef.current.frames * 1000) / (now - fpsRef.current.last),
          ),
        );
        fpsRef.current = { last: now, frames: 0 };
      }

      // ---- Подсветка выбранных объектов (emissive) ----
      const sel = selectedIdsRef.current;
      for (const [id, entry] of meshMapRef.current) {
        const mat = entry.mesh.material as THREE.MeshStandardMaterial;
        if (sel.has(id)) {
          mat.emissive.setHex(0x444466);
          mat.emissiveIntensity = 0.5;
        } else {
          mat.emissive.setHex(0x000000);
          mat.emissiveIntensity = 0;
        }
      }
    };
    animate();

    initRanRef.current = true;
    setSceneReady(true);

    return () => {
      initRanRef.current = false;
      setSceneReady(false);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      ro.disconnect();
      renderer.dispose();
      if (container.contains(renderer.domElement))
        container.removeChild(renderer.domElement);
    };
  }, [webglOk]);

  // ---- Гизмо режим ----
  useEffect(() => {
    type TC = {
      detach(): void;
      attach(o: THREE.Object3D): void;
      setMode(m: string): void;
    };
    const tc = transformCtRef.current as unknown as TC | null;
    if (!tc) return;
    if (gizmoMode === null || selectedIds.size === 0) {
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
  }, [gizmoMode, selectedIds]);

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
        m.geometry.computeBoundingBox();
        const mb = m.geometry.boundingBox;
        if (mb) box.union(mb.clone().applyMatrix4(m.matrixWorld));
      }
      const center = new THREE.Vector3();
      const size = new THREE.Vector3();
      box.getCenter(center);
      box.getSize(size);
      const dist = Math.max(size.x, size.y, size.z, 1) * 2.5;
      // Z-up: camera comes from front (-Y) and above (+Z)
      fitTargetRef.current = {
        camPos: new THREE.Vector3(
          center.x + dist * 0.5,
          center.y - dist * 0.9,
          center.z + dist * 0.6,
        ),
        target: center.clone(),
      };
    };
  }, [fitViewRef]);

  // ---- ResetView ----
  useEffect(() => {
    if (!resetViewRef) return;
    resetViewRef.current = () => {
      fitTargetRef.current = {
        camPos: new THREE.Vector3(150, -200, 120),
        target: new THREE.Vector3(0, 0, 0),
      };
    };
  }, [resetViewRef]);

  // ---- Ruler helpers ----
  const clearRulerVisuals = useCallback(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    if (rulerLineRef.current) {
      scene.remove(rulerLineRef.current);
      rulerLineRef.current.geometry.dispose();
      rulerLineRef.current = null;
    }
    for (const m of rulerMarkersRef.current) {
      scene.remove(m);
      m.geometry.dispose();
    }
    rulerMarkersRef.current = [];
  }, []);

  const updateRulerVisuals = useCallback(
    (pts: THREE.Vector3[]) => {
      const scene = sceneRef.current;
      if (!scene) return;
      clearRulerVisuals();
      rulerPointsRef.current = pts.map((p) => p.clone());
      const mat = new THREE.LineBasicMaterial({
        color: "#facc15",
        linewidth: 2,
      });
      const geo = new THREE.BufferGeometry();
      const pos: number[] = pts.flatMap((p) => [p.x, p.y, p.z]);
      if (pts.length === 1) pos.push(pts[0].x, pts[0].y, pts[0].z); // degenerate line
      geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      const line = new THREE.Line(geo, mat);
      scene.add(line);
      rulerLineRef.current = line;

      for (const p of pts) {
        const m = new THREE.Mesh(
          new THREE.SphereGeometry(0.5, 8, 8),
          new THREE.MeshBasicMaterial({ color: "#facc15" }),
        );
        m.position.copy(p);
        scene.add(m);
        rulerMarkersRef.current.push(m);
      }
    },
    [clearRulerVisuals],
  );

  // ---- Ruler mode toggle ----
  useEffect(() => {
    if (!rulerMode) {
      rulerPointsRef.current = [];
      clearRulerVisuals();
    }
  }, [rulerMode, clearRulerVisuals]);

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
        m.geometry.computeBoundingSphere();
        const sphere = m.geometry.boundingSphere;
        if (!sphere) continue;
        const center = sphere.center.clone().applyMatrix4(m.matrixWorld);
        const ndc = center.project(camera);
        if (ndc.x >= minX && ndc.x <= maxX && ndc.y >= minY && ndc.y <= maxY)
          selected.push(id);
      }
      if (selected.length > 0) {
        if (onMultiSelect) onMultiSelect(selected);
        else onSelect(selected[0], false);
      }
    },
    [onSelect, onMultiSelect],
  );

  const getWorldPointFromPointer = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const scene = sceneRef.current;
      const camera = cameraRef.current;
      const container = containerRef.current;
      if (!scene || !camera || !container) return null;

      const rect = container.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
      const ndc = new THREE.Vector3(x, y, 0);
      ndc.unproject(camera);

      const dir = ndc.sub(camera.position).normalize();
      const groundY = 0;
      const distance = (groundY - camera.position.y) / dir.y;
      if (!Number.isFinite(distance) || distance < 0) return null;

      return camera.position.clone().add(dir.multiplyScalar(distance));
    },
    [],
  );

  // ---- Click / Drag ----
  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      pointerDownPos.current = { x: e.clientX, y: e.clientY };
      isDraggingRef.current = false;

      if (rulerMode) {
        const point = getWorldPointFromPointer(e);
        if (!point) return;

        const points = rulerPointsRef.current;
        if (points.length === 0 || points.length >= 2) {
          rulerPointsRef.current = [point];
        } else {
          rulerPointsRef.current = [points[0], point];
        }
        updateRulerVisuals(rulerPointsRef.current);
        if (points.length === 1 && onRulerMeasure) {
          onRulerMeasure(points[0].distanceTo(point));
        }
      }
    },
    [getWorldPointFromPointer, onRulerMeasure, rulerMode, updateRulerVisuals],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!pointerDownPos.current) return;
      const dx = e.clientX - pointerDownPos.current.x;
      const dy = e.clientY - pointerDownPos.current.y;
      if (Math.hypot(dx, dy) > 4) isDraggingRef.current = true;
    },
    [],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const start = pointerDownPos.current;
      pointerDownPos.current = null;

      if (!start) return;

      // Если это был клик (не drag) — выбираем объект через Raycaster
      if (!isDraggingRef.current) {
        if (rulerMode) {
          const point = getWorldPointFromPointer(e);
          if (point && rulerPointsRef.current.length === 1) {
            rulerPointsRef.current = [rulerPointsRef.current[0], point];
            updateRulerVisuals(rulerPointsRef.current);
            onRulerMeasure?.(rulerPointsRef.current[0].distanceTo(point));
          }
        } else {
          // Raycaster для выбора объекта
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
        }
        return;
      }

      // Если это был drag (выделение рамкой)
      if (rulerMode) {
        const point = getWorldPointFromPointer(e);
        if (point && rulerPointsRef.current.length === 1) {
          rulerPointsRef.current = [rulerPointsRef.current[0], point];
          updateRulerVisuals(rulerPointsRef.current);
          onRulerMeasure?.(rulerPointsRef.current[0].distanceTo(point));
        }
      }
    },
    [
      getWorldPointFromPointer,
      onRulerMeasure,
      onSelect,
      rulerMode,
      updateRulerVisuals,
    ],
  );

  // ---- Sync objects → Three.js meshes ----
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    const currentIds = new Set(objects.map((o) => o.id));
    const map = meshMapRef.current;

    // Remove meshes that no longer exist
    for (const [id, entry] of map) {
      if (!currentIds.has(id)) {
        scene.remove(entry.pivot);
        entry.mesh.geometry.dispose();
        (entry.mesh.material as THREE.Material).dispose();
        map.delete(id);
      }
    }

    // Add or update meshes
    for (const obj of objects) {
      const existing = map.get(obj.id);
      if (existing) {
        // Update geometry if raw vertices from store changed.
        // We cache the RAW (pre-centering) vertices so the comparison is
        // always against the same source as obj.vertices — not the
        // post-centering buffer, which always equals the cache.
        const cachedRaw = existing.mesh.userData.cachedRawVertices as Float32Array | undefined;
        const vertsChanged =
          !cachedRaw ||
          cachedRaw.length !== obj.vertices.length ||
          obj.indices.length !== (existing.mesh.geometry.index?.count ?? 0) ||
          cachedRaw.some((v, i) => v !== obj.vertices[i]);
        if (vertsChanged) {
          existing.mesh.userData.cachedRawVertices = new Float32Array(obj.vertices);

          existing.mesh.geometry.setAttribute(
            "position",
            new THREE.Float32BufferAttribute(obj.vertices, 3),
          );
          existing.mesh.geometry.setIndex(
            new THREE.BufferAttribute(obj.indices, 1),
          );
          existing.mesh.geometry.computeVertexNormals();
          existing.mesh.geometry.computeBoundingBox();
          existing.mesh.geometry.computeBoundingSphere();

          // Re-center geometry so pivot applies world transform correctly
          const box = existing.mesh.geometry.boundingBox!;
          const center = new THREE.Vector3();
          box.getCenter(center);
          existing.mesh.geometry.translate(-center.x, -center.y, -center.z);
          existing.mesh.geometry.computeBoundingBox();
          existing.mesh.geometry.computeBoundingSphere();
        }

        // Sync transform from store to pivot
        // Worker bakes full TRS into Manifold geometry, but Three.js pivot
        // still carries the visual transform for gizmo interaction.
        const t = obj.transform;
        const pivotPos = existing.pivot.position;
        const eps = 0.01;
        if (
          Math.abs(pivotPos.x - t.x) > eps ||
          Math.abs(pivotPos.y - t.y) > eps ||
          Math.abs(pivotPos.z - t.z) > eps
        ) {
          existing.pivot.position.set(t.x, t.y, t.z);
        }
        const pivotRot = existing.pivot.rotation;
        if (
          Math.abs(THREE.MathUtils.radToDeg(pivotRot.x) - t.rotX) > eps ||
          Math.abs(THREE.MathUtils.radToDeg(pivotRot.y) - t.rotY) > eps ||
          Math.abs(THREE.MathUtils.radToDeg(pivotRot.z) - t.rotZ) > eps
        ) {
          existing.pivot.rotation.set(
            THREE.MathUtils.degToRad(t.rotX),
            THREE.MathUtils.degToRad(t.rotY),
            THREE.MathUtils.degToRad(t.rotZ),
          );
        }
        const pivotScl = existing.pivot.scale;
        if (
          Math.abs(pivotScl.x - t.scaleX) > 0.001 ||
          Math.abs(pivotScl.y - t.scaleY) > 0.001 ||
          Math.abs(pivotScl.z - t.scaleZ) > 0.001
        ) {
          existing.pivot.scale.set(t.scaleX, t.scaleY, t.scaleZ);
        }

        // Update visibility
        existing.mesh.visible = obj.visible !== false;
        // Update color
        const mat = existing.mesh.material as THREE.MeshStandardMaterial;
        if (mat.color.getHexString() !== obj.color.replace("#", "")) {
          mat.color.set(obj.color);
        }
      } else {
        // Create new mesh
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute(
          "position",
          new THREE.Float32BufferAttribute(obj.vertices, 3),
        );
        geometry.setIndex(new THREE.BufferAttribute(obj.indices, 1));
        geometry.computeVertexNormals();

        const material = new THREE.MeshStandardMaterial({
          color: obj.color,
          roughness: 0.35,
          metalness: 0.1,
          side: THREE.DoubleSide,
        });
        const rawMesh = new THREE.Mesh(geometry, material);
        rawMesh.castShadow = true;
        rawMesh.receiveShadow = true;
        rawMesh.userData.objectId = obj.id;
        // Центрируем геометрию и получаем pivot‑объект
        // Worker запекает полный TRS в геометрию Manifold.
        // Pivot.position = (0,0,0) после centerGeometry — применяем transform из store.
        const pivot = centerGeometry(rawMesh, obj.id);
        pivot.position.set(obj.transform.x, obj.transform.y, obj.transform.z);
        pivot.rotation.set(
          THREE.MathUtils.degToRad(obj.transform.rotX),
          THREE.MathUtils.degToRad(obj.transform.rotY),
          THREE.MathUtils.degToRad(obj.transform.rotZ),
        );
        pivot.scale.set(obj.transform.scaleX, obj.transform.scaleY, obj.transform.scaleZ);
        scene.add(pivot);
        map.set(obj.id, { mesh: rawMesh, pivot });
      }
    }
  }, [objects, sceneReady]);

  return (
    <div
      ref={containerRef}
      className="viewport"
      style={{ width: "100%", height: "100%" }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {busy && (
        <div className="viewport-busy">
          <div
            className="spinner"
            style={{ width: 14, height: 14, borderWidth: 2 }}
          />
          Вычисление…
        </div>
      )}
      {!workerOk && (
        <div className="viewport-loading">
          <div className="spinner" />
          <span style={{ color: "var(--text-muted)", fontSize: 13 }}>
            Загрузка CSG (WASM)…
          </span>
        </div>
      )}
      <ViewCube mainCamera={cubeCamera} mainControls={cubeCtrl} />
    </div>
  );
}
