import { useLayoutEffect, useEffect, useRef, useCallback, useState } from "react";
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
  busy,
  workerOk,
}: Props) {
  const [webglOk] = useState<boolean>(() => checkWebGL());
  const [sceneReady, setSceneReady] = useState(false);
  const [cubeCamera, setCubeCamera] = useState<THREE.PerspectiveCamera | null>(
    null,
  );
  const [cubeCtrl, setCubeCtrl] = useState<OrbitControls | null>(null);
  const [dragRect, setDragRect] = useState<DragRect | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const initRanRef = useRef(false);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const transformCtRef = useRef<TransformControls | null>(null);
  const meshMapRef = useRef<
    Map<string, { mesh: THREE.Mesh; helper?: THREE.BoxHelper }>
  >(new Map());
  const rulerLineRef = useRef<THREE.Line | null>(null);
  const rulerMarkersRef = useRef<THREE.Mesh[]>([]);
  const rulerPointsRef = useRef<THREE.Vector3[]>([]);
  const rafRef = useRef<number | null>(null);
  const fpsRef = useRef({ last: performance.now(), frames: 0 });

  const fitTargetRef = useRef<FitTarget | null>(null);
  const onTransformEndRef = useRef(onTransformEnd);
  useEffect(() => {
    onTransformEndRef.current = onTransformEnd;
  }, [onTransformEnd]);

  const snapValueRef = useRef(snapValue);
  useEffect(() => {
    snapValueRef.current = snapValue;
  }, [snapValue]);

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

    const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 10000);
    camera.position.set(80, 80, 120);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    scene.add(new THREE.AmbientLight(0xffffff, 0.45));

    const sun = new THREE.DirectionalLight(0xffffff, 1.2);
    sun.position.set(100, 200, 150);
    sun.castShadow = true;
    sun.shadow.mapSize.width = sun.shadow.mapSize.height = 2048;
    sun.shadow.camera.left = sun.shadow.camera.bottom = -200;
    sun.shadow.camera.right = sun.shadow.camera.top = 200;
    sun.shadow.camera.near = 0.1;
    sun.shadow.camera.far = 1000;
    scene.add(sun);

    const fill = new THREE.DirectionalLight(0x8888ff, 0.4);
    fill.position.set(-100, 50, -80);
    scene.add(fill);

    const grid = new THREE.GridHelper(400, 40, 0x3a3a5c, 0x2a2a4a);
    grid.position.y = -0.5;
    scene.add(grid);

    const groundGeo = new THREE.PlaneGeometry(400, 400);
    const groundMat = new THREE.ShadowMaterial({ opacity: 0.25 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.5;
    ground.receiveShadow = true;
    scene.add(ground);

    const axes = new THREE.AxesHelper(20);
    axes.position.set(-170, -0.4, -170);
    scene.add(axes);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 10;
    controls.maxDistance = 2000;
    controls.maxPolarAngle = Math.PI / 2 + 0.1;
    controlsRef.current = controls;
    setCubeCamera(camera);
    setCubeCtrl(controls);

    const tc = new TransformControls(camera, renderer.domElement);
    tc.setSize(0.8);
    tc.addEventListener("dragging-changed", (e: { value: unknown }) => {
      controls.enabled = !e.value;
    });
    tc.addEventListener("mouseUp", () => {
      const obj = (tc as unknown as { object: THREE.Object3D | undefined })
        .object;
      if (!obj) return;
      const id = obj.userData.objectId as string;
      const pos = obj.position;
      const rot = obj.rotation;
      const snap = snapValueRef.current;
      const sx = snap > 0 ? Math.round(pos.x / snap) * snap : pos.x;
      const sy = snap > 0 ? Math.round(pos.y / snap) * snap : pos.y;
      const sz = snap > 0 ? Math.round(pos.z / snap) * snap : pos.z;
      const entry = meshMapRef.current.get(id);
      if (!entry) return;
      const mesh = entry.mesh;
      const helper = new THREE.BoxHelper(mesh);
      helper.material.color.set(0xffff00);
      meshMapRef.current.set(id, { mesh, helper });
      scene.add(helper);
    });
    scene.add((tc as unknown as { getHelper(): THREE.Object3D }).getHelper());
    transformCtRef.current = tc;

    const ro = new ResizeObserver(() => {
      const cw = container.clientWidth;
      const ch = container.clientHeight;
      renderer.setSize(cw, ch);
      camera.aspect = cw / ch;
      camera.updateProjectionMatrix();
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
      renderer.render(scene, camera);
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

      // ---- Update BoxHelpers for debugging ----
      // Remove helpers for deselected objects
      for (const id of Array.from(meshMapRef.current.keys())) {
        if (!selectedIds.has(id)) {
          const entry = meshMapRef.current.get(id);
          const helper = entry?.helper;
          if (helper) {
            scene.remove(helper);
            meshMapRef.current.set(id, { mesh: entry.mesh });
          }
        }
      }
      // Add/replace helpers for selected objects
      for (const id of [...selectedIds]) {
        const entry = meshMapRef.current.get(id);
        if (!entry) continue;
        // Ensure mesh is in the map
        if (!meshMapRef.current.has(id)) {
          const helper = new THREE.BoxHelper(entry.mesh);
          helper.material.color.set(0xffff00);
          scene.add(helper);
          meshMapRef.current.set(id, { mesh: entry.mesh, helper });
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
    tc.attach(entry.mesh);
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
          camPos: new THREE.Vector3(80, 80, 120),
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
      fitTargetRef.current = {
        camPos: new THREE.Vector3(
          center.x + dist * 0.6,
          center.y + dist * 0.5,
          center.z + dist * 0.8,
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
        camPos: new THREE.Vector3(80, 80, 120),
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
      if (!rulerMode || !pointerDownPos.current) return;

      const dx = e.clientX - pointerDownPos.current.x;
      const dy = e.clientY - pointerDownPos.current.y;
      if (Math.hypot(dx, dy) > 4) isDraggingRef.current = true;
    },
    [rulerMode],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const start = pointerDownPos.current;
      pointerDownPos.current = null;

      if (!start || !isDraggingRef.current) return;

      if (rulerMode) {
        const point = getWorldPointFromPointer(e);
        if (point && rulerPointsRef.current.length === 1) {
          rulerPointsRef.current = [rulerPointsRef.current[0], point];
          updateRulerVisuals(rulerPointsRef.current);
          onRulerMeasure?.(rulerPointsRef.current[0].distanceTo(point));
        }
      }
    },
    [getWorldPointFromPointer, onRulerMeasure, rulerMode, updateRulerVisuals],
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
        scene.remove(entry.mesh);
        if (entry.helper) scene.remove(entry.helper);
        entry.mesh.geometry.dispose();
        (entry.mesh.material as THREE.Material).dispose();
        map.delete(id);
      }
    }

    // Add or update meshes
    for (const obj of objects) {
      const existing = map.get(obj.id);
      if (existing) {
        // Update geometry if vertices changed
        const pos = existing.mesh.geometry.attributes.position
          .array as Float32Array;
        if (
          pos.length !== obj.vertices.length ||
          pos.some((v, i) => v !== obj.vertices[i])
        ) {
          existing.mesh.geometry.setAttribute(
            "position",
            new THREE.Float32BufferAttribute(obj.vertices, 3),
          );
          existing.mesh.geometry.setIndex(
            new THREE.BufferAttribute(obj.indices, 1),
          );
          existing.mesh.geometry.computeVertexNormals();
          existing.mesh.geometry.attributes.position.needsUpdate = true;
          if (existing.mesh.geometry.index) existing.mesh.geometry.index.needsUpdate = true;
          existing.mesh.geometry.computeBoundingBox();
          existing.mesh.geometry.computeBoundingSphere();
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
        geometry.setIndex(
          new THREE.BufferAttribute(obj.indices, 1),
        );
        geometry.computeVertexNormals();

        const material = new THREE.MeshStandardMaterial({
          color: obj.color,
          roughness: 0.35,
          metalness: 0.1,
          side: THREE.DoubleSide,
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.userData.objectId = obj.id;
        scene.add(mesh);
        map.set(obj.id, { mesh });
      }
    }
  }, [objects, sceneReady]);

  return (
    <div
      ref={containerRef}
      className="viewport"
      style={{ width: '100%', height: '100%' }}
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
