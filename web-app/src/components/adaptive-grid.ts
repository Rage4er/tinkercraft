// ============================================================
// adaptive-grid.ts — адаптивная сетка рабочей плоскости (GRID-ADAPTIVE)
// ============================================================
// Раньше — GridHelper 400 × 400 мм с шагом 10: при отдалении сетка обрывалась квадратом, при
// приближении клетка 10 мм была огромной. Теперь — как в AutoCAD:
//  • ДВЕ сетки всегда: тонкая (minor, шаг s) и жирная (major, каждые 10 клеток — 10·s), плюс оси X / Y;
//  • шаг адаптивный: s ∈ 1 / 5 / 10 / 50 / 100 мм — наименьший, при котором клетка на экране не
//    меньше GRID_MIN_CELL_PX (отдалили — укрупняется, приблизили — детализируется);
//  • не обрывается: линии считаются в шейдере по мировым координатам точки плоскости, сама плоскость
//    следует за центром вида (цель камеры) и мягко гаснет к краю радиуса, который растёт с
//    отдалением камеры; мелкие клетки у горизонта (меньше пары пикселей) гаснут, а не рябят.
// Плоскость — z = GROUND_Z (чуть ниже 0), вне raycast и тени.

import * as THREE from 'three'

export const GRID_STEPS = [1, 5, 10, 50, 100] as const
export type GridStep = (typeof GRID_STEPS)[number]
/** Жирная линия — каждые столько клеток тонкой. */
export const GRID_MAJOR_FACTOR = 10
/** Клетка тонкой сетки на экране — не меньше, px. */
export const GRID_MIN_CELL_PX = 16
/** Радиус сетки вокруг центра вида: не меньше, мм, и × расстояние камеры до цели. */
export const GRID_MIN_RADIUS = 600
export const GRID_RADIUS_PER_DISTANCE = 8

export interface GridColors { minor: number; major: number }
export const GRID_COLORS: Record<'dark' | 'light', GridColors> = {
  dark: { minor: 0x2e2e4c, major: 0x45456e },
  light: { minor: 0xc8c8d4, major: 0x9a9aac },
}

/** Пикселей экрана на 1 мм у цели камеры: высота вьюпорта / видимая высота сцены там. */
export function pixelsPerMm(viewHeightMm: number, viewportHeightPx: number): number {
  return viewHeightMm > 0 ? viewportHeightPx / viewHeightMm : Infinity
}

/** Видимая высота сцены (мм) на расстоянии `distance` для вертикального угла обзора `fovDeg`. */
export function viewHeightAt(fovDeg: number, distance: number): number {
  return 2 * distance * Math.tan(THREE.MathUtils.degToRad(fovDeg) / 2)
}

/** Шаг тонкой сетки: наименьший из 1 / 5 / 10 / 50 / 100, чья клетка ≥ `minPx` пикселей. */
export function gridStepFor(pxPerMm: number, minPx = GRID_MIN_CELL_PX): GridStep {
  for (const s of GRID_STEPS) if (s * pxPerMm >= minPx) return s
  return GRID_STEPS[GRID_STEPS.length - 1]
}

/** Радиус сетки вокруг центра вида: растёт с отдалением камеры (сетка не кончается в кадре). */
export function gridRadiusFor(distance: number): number {
  return Math.max(GRID_MIN_RADIUS, distance * GRID_RADIUS_PER_DISTANCE)
}

const vertexShader = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`

const fragmentShader = /* glsl */ `
uniform float uStep;
uniform float uMajorFactor;
uniform vec3 uMinorColor;
uniform vec3 uMajorColor;
uniform float uMinorAlpha;
uniform float uMajorAlpha;
uniform vec2 uCenter;
uniform float uRadius;
varying vec3 vWorld;

// 1 on a grid line (widthPx pixels wide), 0 between lines; coord is in cells
float lineMask(vec2 coord, float widthPx) {
  vec2 d = max(fwidth(coord), vec2(1e-6));
  vec2 g = abs(fract(coord - 0.5) - 0.5) / d;
  return 1.0 - min(min(g.x, g.y) / widthPx, 1.0);
}
// cells smaller than a couple of pixels (near the horizon) fade out instead of aliasing
float densityFade(vec2 coord) {
  vec2 d = fwidth(coord);
  return 1.0 - smoothstep(0.2, 0.45, max(d.x, d.y));
}

void main() {
  vec2 p = vWorld.xy;
  vec2 cMinor = p / uStep;
  vec2 cMajor = p / (uStep * uMajorFactor);
  float minor = lineMask(cMinor, 1.0) * densityFade(cMinor);
  float major = lineMask(cMajor, 1.5) * densityFade(cMajor);
  vec2 da = max(fwidth(p), vec2(1e-6));
  float axis = 1.0 - min(min(abs(p.x) / da.x, abs(p.y) / da.y) / 1.8, 1.0);
  float fade = 1.0 - smoothstep(uRadius * 0.55, uRadius, length(p - uCenter));
  float a = max(max(minor * uMinorAlpha, major * uMajorAlpha), axis * min(1.0, uMajorAlpha * 1.4)) * fade;
  if (a <= 0.004) discard;
  gl_FragColor = vec4(mix(uMinorColor, uMajorColor, clamp(max(major, axis), 0.0, 1.0)), a);
}
`

/** Состояние сетки после обновления (для e2e — в data-атрибутах вьюпорта). */
export interface GridState { step: GridStep; major: number; radius: number; center: { x: number; y: number } }

/** Сетка: плоскость с шейдером (вне raycast, без теней), z = `z`. */
export function createAdaptiveGrid(theme: 'dark' | 'light', z: number): THREE.Mesh {
  const colors = GRID_COLORS[theme]
  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      uStep: { value: 10 },
      uMajorFactor: { value: GRID_MAJOR_FACTOR },
      uMinorColor: { value: new THREE.Color(colors.minor) },
      uMajorColor: { value: new THREE.Color(colors.major) },
      uMinorAlpha: { value: 0.55 },
      uMajorAlpha: { value: 0.85 },
      uCenter: { value: new THREE.Vector2(0, 0) },
      uRadius: { value: GRID_MIN_RADIUS },
    },
  })
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material)
  mesh.position.z = z
  mesh.renderOrder = -1
  mesh.raycast = () => { }
  mesh.frustumCulled = false
  mesh.userData.adaptiveGrid = true
  return mesh
}

/**
 * Обновить сетку под текущий вид: центр — цель камеры (x, y), радиус — от расстояния камеры,
 * шаг — по масштабу (пикселей на мм у цели). Плоскость накрывает круг радиуса.
 */
export function updateAdaptiveGrid(grid: THREE.Mesh, view: { target: { x: number; y: number }; distance: number; viewHeightMm: number; viewportHeightPx: number }): GridState {
  const step = gridStepFor(pixelsPerMm(view.viewHeightMm, view.viewportHeightPx))
  const radius = gridRadiusFor(view.distance)
  const u = (grid.material as THREE.ShaderMaterial).uniforms
  u.uStep.value = step
  u.uRadius.value = radius
  ;(u.uCenter.value as THREE.Vector2).set(view.target.x, view.target.y)
  grid.position.x = view.target.x
  grid.position.y = view.target.y
  grid.scale.set(radius * 2, radius * 2, 1)
  return { step, major: step * GRID_MAJOR_FACTOR, radius, center: { x: view.target.x, y: view.target.y } }
}

/** Цвета сетки по теме (`colors` — из темы, THEME-ENGINE; без них — по базе). */
export function setAdaptiveGridTheme(grid: THREE.Mesh | null, theme: 'dark' | 'light', colors?: GridColors): void {
  if (!grid) return
  const u = (grid.material as THREE.ShaderMaterial).uniforms
  const c = colors ?? GRID_COLORS[theme]
  ;(u.uMinorColor.value as THREE.Color).setHex(c.minor)
  ;(u.uMajorColor.value as THREE.Color).setHex(c.major)
}
