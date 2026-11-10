// ============================================================
// selection-outline.ts — кайма выделенных объектов (SELECTION-OUTLINE)
// ============================================================
// Раньше выделенный объект отличался только слабой подсветкой (emissive 0x444466 × 0.5) —
// на светлых и пастельных цветах её почти не видно. Теперь вокруг выделенных — синяя кайма
// ~3 px (OutlinePass из three/examples): по силуэту объекта, у нескольких выделенных — у всех;
// часть силуэта за другим объектом — приглушённым синим.
//
// Как рисуется (без EffectComposer):
//  • сцена рендерится на канвас как раньше (то же сглаживание MSAA и цвета — без RenderPass /
//    OutputPass и перевода цветов);
//  • поверх — OutlinePass с readBuffer = null: его проходы (глубина невыделенных, маска выделенных,
//    поиск края, размытие) идут в свои буферы, итог — прямо на канвас;
//  • затем — «накладки» (гизмо, размеры: флаг DRAW_OVER_OUTLINE), чтобы кайма их не перекрывала.
// Ничего не выделено — один renderer.render, как раньше (кайма ничего не стоит).
//
// Отличия от штатного OutlinePass:
//  • смешивание каймы обычное (alpha), а не аддитивное — аддитивная на светлой теме выцветает в белый;
//    цвет — ровно SELECTION_OUTLINE.color на экране (перевод в sRGB в шейдере);
//  • камера меняется (перспектива ↔ орто): маска пересобирается под тип камеры (штатно — только
//    при создании прохода);
//  • буферы — в CSS-пикселях (не в физических): толщина каймы одна при любом devicePixelRatio,
//    на HiDPI — вчетверо меньше работы;
//  • тени на время проходов каймы не пересчитываются (карта теней 4096² осталась от основного кадра).

import * as THREE from 'three'
import { OutlinePass } from 'three/examples/jsm/postprocessing/OutlinePass.js'

/** Вид каймы. */
export const SELECTION_OUTLINE = {
  /** Цвет каймы видимой части силуэта (насыщенный синий — отличается от пастельной палитры объектов). */
  color: 0x2f80ff,
  /** Цвет каймы там, где выделенный объект закрыт другим. */
  hiddenColor: 0x1d4f9e,
  /** Яркость каймы (множитель края; итог — непрозрачная линия). */
  edgeStrength: 6,
  /** Размытие края (в пикселях буфера каймы — половина CSS px): толщина ~3 px. */
  edgeThickness: 1,
  /** Свечение (широкий ореол) — нет. */
  edgeGlow: 0,
} as const

/** Флаг userData объектов верхнего уровня сцены, которые рисуются ПОВЕРХ каймы (гизмо, размеры). */
export const DRAW_OVER_OUTLINE = 'drawOverOutline'

/** OutlinePass.render: readBuffer = null — итог прохода рисуется прямо на канвас. */
const CANVAS_TARGET = null as unknown as THREE.WebGLRenderTarget

const isPerspective = (camera: THREE.Camera) => (camera as THREE.PerspectiveCamera).isPerspectiveCamera === true

export class SelectionOutlinePass extends OutlinePass {
  constructor(width: number, height: number, scene: THREE.Scene, camera: THREE.Camera) {
    super(new THREE.Vector2(Math.max(1, width), Math.max(1, height)), scene, camera)
    this.visibleEdgeColor.setHex(SELECTION_OUTLINE.color)
    this.hiddenEdgeColor.setHex(SELECTION_OUTLINE.hiddenColor)
    this.edgeStrength = SELECTION_OUTLINE.edgeStrength
    this.edgeThickness = SELECTION_OUTLINE.edgeThickness
    this.edgeGlow = SELECTION_OUTLINE.edgeGlow
    this.pulsePeriod = 0
    this.usePatternTexture = false
  }

  /** Кайма с обычным смешиванием и точным цветом на экране (штатная — аддитивная). */
  override getOverlayMaterial(): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
      uniforms: {
        maskTexture: { value: null },
        edgeTexture1: { value: null },
        edgeTexture2: { value: null },
        patternTexture: { value: null },
        edgeStrength: { value: 1.0 },
        edgeGlow: { value: 0.0 },
        usePatternTexture: { value: false },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        varying vec2 vUv;
        uniform sampler2D maskTexture;
        uniform sampler2D edgeTexture1;
        uniform sampler2D edgeTexture2;
        uniform float edgeStrength;
        uniform float edgeGlow;
        void main() {
          // edge buffers hold (edgeColor * d, d); mask.r is 0 inside the selected silhouette
          vec4 edge = texture2D(edgeTexture1, vUv) + texture2D(edgeTexture2, vUv) * edgeGlow;
          float outside = texture2D(maskTexture, vUv).r;
          float alpha = clamp(edgeStrength * outside * edge.a, 0.0, 1.0);
          if (alpha <= 0.004) discard;
          gl_FragColor = vec4(edge.rgb / max(edge.a, 1e-4), alpha);
          #include <colorspace_fragment>
        }`,
      blending: THREE.NormalBlending,
      depthTest: false,
      depthWrite: false,
      transparent: true,
    })
  }

  /** Камера кадра: при смене типа (перспектива ↔ орто) — маска под новый тип глубины. */
  setCamera(camera: THREE.Camera): void {
    if (camera === this.renderCamera) return
    const typeChanged = isPerspective(camera) !== isPerspective(this.renderCamera)
    this.renderCamera = camera
    if (!typeChanged) return
    const mask = this.getPrepareMaskMaterial()
    mask.side = THREE.DoubleSide
    mask.fragmentShader = mask.fragmentShader.replace(
      /DEPTH_TO_VIEW_Z/g,
      isPerspective(camera) ? 'perspectiveDepthToViewZ' : 'orthographicDepthToViewZ',
    )
    this.prepareMaskMaterial.dispose()
    this.prepareMaskMaterial = mask
  }
}

/**
 * Меши выделенных объектов для каймы: есть в сцене и видимы (скрытый объект каймы не получает).
 * `out` — переиспользуемый массив (вызывается каждый кадр).
 */
export function selectionOutlineTargets(
  ids: ReadonlySet<string>,
  meshMap: ReadonlyMap<string, { mesh: THREE.Mesh; pivot: THREE.Object3D }>,
  out: THREE.Object3D[] = [],
): THREE.Object3D[] {
  out.length = 0
  for (const id of ids) {
    const entry = meshMap.get(id)
    if (!entry || !entry.mesh.visible || !entry.pivot.visible) continue
    out.push(entry.mesh)
  }
  return out
}

/** Накладки сцены (флаг DRAW_OVER_OUTLINE), видимые сейчас. */
function visibleOverlays(scene: THREE.Scene, out: THREE.Object3D[]): THREE.Object3D[] {
  out.length = 0
  for (const child of scene.children) if (child.visible && child.userData[DRAW_OVER_OUTLINE] === true) out.push(child)
  return out
}

const _overlays: THREE.Object3D[] = []

/**
 * Кадр с каймой: сцена (без накладок) → кайма выделенных → накладки поверх.
 * Без выделенных (`pass.selectedObjects` пуст) — обычный renderer.render. Возвращает: кайма нарисована.
 */
export function renderWithSelectionOutline(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  pass: SelectionOutlinePass,
): boolean {
  if (pass.selectedObjects.length === 0) {
    renderer.render(scene, camera)
    return false
  }
  const overlays = visibleOverlays(scene, _overlays)
  for (const o of overlays) o.visible = false
  renderer.render(scene, camera)
  pass.setCamera(camera)
  const shadowAuto = renderer.shadowMap.autoUpdate
  renderer.shadowMap.autoUpdate = false
  pass.render(renderer, CANVAS_TARGET, CANVAS_TARGET, 0, false)
  renderer.shadowMap.autoUpdate = shadowAuto
  for (const o of overlays) o.visible = true
  if (overlays.length > 0) {
    const autoClear = renderer.autoClear
    renderer.autoClear = false
    for (const o of overlays) renderer.render(o, camera)
    renderer.autoClear = autoClear
  }
  return true
}
