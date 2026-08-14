// ============================================================
// viewport-hooks.ts — Вынесенные хуки из Viewport3D
// ============================================================
// Содержит хуки для инициализации Three.js, синхронизации mesh,
// логики линейки (ruler) и превью mirror.
// ============================================================

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
import { computeAABB } from "../store/helpers";
import {
    findNearestSnap,
    createSnapIndicator,
    removeSnapIndicators,
    type SnapType,
} from "./snap-utils";

// ============================================================
// Константы (перенесены из Viewport3D.tsx)
// ============================================================

// Camera defaults
const CAMERA_FOV = 45;
const CAMERA_NEAR = 0.1;
const CAMERA_FAR = 10000;
const DEFAULT_CAM_POS = new THREE.Vector3(150, -200, 120);
const DEFAULT_CAM_TARGET = new THREE.Vector3(0, 0, 0);
const ORTHO_HALF_FOV_DEG = 22.5;

// Controls
const CONTROLS_DAMPING = 0.08;
const CONTROLS_MIN_DIST = 10;
const CONTROLS_MAX_DIST = 2000;
const CONTROLS_MAX_POLAR = Math.PI - 0.01;
const TRANSFORM_SIZE = 0.8;

// Lighting
const AMBIENT_INTENSITY = 0.45;
const SUN_INTENSITY = 1.2;
const SUN_POS = new THREE.Vector3(100, -80, 200);
const SUN_SHADOW_SIZE = 4096;
const SUN_SHADOW_RANGE = 200;
const SUN_SHADOW_NEAR = 0.1;
const SUN_SHADOW_FAR = 1000;
// FIX: shadow acne — PCFSoftShadowMap без bias даёт полосатые треугольники на гранях.
// Вертикальные грани (угол падения света ≈ 90°) требуют БОЛЬШЕГО сдвига, чем
// горизонтальные — для них -0.0005 было недостаточно.
const SUN_SHADOW_BIAS = -0.002;
const SUN_SHADOW_NORMAL_BIAS = 0.05;
const FILL_INTENSITY = 0.4;
const FILL_POS = new THREE.Vector3(-100, 80, 50);
const FILL_COLOR = 0x8888ff;

// Scene
const BG_COLOR_DARK = 0x1e1e2e;
const BG_COLOR_LIGHT = 0xf0f0f5;
const GRID_SIZE = 400;
const GRID_DIVISIONS = 40;
const GRID_COLOR_MAJOR_DARK = 0x3a3a5c;
const GRID_COLOR_MINOR_DARK = 0x2a2a4a;
const GRID_COLOR_MAJOR_LIGHT = 0x999999;
const GRID_COLOR_MINOR_LIGHT = 0xcccccc;
const GROUND_Z = -0.5;
const GROUND_OPACITY = 0.25;
const AXES_SIZE = 20;
const AXES_POS = new THREE.Vector3(-170, -170, -0.4);

// Selection highlight
const EMISSIVE_SELECTED = 0x444466;
const EMISSIVE_INTENSITY = 0.5;

// Material defaults
const MATERIAL_ROUGHNESS = 0.35;
const MATERIAL_METALNESS = 0.1;

// Interaction thresholds
const TRANSFORM_EPS = 0.01;
const SCALE_EPS = 0.001;
const LERP_FACTOR = 0.12;
const LERP_SETTLE_DIST = 0.5;
const FPS_INTERVAL_MS = 500;
const PIXEL_RATIO_CAP = 2;

// Ruler markers
const RULER_MARKER_RADIUS = 0.5;
const RULER_MARKER_SEGMENTS = 8;
const RULER_COLOR = "#facc15";

// ============================================================
// Типы
// ============================================================

export type GizmoMode = "translate" | "rotate" | "scale" | "none";

interface FitTarget {
    camPos: THREE.Vector3;
    target: THREE.Vector3;
}


export interface ThreeInitResult {
    sceneReady: boolean;
    containerRef: React.RefObject<HTMLDivElement | null>;
    rendererRef: React.MutableRefObject<THREE.WebGLRenderer | null>;
    sceneRef: React.MutableRefObject<THREE.Scene | null>;
    cameraRef: React.MutableRefObject<THREE.PerspectiveCamera | null>;
    orthoCameraRef: React.MutableRefObject<THREE.OrthographicCamera | null>;
    cameraModeRef: React.MutableRefObject<'perspective' | 'orthographic'>;
    activeCameraRef: React.MutableRefObject<THREE.Camera | null>;
    controlsRef: React.MutableRefObject<OrbitControls | null>;
    transformCtRef: React.MutableRefObject<TransformControls | null>;
    meshMapRef: React.MutableRefObject<
        Map<string, { mesh: THREE.Mesh; pivot: THREE.Object3D; helper?: THREE.BoxHelper }>
    >;
    rafRef: React.MutableRefObject<number | null>;
    fpsRef: React.MutableRefObject<{ last: number; frames: number }>;
    fitTargetRef: React.MutableRefObject<FitTarget | null>;
    cubeCamera: THREE.PerspectiveCamera | null;
    cubeCtrl: OrbitControls | null;
    gridRef: React.MutableRefObject<THREE.GridHelper | null>;
}

// ============================================================
// Хук 1: useThreeInit — инициализация Three.js
// ============================================================

export function useThreeInit(
    webglOk: boolean,
    cameraMode: 'perspective' | 'orthographic',
    onFpsUpdate: (fps: number) => void,
): ThreeInitResult {
    const [sceneReady, setSceneReady] = useState(false);
    const [cubeCamera, setCubeCamera] = useState<THREE.PerspectiveCamera | null>(null);
    const [cubeCtrl, setCubeCtrl] = useState<OrbitControls | null>(null);

    const containerRef = useRef<HTMLDivElement>(null);
    const initRanRef = useRef(false);
    const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
    const sceneRef = useRef<THREE.Scene | null>(null);
    const gridRef = useRef<THREE.GridHelper | null>(null);
    const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
    const orthoCameraRef = useRef<THREE.OrthographicCamera | null>(null);
    const cameraModeRef = useRef<'perspective' | 'orthographic'>(cameraMode);
    const activeCameraRef = useRef<THREE.Camera | null>(null);
    const controlsRef = useRef<OrbitControls | null>(null);
    const transformCtRef = useRef<TransformControls | null>(null);
    const meshMapRef = useRef<
        Map<string, { mesh: THREE.Mesh; pivot: THREE.Object3D; helper?: THREE.BoxHelper }>
    >(new Map());
    const rafRef = useRef<number | null>(null);
    const fpsRef = useRef({ last: performance.now(), frames: 0 });
    const fitTargetRef = useRef<FitTarget | null>(null);

    // Keep cameraModeRef in sync with prop
    useEffect(() => {
        cameraModeRef.current = cameraMode;
    }, [cameraMode]);

    // Stabilize onFpsUpdate via ref
    const fpsUpdateRef = useRef(onFpsUpdate);
    useEffect(() => {
        fpsUpdateRef.current = onFpsUpdate;
    }, [onFpsUpdate]);

    // ---- Init Three.js ----
    useLayoutEffect(() => {
        if (!webglOk) return;
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
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, PIXEL_RATIO_CAP));
        renderer.setSize(w, h);
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        renderer.setClearColor(BG_COLOR_DARK);
        container.appendChild(renderer.domElement);
        rendererRef.current = renderer;

        const scene = new THREE.Scene();
        sceneRef.current = scene;

        // Z-up coordinate system
        const camera = new THREE.PerspectiveCamera(CAMERA_FOV, w / h, CAMERA_NEAR, CAMERA_FAR);
        camera.up.set(0, 0, 1);
        camera.position.copy(DEFAULT_CAM_POS);
        camera.lookAt(DEFAULT_CAM_TARGET);
        cameraRef.current = camera;

        // Orthographic camera
        const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, CAMERA_NEAR, CAMERA_FAR);
        ortho.up.set(0, 0, 1);
        ortho.position.copy(DEFAULT_CAM_POS);
        orthoCameraRef.current = ortho;
        activeCameraRef.current = camera;

        scene.add(new THREE.AmbientLight(0xffffff, AMBIENT_INTENSITY));

        const sun = new THREE.DirectionalLight(0xffffff, SUN_INTENSITY);
        sun.position.copy(SUN_POS);
        sun.castShadow = true;
        sun.shadow.mapSize.width = sun.shadow.mapSize.height = SUN_SHADOW_SIZE;
        sun.shadow.camera.left = sun.shadow.camera.bottom = -SUN_SHADOW_RANGE;
        sun.shadow.camera.right = sun.shadow.camera.top = SUN_SHADOW_RANGE;
        sun.shadow.camera.near = SUN_SHADOW_NEAR;
        sun.shadow.camera.far = SUN_SHADOW_FAR;
        // FIX: bias убирает полосатые артефакты самозатенения на плоских гранях
        sun.shadow.bias = SUN_SHADOW_BIAS;
        sun.shadow.normalBias = SUN_SHADOW_NORMAL_BIAS;
        scene.add(sun);

        const fill = new THREE.DirectionalLight(FILL_COLOR, FILL_INTENSITY);
        fill.position.copy(FILL_POS);
        scene.add(fill);

        // Grid in XY plane (Z=0)
        const grid = new THREE.GridHelper(GRID_SIZE, GRID_DIVISIONS, GRID_COLOR_MAJOR_DARK, GRID_COLOR_MINOR_DARK);
        grid.rotation.x = Math.PI / 2;
        grid.position.z = GROUND_Z;
        scene.add(grid);
        gridRef.current = grid;

        // Shadow receiver
        const groundGeo = new THREE.PlaneGeometry(GRID_SIZE, GRID_SIZE);
        const groundMat = new THREE.ShadowMaterial({ opacity: GROUND_OPACITY });
        const ground = new THREE.Mesh(groundGeo, groundMat);
        ground.position.z = GROUND_Z;
        ground.receiveShadow = true;
        scene.add(ground);

        // Axes helper
        const axes = new THREE.AxesHelper(AXES_SIZE);
        axes.position.copy(AXES_POS);
        scene.add(axes);

        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = CONTROLS_DAMPING;
        controls.minDistance = CONTROLS_MIN_DIST;
        controls.maxDistance = CONTROLS_MAX_DIST;
        controls.maxPolarAngle = CONTROLS_MAX_POLAR;
        controlsRef.current = controls;
        setCubeCamera(camera);
        setCubeCtrl(controls);

        const tc = new TransformControls(camera, renderer.domElement);
        tc.setSize(TRANSFORM_SIZE);
        tc.setSpace("world");
        tc.addEventListener("dragging-changed", (e: { value: unknown }) => {
            controls.enabled = !e.value;
        });
        // FIX: TransformControls must be added to scene via getHelper() to render the gizmo
        scene.add((tc as unknown as { getHelper(): THREE.Object3D }).getHelper());
        transformCtRef.current = tc;

        const ro = new ResizeObserver(() => {
            const cw = container.clientWidth;
            const ch = container.clientHeight;
            // FIX (LOW-18-23): Use devicePixelRatio for correct rendering on high-DPI displays
            const dpr = window.devicePixelRatio || 1;
            renderer.setPixelRatio(dpr);
            renderer.setSize(cw, ch);
            camera.aspect = cw / ch;
            camera.updateProjectionMatrix();
        });
        ro.observe(container);

        const animate = () => {
            rafRef.current = requestAnimationFrame(animate);
            const ft = fitTargetRef.current;
            if (ft) {
                camera.position.lerp(ft.camPos, LERP_FACTOR);
                controls.target.lerp(ft.target, LERP_FACTOR);
                controls.update();
                if (
                    camera.position.distanceTo(ft.camPos) < LERP_SETTLE_DIST &&
                    controls.target.distanceTo(ft.target) < LERP_SETTLE_DIST
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
                const halfH = dist * Math.tan(THREE.MathUtils.degToRad(ORTHO_HALF_FOV_DEG));
                const aspect = renderer.domElement.width / Math.max(1, renderer.domElement.height);
                orthoC.left = -halfH * aspect;
                orthoC.right = halfH * aspect;
                orthoC.top = halfH;
                orthoC.bottom = -halfH;
                orthoC.updateProjectionMatrix();
                activeCam = orthoC;
            }
            activeCameraRef.current = activeCam;
            renderer.render(scene, activeCam);
            const now = performance.now();
            fpsRef.current.frames++;
            if (now - fpsRef.current.last >= FPS_INTERVAL_MS) {
                fpsUpdateRef.current(
                    Math.round(
                        (fpsRef.current.frames * 1000) / (now - fpsRef.current.last),
                    ),
                );
                fpsRef.current = { last: now, frames: 0 };
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
            // FIX (HIGH-18-15): Dispose TransformControls to prevent listener/WebGL leaks
            if (transformCtRef.current) {
                transformCtRef.current.dispose();
                transformCtRef.current = null;
            }
        };
    }, [webglOk]);

    return {
        sceneReady,
        containerRef,
        rendererRef,
        sceneRef,
        cameraRef,
        orthoCameraRef,
        cameraModeRef,
        activeCameraRef,
        controlsRef,
        transformCtRef,
        meshMapRef,
        rafRef,
        fpsRef,
        fitTargetRef,
        cubeCamera,
        cubeCtrl,
        gridRef,
    };
}

// ---- Тема: смена цвета грида ----
export function setGridColor(grid: THREE.GridHelper | null, theme: 'dark' | 'light') {
    if (!grid) return;
    const major = theme === 'dark' ? GRID_COLOR_MAJOR_DARK : GRID_COLOR_MAJOR_LIGHT;
    const minor = theme === 'dark' ? GRID_COLOR_MINOR_DARK : GRID_COLOR_MINOR_LIGHT;
    grid.material = new THREE.LineBasicMaterial({
        color: minor,
        transparent: true,
        opacity: 0.5,
    });
}

// ============================================================
// Хук 2: useMeshSync — синхронизация mesh с объектами сцены
// ============================================================

/**
 * Fast hash for vertex array comparison (FNV-1a inspired).
 */
function computeVertsHash(vertices: Float32Array): number {
    let hash = 0x811c9dc5;
    const len = vertices.length;
    for (let i = 0; i < len; i += 3) {
        hash ^= (vertices[i] * 31 + vertices[i + 1] * 17 + vertices[i + 2] * 7) | 0;
        hash = Math.imul(hash, 0x01000193);
    }
    return (hash ^ len) | 0;
}

/**
 * Centers mesh geometry and returns a container (pivot).
 */
function centerGeometry(mesh: THREE.Mesh, objectId: string): THREE.Object3D {
    const geo = mesh.geometry as THREE.BufferGeometry;
    const pos = geo.attributes.position;
    if (pos) {
        const vertices = pos.array as Float32Array;
        const { min, max } = computeAABB(vertices);
        const cx = (min.x + max.x) / 2, cy = (min.y + max.y) / 2, cz = (min.z + max.z) / 2;
        geo.translate(-cx, -cy, -cz);
    }

    const container = new THREE.Object3D();
    container.userData.objectId = objectId;
    container.add(mesh);
    return container;
}

export function useMeshSync(
    objects: SceneObject[],
    sceneReady: boolean,
    sceneRef: React.MutableRefObject<THREE.Scene | null>,
    meshMapRef: React.MutableRefObject<
        Map<string, { mesh: THREE.Mesh; pivot: THREE.Object3D; helper?: THREE.BoxHelper }>
    >,
    selectedIds: Set<string>,
): void {
    // ---- Emissive highlight for selected objects ----
    useEffect(() => {
        const sel = selectedIds;
        for (const [id, entry] of meshMapRef.current) {
            const mat = entry.mesh.material as THREE.MeshStandardMaterial;
            mat.emissive.setHex(sel.has(id) ? EMISSIVE_SELECTED : 0x000000);
            mat.emissiveIntensity = sel.has(id) ? EMISSIVE_INTENSITY : 0;
        }
    }, [selectedIds, meshMapRef]);

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
                if (entry.helper) {
                    scene.remove(entry.helper);
                    entry.helper.dispose?.();
                }
                entry.mesh.geometry.dispose();
                (entry.mesh.material as THREE.Material).dispose();
                map.delete(id);
            }
        }

        // Add or update meshes
        for (const obj of objects) {
            const existing = map.get(obj.id);
            if (existing) {
                // Update geometry if raw vertices changed
                const cachedRaw = existing.mesh.userData.cachedRawVertices as Float32Array | undefined;
                const cachedHash = existing.mesh.userData.cachedVertsHash as number | undefined;
                const vertsHash = computeVertsHash(obj.vertices);
                const vertsChanged =
                    !cachedRaw ||
                    cachedRaw.length !== obj.vertices.length ||
                    obj.indices.length !== (existing.mesh.geometry.index?.count ?? 0) ||
                    cachedHash !== vertsHash;
                if (vertsChanged) {
                    existing.mesh.userData.cachedRawVertices = new Float32Array(obj.vertices);
                    existing.mesh.userData.cachedVertsHash = vertsHash;

                    // FIX (CRIT-18-4): Dispose old BufferAttribute before replacing to prevent memory leak
                    const oldPos = existing.mesh.geometry.getAttribute('position');
                    if (oldPos) (oldPos as unknown as { dispose?: () => void }).dispose?.()
                    const oldIdx = existing.mesh.geometry.index;
                    if (oldIdx) (oldIdx as unknown as { dispose?: () => void }).dispose?.()

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

                    // Re-center geometry
                    const box = existing.mesh.geometry.boundingBox!;
                    const center = new THREE.Vector3();
                    box.getCenter(center);
                    existing.mesh.geometry.translate(-center.x, -center.y, -center.z);
                    existing.mesh.geometry.computeBoundingBox();
                    existing.mesh.geometry.computeBoundingSphere();
                }

                // Sync transform from store to pivot
                const t = obj.transform;
                const pivotPos = existing.pivot.position;
                const eps = TRANSFORM_EPS;
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
                    Math.abs(pivotScl.x - t.scaleX) > SCALE_EPS ||
                    Math.abs(pivotScl.y - t.scaleY) > SCALE_EPS ||
                    Math.abs(pivotScl.z - t.scaleZ) > SCALE_EPS
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

                // FIX: Для flat-фигур (куб, призма, пирамида, CSG) разворачиваем
                // индексированную геометрию в неиндексированную — каждая грань
                // получает уникальные вершины с нормалью по нормали грани.
                const flatShapes = ['cube', 'prism', 'pyramid'];
                const isFlat = flatShapes.includes(obj.shapeType) || !obj.params || Object.keys(obj.params).length === 0;

                if (isFlat) {
                    // Разворачиваем: 3 уникальные вершины на треугольник
                    const numTris = obj.indices.length / 3;
                    const flatVerts = new Float32Array(numTris * 9);
                    const flatNormals = new Float32Array(numTris * 9);
                    const flatIndices = new Uint32Array(numTris * 3);

                    for (let t = 0; t < numTris; t++) {
                        for (let v = 0; v < 3; v++) {
                            const srcIdx = obj.indices[t * 3 + v];
                            const dstIdx = t * 3 + v;
                            const srcOff = srcIdx * 3;
                            const dstOff = dstIdx * 3;
                            flatVerts[dstOff] = obj.vertices[srcOff];
                            flatVerts[dstOff + 1] = obj.vertices[srcOff + 1];
                            flatVerts[dstOff + 2] = obj.vertices[srcOff + 2];
                            // Нормаль из воркера (по вершине) или fallback
                            if (obj.normals && obj.normals.length > 0) {
                                const nx = obj.normals[srcOff];
                                const ny = obj.normals[srcOff + 1];
                                const nz = obj.normals[srcOff + 2];
                                const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
                                if (len > 0.0001) {
                                    flatNormals[dstOff] = nx / len;
                                    flatNormals[dstOff + 1] = ny / len;
                                    flatNormals[dstOff + 2] = nz / len;
                                } else {
                                    flatNormals[dstOff] = 0;
                                    flatNormals[dstOff + 1] = 1;
                                    flatNormals[dstOff + 2] = 0;
                                }
                            } else {
                                flatNormals[dstOff] = 0;
                                flatNormals[dstOff + 1] = 1;
                                flatNormals[dstOff + 2] = 0;
                            }
                            flatIndices[dstIdx] = dstIdx;
                        }
                    }

                    geometry.setAttribute("position", new THREE.Float32BufferAttribute(flatVerts, 3));
                    geometry.setAttribute("normal", new THREE.Float32BufferAttribute(flatNormals, 3));
                    geometry.setIndex(new THREE.BufferAttribute(flatIndices, 1));
                } else {
                    // Smooth shading: используем нормали из воркера (или пересчитываем)
                    if (obj.normals && obj.normals.length > 0) {
                        const normalizedNormals = new Float32Array(obj.normals.length);
                        for (let i = 0; i < obj.normals.length; i += 3) {
                            const nx = obj.normals[i];
                            const ny = obj.normals[i + 1];
                            const nz = obj.normals[i + 2];
                            const length = Math.sqrt(nx * nx + ny * ny + nz * nz);
                            if (length > 0.0001) {
                                normalizedNormals[i] = nx / length;
                                normalizedNormals[i + 1] = ny / length;
                                normalizedNormals[i + 2] = nz / length;
                            } else {
                                normalizedNormals[i] = 0;
                                normalizedNormals[i + 1] = 1;
                                normalizedNormals[i + 2] = 0;
                            }
                        }
                        geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normalizedNormals, 3));
                    } else {
                        geometry.computeVertexNormals();
                    }
                }

                const material = new THREE.MeshStandardMaterial({
                    color: obj.color,
                    roughness: MATERIAL_ROUGHNESS,
                    metalness: MATERIAL_METALNESS,
                    side: THREE.DoubleSide,
                });
                const rawMesh = new THREE.Mesh(geometry, material);
                rawMesh.castShadow = true;
                rawMesh.receiveShadow = true;
                rawMesh.userData.objectId = obj.id;
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
    }, [objects, sceneReady, sceneRef, meshMapRef]);
}

// ============================================================
// Хук 3: useRulerMode — логика линейки (ruler)
// ============================================================

export function useRulerMode(
    rulerMode: boolean,
    sceneRef: React.MutableRefObject<THREE.Scene | null>,
    cameraRef: React.MutableRefObject<THREE.PerspectiveCamera | null>,
    meshMapRef: React.MutableRefObject<
        Map<string, { mesh: THREE.Mesh; pivot: THREE.Object3D; helper?: THREE.BoxHelper }>
    >,
    onRulerMeasure?: (dist: number) => void,
) {
    const rulerLineRef = useRef<THREE.Line | null>(null);
    const rulerMarkersRef = useRef<THREE.Mesh[]>([]);
    const rulerPointsRef = useRef<THREE.Vector3[]>([]);
    const snapIndicatorRef = useRef<THREE.Mesh | null>(null);
    const shapeTypeMapRef = useRef<Map<string, string>>(new Map());
    const [snapPreviewPoint, setSnapPreviewPoint] = useState<THREE.Vector3 | null>(null);
    const [snapPreviewType, setSnapPreviewType] = useState<SnapType>(null);

    const rulerModeRef = useRef(rulerMode);
    useEffect(() => {
        rulerModeRef.current = rulerMode;
    }, [rulerMode]);

    // Sync shapeType map
    useEffect(() => {
        const map = new Map<string, string>();
        // shapeTypeMapRef is populated externally via objects prop
        // This is a simplified version — the actual sync happens in Viewport3D
    }, []);

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
    }, [sceneRef]);

    const updateRulerVisuals = useCallback(
        (pts: THREE.Vector3[]) => {
            const scene = sceneRef.current;
            if (!scene) return;
            clearRulerVisuals();
            rulerPointsRef.current = pts.map((p) => p.clone());
            const mat = new THREE.LineBasicMaterial({
                color: RULER_COLOR,
                linewidth: 2,
            });
            const geo = new THREE.BufferGeometry();
            const pos: number[] = pts.flatMap((p) => [p.x, p.y, p.z]);
            if (pts.length === 1) pos.push(pts[0].x, pts[0].y, pts[0].z);
            geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
            const line = new THREE.Line(geo, mat);
            scene.add(line);
            rulerLineRef.current = line;

            for (const p of pts) {
                const m = new THREE.Mesh(
                    new THREE.SphereGeometry(RULER_MARKER_RADIUS, RULER_MARKER_SEGMENTS, RULER_MARKER_SEGMENTS),
                    new THREE.MeshBasicMaterial({ color: RULER_COLOR }),
                );
                m.position.copy(p);
                scene.add(m);
                rulerMarkersRef.current.push(m);
            }
        },
        [clearRulerVisuals, sceneRef],
    );

    // Ruler mode toggle
    useEffect(() => {
        if (!rulerMode) {
            rulerPointsRef.current = [];
            clearRulerVisuals();
            removeSnapIndicators(sceneRef.current);
            snapIndicatorRef.current = null;
            setSnapPreviewPoint(null);
            setSnapPreviewType(null);
        }
    }, [rulerMode, clearRulerVisuals, sceneRef]);

    // Snap indicator update (preview on hover in rulerMode)
    useEffect(() => {
        const pt = snapPreviewPoint;
        const type = snapPreviewType;
        const scene = sceneRef.current;
        if (!scene) return;

        // Remove old indicator
        if (snapIndicatorRef.current) {
            scene.remove(snapIndicatorRef.current);
            snapIndicatorRef.current.geometry.dispose();
            (snapIndicatorRef.current.material as THREE.Material).dispose();
            snapIndicatorRef.current = null;
        }

        // Create new one if preview exists
        if (pt && rulerMode) {
            const indicator = createSnapIndicator(pt, type);
            scene.add(indicator);
            snapIndicatorRef.current = indicator;
        }
    }, [snapPreviewPoint, snapPreviewType, rulerMode, sceneRef]);

    // Ruler pointer handlers
    const handleRulerPointerDown = useCallback(
        (e: React.PointerEvent<HTMLDivElement>, camera: THREE.Camera | null, container: HTMLDivElement | null) => {
            const scene = sceneRef.current;
            if (!scene || !camera || !container) return;

            const rect = container.getBoundingClientRect();
            const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
            const y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
            const screenPos = new THREE.Vector2(x, y);
            const raycaster = new THREE.Raycaster();
            raycaster.setFromCamera(screenPos, camera);

            // First try snap to geometry
            const snapResult = findNearestSnap(raycaster, meshMapRef, camera, screenPos, shapeTypeMapRef.current);
            let point: THREE.Vector3;
            if (snapResult) {
                point = snapResult.point;
            } else {
                // Fallback: project onto work plane (Z=0)
                const ndc = new THREE.Vector3(x, y, 0);
                ndc.unproject(camera);
                const dir = ndc.sub(camera.position).normalize();
                const groundZ = 0;
                const distance = (groundZ - camera.position.z) / dir.z;
                if (!Number.isFinite(distance) || distance < 0) return;
                point = camera.position.clone().add(dir.clone().multiplyScalar(distance));
            }

            if (rulerPointsRef.current.length === 0) {
                // First click: save start point
                rulerPointsRef.current = [point];
                updateRulerVisuals(rulerPointsRef.current);
            } else {
                // Second click: complete measurement
                rulerPointsRef.current.push(point);
                updateRulerVisuals(rulerPointsRef.current);
                onRulerMeasure?.(rulerPointsRef.current[0].distanceTo(point));
                // Reset for next measurement
                rulerPointsRef.current = [];
            }
        },
        [sceneRef, meshMapRef, updateRulerVisuals, onRulerMeasure],
    );

    const handleRulerPointerMove = useCallback(
        (e: React.PointerEvent<HTMLDivElement>, camera: THREE.Camera | null, container: HTMLDivElement | null) => {
            const scene = sceneRef.current;
            if (!scene || !camera || !container) return;

            const rect = container.getBoundingClientRect();
            const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
            const y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
            const ndc = new THREE.Vector3(x, y, 0);
            ndc.unproject(camera);

            const dir = ndc.sub(camera.position).normalize();
            const groundZ = 0;
            const distance = (groundZ - camera.position.z) / dir.z;
            if (!Number.isFinite(distance) || distance < 0) return;

            const worldPoint = camera.position.clone().add(dir.clone().multiplyScalar(distance));
            const screenPos = new THREE.Vector2(x, y);
            const raycaster = new THREE.Raycaster();
            raycaster.setFromCamera(screenPos, camera);

            const result = findNearestSnap(raycaster, meshMapRef, camera, screenPos, shapeTypeMapRef.current);
            if (result) {
                setSnapPreviewPoint(result.point);
                setSnapPreviewType(result.type);
            } else {
                setSnapPreviewPoint(null);
                setSnapPreviewType(null);
            }
        },
        [sceneRef, meshMapRef],
    );

    return {
        rulerLineRef,
        rulerMarkersRef,
        rulerPointsRef,
        snapIndicatorRef,
        shapeTypeMapRef,
        snapPreviewPoint,
        snapPreviewType,
        clearRulerVisuals,
        updateRulerVisuals,
        handleRulerPointerDown,
        handleRulerPointerMove,
    };
}

// ============================================================
// Хук 4: useMirrorPreview — логика превью mirror
// ============================================================

export function useMirrorPreview(
    previewObject: (SceneObject & { isMirrorPreview: boolean }) | null,
    mirrorPreviewPlane: 'XY' | 'XZ' | 'YZ' | null,
    sceneRef: React.MutableRefObject<THREE.Scene | null>,
) {
    const mirrorPreviewRef = useRef<{
        mesh: THREE.Mesh;
        pivot: THREE.Object3D;
    } | null>(null);
    const mirrorPlaneRef = useRef<THREE.Mesh | null>(null);

    // Mirror preview mesh — единый метод для preview и confirm
    useEffect(() => {
        const scene = sceneRef.current;
        if (!scene) return;

        // Remove existing preview
        if (mirrorPreviewRef.current) {
            scene.remove(mirrorPreviewRef.current.pivot);
            mirrorPreviewRef.current.mesh.geometry.dispose();
            (mirrorPreviewRef.current.mesh.material as THREE.Material).dispose();
            mirrorPreviewRef.current = null;
        }

        if (!previewObject) return;

        // Создаём mesh как обычный SceneObject, но с прозрачностью
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute(
            "position",
            new THREE.Float32BufferAttribute(previewObject.vertices, 3),
        );
        geometry.setIndex(new THREE.BufferAttribute(previewObject.indices, 1));
        geometry.computeVertexNormals();

        // Центрируем геометрию (как в useMeshSync для обычных объектов).
        // FIX (MIRROR-PREVIEW-CENTER): computeBoundingBox() нужно вызвать явно —
        // geometry.boundingBox равен null по умолчанию и заполняется только после вызова этого метода.
        geometry.computeBoundingBox();
        const box = geometry.boundingBox;
        if (box) {
            const center = new THREE.Vector3();
            box.getCenter(center);
            geometry.translate(-center.x, -center.y, -center.z);
            geometry.computeBoundingBox();
            geometry.computeBoundingSphere();
        }

        const material = new THREE.MeshStandardMaterial({
            color: 0x4488ff,
            transparent: true,
            opacity: 0.35,
            roughness: 0.3,
            metalness: 0.0,
            side: THREE.DoubleSide,
            depthWrite: false,
            // FIX (MIRROR-PREVIEW-XY): depthTest: false гарантирует видимость превью
            // через полупрозрачную плоскость зеркала (особенно критично для XY-плоскости,
            // где меш оказывается за непрозрачным полом/сеткой сцены).
            depthTest: false,
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.renderOrder = 999;
        mesh.userData.objectId = '__mirror_preview__';

        // Применяем transform через pivot (как в useMeshSync)
        const pivot = new THREE.Object3D();
        pivot.userData.objectId = '__mirror_preview__';
        const t = previewObject.transform;
        pivot.position.set(t.x, t.y, t.z);
        pivot.rotation.set(
            THREE.MathUtils.degToRad(t.rotX),
            THREE.MathUtils.degToRad(t.rotY),
            THREE.MathUtils.degToRad(t.rotZ),
        );
        pivot.scale.set(t.scaleX, t.scaleY, t.scaleZ);
        pivot.add(mesh);
        scene.add(pivot);
        mirrorPreviewRef.current = { mesh, pivot };

        return () => {
            if (mirrorPreviewRef.current) {
                const s = sceneRef.current;
                if (s) {
                    s.remove(mirrorPreviewRef.current.pivot);
                }
                mirrorPreviewRef.current.mesh.geometry.dispose();
                (mirrorPreviewRef.current.mesh.material as THREE.Material).dispose();
                mirrorPreviewRef.current = null;
            }
        };
    }, [previewObject, sceneRef]);

    // Mirror plane visualizer (MIRROR-4)
    useEffect(() => {
        const scene = sceneRef.current;
        if (!scene) return;

        // Remove existing plane
        if (mirrorPlaneRef.current) {
            scene.remove(mirrorPlaneRef.current);
            mirrorPlaneRef.current.geometry.dispose();
            (mirrorPlaneRef.current.material as THREE.Material).dispose();
            mirrorPlaneRef.current = null;
        }

        if (!mirrorPreviewPlane) return;

        // Create a large semi-transparent plane aligned to the mirror plane
        const planeSize = 100;
        let geometry: THREE.PlaneGeometry;
        let rotation: THREE.Euler;

        switch (mirrorPreviewPlane) {
            case 'XY':
                geometry = new THREE.PlaneGeometry(planeSize, planeSize);
                rotation = new THREE.Euler(0, 0, 0);
                break;
            case 'XZ':
                geometry = new THREE.PlaneGeometry(planeSize, planeSize);
                rotation = new THREE.Euler(-Math.PI / 2, 0, 0);
                break;
            case 'YZ':
                geometry = new THREE.PlaneGeometry(planeSize, planeSize);
                rotation = new THREE.Euler(0, Math.PI / 2, 0);
                break;
        }

        const material = new THREE.MeshStandardMaterial({
            color: 0x4488ff,
            transparent: true,
            opacity: 0.15,
            roughness: 0.5,
            metalness: 0.0,
            side: THREE.DoubleSide,
            depthWrite: false,
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.rotation.copy(rotation);
        mesh.renderOrder = 998;
        scene.add(mesh);
        mirrorPlaneRef.current = mesh;

        return () => {
            if (mirrorPlaneRef.current) {
                const s = sceneRef.current;
                if (s) {
                    s.remove(mirrorPlaneRef.current);
                }
                mirrorPlaneRef.current.geometry.dispose();
                (mirrorPlaneRef.current.material as THREE.Material).dispose();
                mirrorPlaneRef.current = null;
            }
        };
    }, [mirrorPreviewPlane, sceneRef]);

    return {
        mirrorPreviewRef,
        mirrorPlaneRef,
    };
}
