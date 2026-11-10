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
import { computeAABB, colorForIndex, defaultShapeParams } from "../store/helpers";
import { buildObjectGeometry } from "./object-geometry";
import { VIEWPORT_MOUSE_BUTTONS } from "./viewport-nav";
import { createAdaptiveGrid, updateAdaptiveGrid, setAdaptiveGridTheme, viewHeightAt, type GridState } from "./adaptive-grid";
import { useCsgGroupModeStore } from "../store/csg-group-mode";
import { usePlacementModeStore } from "../store/placement-mode";
import { useDimensionsStore } from "../store/dimensions-store";
import { useDimensionModeStore } from "../store/dimension-mode";
import { useUiStore } from "../store/ui-store";
import { useDocumentStore } from "../store/document-store";
import { dimensionEnds, dimensionGeometry, formatDimensionValue } from "../store/dimensions";
import { buildDimensionObject, disposeDimensionObject } from "./dimension-render";
import { useTranslation } from "react-i18next";
import {
    findNearestSnap,
    createSnapIndicator,
    removeSnapIndicators,
    type SnapType,
} from "./snap-utils";
import { devLogStore, devLogSnap, devLogEvent, devLogTransform, devLogPointer } from "../utils/debug";
import { fmtPoint, fmtTransform } from "../utils/debug-format";

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
// GRID-ADAPTIVE: сетка бесконечная — отдаление до 5 м (шаг сетки 100 мм)
const CONTROLS_MAX_DIST = 5000;
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
/** Приёмник теней (прозрачная плоскость под объектами), мм — как прежняя сетка; сетка — adaptive-grid.ts */
const GRID_SIZE = 400;
const GROUND_Z = -0.5;
const GROUND_OPACITY = 0.25;
const AXES_SIZE = 20;
const AXES_POS = new THREE.Vector3(-170, -170, -0.4);

// Selection highlight
const EMISSIVE_SELECTED = 0x444466;
const EMISSIVE_INTENSITY = 0.5;
// CSG-GROUP-FIX: группа A режима вычитания / пересечения — тёплая подсветка (B — как выделение)
const EMISSIVE_GROUP_A = 0xcc6600;
const EMISSIVE_GROUP_A_INTENSITY = 0.9;

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
    gridRef: React.MutableRefObject<THREE.Mesh | null>;
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
    const gridRef = useRef<THREE.Mesh | null>(null);
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

        // GRID-ADAPTIVE: сетка в плоскости XY — тонкая + жирная (×10), шаг 1 / 5 / 10 / 50 / 100 по масштабу,
        // без края (шейдер по мировым координатам, следует за центром вида, гаснет к краю радиуса)
        const grid = createAdaptiveGrid('dark', GROUND_Z);
        scene.add(grid);
        gridRef.current = grid;
        let gridState: GridState | null = null;

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
        // VIEWPORT-NAV: ЛКМ — выбор и рамка (камеру не вращает), ПКМ — вращение, СКМ — сдвиг, колесо — масштаб
        controls.mouseButtons = { ...VIEWPORT_MOUSE_BUTTONS };
        // VIEWPORT-NAV: колесо / вращение / сдвиг прерывают анимацию «Вписать в экран» — иначе
        // после F (из далёкого вида анимация идёт секунды) ввод пользователя затирался анимацией
        controls.addEventListener("start", () => { fitTargetRef.current = null; });
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
            // GRID-ADAPTIVE: шаг и радиус сетки — под текущий вид (масштаб у цели камеры)
            const viewDist = camera.position.distanceTo(controls.target);
            const gs = updateAdaptiveGrid(grid, {
                target: controls.target,
                distance: viewDist,
                viewHeightMm: viewHeightAt(CAMERA_FOV, viewDist),
                viewportHeightPx: container.clientHeight || renderer.domElement.clientHeight,
            });
            if (!gridState || gs.step !== gridState.step || Math.abs(gs.radius - gridState.radius) > 1
                || Math.abs(gs.center.x - gridState.center.x) > 0.5 || Math.abs(gs.center.y - gridState.center.y) > 0.5) {
                gridState = gs;
                container.dataset.gridStep = String(gs.step);
                container.dataset.gridMajor = String(gs.major);
                container.dataset.gridRadius = String(Math.round(gs.radius));
                container.dataset.gridCenter = `${Math.round(gs.center.x)},${Math.round(gs.center.y)}`;
            }
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

// ---- Тема: смена цвета сетки (GRID-ADAPTIVE) ----
export function setGridColor(grid: THREE.Mesh | null, theme: 'dark' | 'light') {
    setAdaptiveGridTheme(grid, theme);
}

// ============================================================
// Хук 2: useMeshSync — синхронизация mesh с объектами сцены
// ============================================================

/**
 * Fast hash for vertex array comparison (FNV-1a inspired).
 */
/**
 * UX-AUDIT-21: что было источником геометрии меша — длины и хэш вершин `SceneObject`.
 * Раньше «вершины изменились» сверялось с `geometry.index?.count`, а у геометрии по излому
 * (CSG, импорт — UX-AUDIT-20) индекса нет → «изменились» на каждый рендер: нормали по излому и
 * рёбра пересчитывались у всех CSG и импортов при любом действии (импорт 100k — ~170 мс).
 * Теперь сверка — с тем, из чего геометрия построена (не с самой геометрией); пишется и при
 * создании меша, чтобы первое же обновление не пересобирало его.
 */
function rememberGeometrySource(mesh: THREE.Mesh, obj: Pick<SceneObject, 'vertices' | 'indices'>, hash = computeVertsHash(obj.vertices)): void {
    mesh.userData.srcVertexLength = obj.vertices.length;
    mesh.userData.srcIndexLength = obj.indices.length;
    mesh.userData.srcVertsHash = hash;
}

function computeVertsHash(vertices: Float32Array): number {
    let hash = 0x811c9dc5;
    const len = vertices.length;
    for (let i = 0; i < len; i += 3) {
        hash ^= (vertices[i] * 31 + vertices[i + 1] * 17 + vertices[i + 2] * 7) | 0;
        hash = Math.imul(hash, 0x01000193);
    }
    return (hash ^ len) | 0;
}

function createPivot(mesh: THREE.Mesh, objectId: string): THREE.Object3D {
    const pivot = new THREE.Object3D();
    pivot.userData.objectId = objectId;
    pivot.add(mesh);
    return pivot;
}

/**
 * FIX (8.5.3): единственная точка, где SceneObject.transform превращается
 * в мировую матрицу рендера. Экспортируется, чтобы CI-тест
 * `render-data-invariant.test.ts` сверял render с данными ПРОДАКШН-кодом,
 * а не реимплементацией формулы.
 *
 * Конвенция единого источника (ARCHITECTURE_RENDER.md §1):
 *   geometry = SceneObject.vertices (всегда в origin, COM)
 *   pivot    = SceneObject.transform (мировой pivot)
 *   world    = T(pos) · R(XYZ) · S · v   — никаких вычитаний центра.
 *
 * Порядок Euler 'XYZ' (по умолчанию у Object3D) = Rx·Ry·Rz — совпадает с
 * computeRSMatrix в worker-matrix.ts (ROT-XYZ-STL), поэтому render == data ==
 * worker для многоосевых поворотов.
 */
export function applyTransformToPivot(pivot: THREE.Object3D, t: TransformNR): void {
    pivot.position.set(t.x, t.y, t.z);
    pivot.rotation.set(
        THREE.MathUtils.degToRad(t.rotX),
        THREE.MathUtils.degToRad(t.rotY),
        THREE.MathUtils.degToRad(t.rotZ),
    );
    pivot.scale.set(t.scaleX, t.scaleY, t.scaleZ);
}

// ============================================================
// UB2-4: рёбра фигур — линии по выраженным граням, «на пару тонов»
// темнее базового цвета объекта (читаемость формы)
// ============================================================

/** Порог угла между гранями (°): рёбра только на выраженных стыках
 *  (куб 90° → да, сфера/тор ~11° → нет) */
const EDGE_THRESHOLD_ANGLE = 30;

/** Максимум треугольников для построения рёбер (защита производительности:
 *  EdgesGeometry — O(треугольников); тяжёлые импорты остаются без рёбер) */
const EDGE_MAX_TRIANGLES = 100_000;

/** Флаг в userData линий рёбер (отличаем от прочих детей меша) */
const EDGE_FLAG = 'isShapeEdges';

/**
 * UB2-4: цвет рёбер — базовый цвет объекта ×0.7 («на пару тонов темнее»).
 * Вычисляется в том же sRGB-пространстве, в котором задан obj.color
 * (материал меша получает цвет той же строкой).
 */
export function edgeColorFor(hex: string): string {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
    if (!m) return hex;
    const n = parseInt(m[1], 16);
    const r = Math.round(((n >> 16) & 0xff) * 0.7);
    const g = Math.round(((n >> 8) & 0xff) * 0.7);
    const b = Math.round((n & 0xff) * 0.7);
    return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

/**
 * UB2-4: прикрепить линии рёбер к мешу (ребёнок меша — наследует
 * visibility/трансформы родителя). Возвращает null, если геометрия
 * слишком тяжёлая для EdgesGeometry.
 */
function attachShapeEdges(mesh: THREE.Mesh, colorHex: string): THREE.LineSegments | null {
    const geo = mesh.geometry as THREE.BufferGeometry;
    const tris = (geo.index?.count ?? geo.attributes.position.count) / 3;
    if (!Number.isFinite(tris) || tris <= 0 || tris > EDGE_MAX_TRIANGLES) return null;
    const edgesGeo = new THREE.EdgesGeometry(geo, EDGE_THRESHOLD_ANGLE);
    const mat = new THREE.LineBasicMaterial({ color: edgeColorFor(colorHex) });
    const lines = new THREE.LineSegments(edgesGeo, mat);
    lines.userData[EDGE_FLAG] = true;
    // Рёбра не участвуют в raycast — выделение и snap работают по мешу
    lines.raycast = () => { };
    mesh.add(lines);
    return lines;
}

/** UB2-4: снять линии рёбер меша и освободить их геометрию/материал */
function detachShapeEdges(mesh: THREE.Mesh): void {
    for (const child of [...mesh.children]) {
        const lines = child as THREE.LineSegments;
        if (lines.userData?.[EDGE_FLAG] === true) {
            mesh.remove(lines);
            lines.geometry.dispose();
            (lines.material as THREE.Material).dispose();
        }
    }
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
    // ---- Emissive highlight for selected objects (и группы A режима CSG — CSG-GROUP-FIX) ----
    const csgGroupA = useCsgGroupModeStore((s) => s.csgGroupMode?.groupA);
    useEffect(() => {
        const sel = selectedIds;
        const groupA = new Set(csgGroupA ?? []);
        for (const [id, entry] of meshMapRef.current) {
            const mat = entry.mesh.material as THREE.MeshStandardMaterial;
            if (groupA.has(id)) {
                mat.emissive.setHex(EMISSIVE_GROUP_A);
                mat.emissiveIntensity = EMISSIVE_GROUP_A_INTENSITY;
                continue;
            }
            mat.emissive.setHex(sel.has(id) ? EMISSIVE_SELECTED : 0x000000);
            mat.emissiveIntensity = sel.has(id) ? EMISSIVE_INTENSITY : 0;
        }
    }, [selectedIds, csgGroupA, meshMapRef]);

    // ---- Sync objects → Three.js meshes ----
    useEffect(() => {
        const scene = sceneRef.current;
        if (!scene) return;
        const currentIds = new Set(objects.map((o) => o.id));
        const map = meshMapRef.current;

        // DIAG: mesh sync overview
        devLogStore('meshSync', { objectCount: objects.length, meshMapSize: map.size, objectIds: objects.map(o => o.id) });

        // Remove meshes that no longer exist
        for (const [id, entry] of map) {
            if (!currentIds.has(id)) {
                devLogStore('meshRemove', { id });
                scene.remove(entry.pivot);
                if (entry.helper) {
                    scene.remove(entry.helper);
                    entry.helper.dispose?.();
                }
                // UB2-4: освобождаем геометрию/материал линий рёбер
                detachShapeEdges(entry.mesh);
                entry.mesh.geometry.dispose();
                (entry.mesh.material as THREE.Material).dispose();
                map.delete(id);
            }
        }

        // Add or update meshes
        for (const obj of objects) {
            const existing = map.get(obj.id);
            if (existing) {
                // Update geometry if raw vertices changed (UX-AUDIT-21: сверка с источником геометрии)
                const src = existing.mesh.userData;
                const vertsHash = computeVertsHash(obj.vertices);
                const vertsChanged =
                    src.srcVertexLength !== obj.vertices.length ||
                    src.srcIndexLength !== obj.indices.length ||
                    src.srcVertsHash !== vertsHash;
                if (vertsChanged) {
                    rememberGeometrySource(existing.mesh, obj, vertsHash);

                    // UX-AUDIT-20: новая геометрия тем же построителем, что при создании (раньше
                    // computeVertexNormals по всем вершинам — у куба после правки сглаживались углы).
                    // FIX (CRIT-18-4): старая геометрия освобождается.
                    const oldGeometry = existing.mesh.geometry;
                    existing.mesh.geometry = buildObjectGeometry(obj);
                    oldGeometry.dispose();

                    // FIX (8.5.3): geometry = vertices как есть — centerGeometry удалён.
                    // SceneObject.vertices всегда в origin (COM), pivot несёт позицию.

                    // UB2-4: геометрия изменилась — пересобираем рёбра
                    detachShapeEdges(existing.mesh);
                    attachShapeEdges(existing.mesh, obj.color);
                }

                // Sync transform from store to pivot
                // FIX (8.5.3): единая точка применения трансформа (applyTransformToPivot)
                // — eps-проверка сохранена как оптимизация (не пересобирать матрицу
                // при подмаштабных изменениях), но формула одна для create/update/preview.
                const t = obj.transform;
                const pivotPos = existing.pivot.position;
                const eps = TRANSFORM_EPS;
                const pivotRot = existing.pivot.rotation;
                const pivotScl = existing.pivot.scale;
                const transformChanged =
                    Math.abs(pivotPos.x - t.x) > eps ||
                    Math.abs(pivotPos.y - t.y) > eps ||
                    Math.abs(pivotPos.z - t.z) > eps ||
                    Math.abs(THREE.MathUtils.radToDeg(pivotRot.x) - t.rotX) > eps ||
                    Math.abs(THREE.MathUtils.radToDeg(pivotRot.y) - t.rotY) > eps ||
                    Math.abs(THREE.MathUtils.radToDeg(pivotRot.z) - t.rotZ) > eps ||
                    Math.abs(pivotScl.x - t.scaleX) > SCALE_EPS ||
                    Math.abs(pivotScl.y - t.scaleY) > SCALE_EPS ||
                    Math.abs(pivotScl.z - t.scaleZ) > SCALE_EPS;
                if (transformChanged) {
                    applyTransformToPivot(existing.pivot, t);
                    devLogTransform('meshSync', obj.id, t);
                }

                // Update visibility
                existing.mesh.visible = obj.visible !== false;
                // Update color
                const mat = existing.mesh.material as THREE.MeshStandardMaterial;
                if (mat.color.getHexString() !== obj.color.replace("#", "")) {
                    mat.color.set(obj.color);
                    // UB2-4: рёбра темнеют вместе с объектом
                    for (const child of existing.mesh.children) {
                        const lines = child as THREE.LineSegments;
                        if (lines.userData?.[EDGE_FLAG] === true) {
                            (lines.material as THREE.LineBasicMaterial).color.set(edgeColorFor(obj.color));
                        }
                    }
                }
            } else {
                // Create new mesh
                devLogStore('meshCreate', {
                    id: obj.id,
                    shapeType: obj.shapeType,
                    vertexCount: obj.vertices.length / 3,
                    indexCount: obj.indices.length,
                    transform: fmtTransform(obj.transform),
                });
                // UX-AUDIT-20: затенение (плоское / по углу излома / гладкое) — object-geometry.ts
                const geometry = buildObjectGeometry(obj);

                const material = new THREE.MeshStandardMaterial({
                    color: obj.color,
                    roughness: MATERIAL_ROUGHNESS,
                    metalness: MATERIAL_METALNESS,
                    side: THREE.DoubleSide,
                });
                const rawMesh = new THREE.Mesh(geometry, material);
                rememberGeometrySource(rawMesh, obj);          // UX-AUDIT-21
                rawMesh.castShadow = true;
                rawMesh.receiveShadow = true;
                rawMesh.userData.objectId = obj.id;
                const pivot = createPivot(rawMesh, obj.id);
                // UB2-4: рёбра по выраженным граням, «на пару тонов» темнее
                // (ребёнок меша — наследует visibility/трансформы родителя)
                attachShapeEdges(rawMesh, obj.color);
                applyTransformToPivot(pivot, obj.transform);

                // DIAG: RENDER:csg — verify world position of CSG vertices
                if (obj.shapeType === 'csg') {
                    const geo = rawMesh.geometry as THREE.BufferGeometry;
                    const pos = geo.attributes.position;
                    if (pos) {
                        const verts = pos.array as Float32Array;
                        const firstV = { x: verts[0], y: verts[1], z: verts[2] };
                        const { min, max } = computeAABB(verts);
                        const cx = (min.x + max.x) / 2, cy = (min.y + max.y) / 2, cz = (min.z + max.z) / 2;
                        devLogStore('RENDER:csg', {
                            id: obj.id,
                            local: firstV,
                            mesh: { position: { x: rawMesh.position.x, y: rawMesh.position.y, z: rawMesh.position.z } },
                            pivot: { position: { x: pivot.position.x, y: pivot.position.y, z: pivot.position.z } },
                            world: {
                                x: pivot.position.x + firstV.x,
                                y: pivot.position.y + firstV.y,
                                z: pivot.position.z + firstV.z,
                            },
                            bbox: { min, max, center: { x: cx, y: cy, z: cz } },
                        });
                    }
                }

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
                devLogSnap('ruler', { type: snapResult.type ?? 'none', point: { x: snapResult.point.x, y: snapResult.point.y, z: snapResult.point.z }, distance: snapResult.snapDistance });
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
                devLogEvent('ruler', 'click', { pointIndex: 0, point: fmtPoint(point) });
                rulerPointsRef.current = [point];
                updateRulerVisuals(rulerPointsRef.current);
            } else {
                // Second click: complete measurement
                rulerPointsRef.current.push(point);
                updateRulerVisuals(rulerPointsRef.current);
                const dist = rulerPointsRef.current[0].distanceTo(point);
                devLogEvent('ruler', 'measure', { distance: dist.toFixed(2), from: fmtPoint(rulerPointsRef.current[0]), to: fmtPoint(point) });
                onRulerMeasure?.(dist);
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
            devLogPointer('rulerMove', { worldX: worldPoint.x, worldY: worldPoint.y, worldZ: worldPoint.z });

            const screenPos = new THREE.Vector2(x, y);
            const raycaster = new THREE.Raycaster();
            raycaster.setFromCamera(screenPos, camera);

            const result = findNearestSnap(raycaster, meshMapRef, camera, screenPos, shapeTypeMapRef.current);
            if (result) {
                devLogSnap('preview', { type: result.type ?? 'none', point: { x: result.point.x, y: result.point.y, z: result.point.z }, distance: result.snapDistance });
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

        // FIX (8.5.3): центрирование убрано — previewObject.vertices уже в origin
        // (та же конвенция, что у обычных объектов), pivot несёт позицию.
        geometry.computeBoundingBox();
        geometry.computeBoundingSphere();

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
        applyTransformToPivot(pivot, t);
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

// ============================================================
// PLUG-AND-PLAY: превью размещаемой фигуры
// ============================================================

/** Прозрачность превью размещения. */
export const PLACEMENT_PREVIEW_OPACITY = 0.5;

/**
 * Полупрозрачное превью фигуры в режиме размещения: меш той же фигуры (из воркера, параметры по
 * умолчанию), цвет — как у следующего объекта; трансформ — место под курсором (стоит на
 * плоскости). Вне raycast (не мешает выбору грани под собой). Нет места под курсором — скрыто.
 */
export function usePlacementPreview(
    sceneRef: React.MutableRefObject<THREE.Scene | null>,
    nextIndex: number,
): void {
    const shapeType = usePlacementModeStore((s) => s.placementMode?.shapeType ?? null);
    const meshData = usePlacementModeStore((s) => s.placementMode?.mesh ?? null);
    const transform = usePlacementModeStore((s) => s.placementMode?.preview?.transform ?? null);
    const ref = useRef<THREE.Object3D | null>(null);

    useEffect(() => {
        const scene = sceneRef.current;
        if (!scene || !shapeType || !meshData) return;
        const geometry = buildObjectGeometry({
            shapeType, params: defaultShapeParams(shapeType),
            vertices: meshData.vertices, indices: meshData.indices, normals: meshData.normals,
        });
        const material = new THREE.MeshStandardMaterial({
            color: colorForIndex(nextIndex),
            transparent: true,
            opacity: PLACEMENT_PREVIEW_OPACITY,
            roughness: 0.4,
            metalness: 0,
            depthWrite: false,
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.raycast = () => { };
        mesh.renderOrder = 998;
        const pivot = new THREE.Object3D();
        pivot.userData.placementPreview = true;
        pivot.visible = false;
        pivot.add(mesh);
        scene.add(pivot);
        ref.current = pivot;
        return () => {
            scene.remove(pivot);
            geometry.dispose();
            material.dispose();
            ref.current = null;
        };
    }, [sceneRef, shapeType, meshData, nextIndex]);

    useEffect(() => {
        const pivot = ref.current;
        if (!pivot) return;
        if (!transform) { pivot.visible = false; return; }
        applyTransformToPivot(pivot, transform);
        pivot.visible = true;
    }, [transform, shapeType, meshData, nextIndex]);
}

// ============================================================
// DIMENSIONS: слой размерных линий
// ============================================================

/**
 * Размеры в сцене: группа на каждый видимый размер (оба объекта есть и видимы) — линии,
 * стрелки, число (billboard). Пересобирается при изменении размеров, слоя, выделения, объектов
 * (сдвиг / поворот / масштаб / геометрия — число пересчитано: ассоциативность) и языка.
 * Слой скрыт («Показать / скрыть размеры») — групп нет. Возвращает корень для raycast.
 */
export function useDimensionsRender(
    sceneRef: React.MutableRefObject<THREE.Scene | null>,
    sceneReady: boolean,
): React.MutableRefObject<THREE.Group | null> {
    const { t, i18n } = useTranslation();
    const dimensions = useDimensionsStore((s) => s.dimensions);
    const show = useDimensionsStore((s) => s.showDimensions);
    const selectedId = useDimensionsStore((s) => s.selectedDimensionId);
    const objects = useDocumentStore((s) => s.objects);
    const rootRef = useRef<THREE.Group | null>(null);

    useEffect(() => {
        const scene = sceneRef.current;
        if (!scene) return;
        const root = new THREE.Group();
        root.userData.dimensionsRoot = true;
        root.renderOrder = 996;
        if (show) {
            for (const d of dimensions) {
                const ends = dimensionEnds(d, objects);
                if (!ends) continue;
                const geom = dimensionGeometry(ends, d.style.kind, d.offset, d.style.size * 0.9);
                const text = t("dimensions.label", { value: formatDimensionValue(geom.value) });
                root.add(buildDimensionObject(d.id, geom, d.style, text, d.id === selectedId));
            }
        }
        scene.add(root);
        rootRef.current = root;
        return () => {
            scene.remove(root);
            disposeDimensionObject(root);
            if (rootRef.current === root) rootRef.current = null;
        };
    }, [sceneRef, sceneReady, dimensions, show, selectedId, objects, t, i18n.language]);

    return rootRef;
}

/**
 * Режим «Размер»: маркер привязки под курсором (цвет — вид привязки, как у линейки), маркер
 * точки A и превью размера A → курсор со стилем новых размеров и числом — до второго клика.
 */
export function useDimensionModePreview(sceneRef: React.MutableRefObject<THREE.Scene | null>): void {
    const { t } = useTranslation();
    const mode = useDimensionModeStore((s) => s.dimensionMode);
    const defaults = useUiStore((s) => s.dimensionDefaults);
    const objects = useDocumentStore((s) => s.objects);
    const first = mode?.first ?? null;
    const hover = mode?.hover ?? null;

    useEffect(() => {
        const scene = sceneRef.current;
        if (!scene || !mode) return;
        const root = new THREE.Group();
        root.userData.dimensionPreview = true;
        const marker = (p: { x: number; y: number; z: number }, color: number) => {
            const m = new THREE.Mesh(
                new THREE.SphereGeometry(0.9, 12, 12),
                new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true, opacity: 0.95 }),
            );
            m.position.set(p.x, p.y, p.z);
            m.renderOrder = 998;
            m.raycast = () => { };
            root.add(m);
        };
        if (hover) {
            const c = hover.snap === "vertex" ? 0xff4444 : hover.snap === "edge" ? 0x44ff44 : hover.snap === "circle" ? 0x4488ff : hover.snap === "face" ? 0xffff44 : 0xffffff;
            marker(hover.point, c);
        }
        if (first) marker(first.point, 0x89b4fa);
        if (first && hover) {
            const A = objects[first.objectId], B = objects[hover.objectId];
            const ends = {
                a: first.point, b: hover.point,
                centerA: A ? { x: A.transform.x, y: A.transform.y, z: A.transform.z } : first.point,
                centerB: B ? { x: B.transform.x, y: B.transform.y, z: B.transform.z } : hover.point,
            };
            const geom = dimensionGeometry(ends, defaults.style.kind, defaults.offset, defaults.style.size * 0.9);
            if (geom.value > 1e-6) {
                const g = buildDimensionObject("__dimension_preview__", geom, defaults.style, t("dimensions.label", { value: formatDimensionValue(geom.value) }), false);
                g.traverse((o) => { o.raycast = () => { }; });
                root.add(g);
            }
        }
        scene.add(root);
        return () => {
            scene.remove(root);
            disposeDimensionObject(root);
        };
    }, [sceneRef, mode, first, hover, defaults, objects, t]);
}
