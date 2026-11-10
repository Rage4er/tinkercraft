// ============================================================
// dimension-render.ts — 3D-отрисовка размера (DIMENSIONS)
// ============================================================
// Группа Three.js для одного размера по его геометрии (`store/dimensions.ts`):
//  • линии — размерная и выносные (LineSegments);
//  • стрелки — конусы на концах размерной линии, остриём наружу (к концам);
//  • число — Sprite (billboard: всегда лицом к камере) с текстурой из canvas: «20.0 мм» цветом и
//    шрифтом стиля на тёмной плашке; высота спрайта — высота текста стиля (мм, в мире).
// Всё рисуется поверх объектов (depthTest: false) — размер не прячется внутри тел. У каждого
// объекта группы `userData.dimensionId` — клик по размеру (raycast) выделяет его.
// Выделенный размер — цветом выделения.

import * as THREE from 'three'
import type { Vec3 } from '../csg/types'
import type { DimensionGeometry, DimensionStyle } from '../store/dimensions'

/** Цвет выделенного размера. */
export const DIMENSION_SELECTED_COLOR = '#89b4fa'
/** Высота текстуры текста (px) — чёткость; размер в мире задаёт `style.size`. */
const LABEL_PX = 64
const RENDER_ORDER = 996

const v3 = (p: Vec3) => new THREE.Vector3(p.x, p.y, p.z)

/** Canvas с текстом размера (null — нет 2D-контекста, например jsdom). */
export function drawDimensionLabel(text: string, style: Pick<DimensionStyle, 'color' | 'font'>, color = style.color): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  let ctx: CanvasRenderingContext2D | null = null
  try { ctx = canvas.getContext('2d') } catch { ctx = null }
  if (!ctx) return null
  const font = `600 ${LABEL_PX}px ${style.font}`
  ctx.font = font
  const pad = LABEL_PX * 0.3
  canvas.width = Math.ceil(ctx.measureText(text).width + pad * 2)
  canvas.height = Math.ceil(LABEL_PX * 1.4)
  ctx.font = font                                             // размер холста сбрасывает контекст
  ctx.fillStyle = 'rgba(17, 17, 27, 0.78)'
  const r = canvas.height * 0.25
  ctx.beginPath()
  ctx.moveTo(r, 0); ctx.lineTo(canvas.width - r, 0); ctx.quadraticCurveTo(canvas.width, 0, canvas.width, r)
  ctx.lineTo(canvas.width, canvas.height - r); ctx.quadraticCurveTo(canvas.width, canvas.height, canvas.width - r, canvas.height)
  ctx.lineTo(r, canvas.height); ctx.quadraticCurveTo(0, canvas.height, 0, canvas.height - r)
  ctx.lineTo(0, r); ctx.quadraticCurveTo(0, 0, r, 0)
  ctx.fill()
  ctx.fillStyle = color
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, canvas.width / 2, canvas.height / 2 + LABEL_PX * 0.04)
  return canvas
}

/** Конус-стрелка остриём в `tip`, смотрящий вдоль `dir`. */
function arrow(tip: Vec3, dir: THREE.Vector3, length: number, material: THREE.Material): THREE.Mesh {
  const geo = new THREE.ConeGeometry(length * 0.32, length, 12)
  const mesh = new THREE.Mesh(geo, material)
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir)
  mesh.position.copy(v3(tip)).addScaledVector(dir, -length / 2)
  mesh.renderOrder = RENDER_ORDER
  return mesh
}

/**
 * Группа размера. `text` — подпись («20.0 мм»), `selected` — цвет выделения. Число (текстура)
 * создаётся, если доступен canvas 2D; иначе — спрайт без текстуры (только для raycast).
 */
export function buildDimensionObject(id: string, geom: DimensionGeometry, style: DimensionStyle, text: string, selected: boolean): THREE.Group {
  const color = selected ? DIMENSION_SELECTED_COLOR : style.color
  const group = new THREE.Group()
  group.userData.dimensionId = id
  group.renderOrder = RENDER_ORDER

  const pts: number[] = []
  for (const [p, q] of [geom.line, ...geom.extensions]) pts.push(p.x, p.y, p.z, q.x, q.y, q.z)
  const lineGeo = new THREE.BufferGeometry()
  lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
  const lineMat = new THREE.LineBasicMaterial({ color, depthTest: false, transparent: true })
  const lines = new THREE.LineSegments(lineGeo, lineMat)
  lines.renderOrder = RENDER_ORDER
  lines.userData.dimensionId = id
  group.add(lines)

  // стрелки — если линия длиннее двух стрелок (иначе только линия)
  const [p, q] = geom.line
  const lineLen = Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z)
  const arrowLen = Math.max(1, style.size * 0.6)
  if (lineLen > arrowLen * 2.2) {
    const dir = v3(q).sub(v3(p)).normalize()
    const arrowMat = new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true })
    const a1 = arrow(q, dir, arrowLen, arrowMat)
    const a2 = arrow(p, dir.clone().negate(), arrowLen, arrowMat)
    a1.userData.dimensionId = id
    a2.userData.dimensionId = id
    group.add(a1, a2)
  }

  const canvas = drawDimensionLabel(text, style, color)
  const texture = canvas ? new THREE.CanvasTexture(canvas) : null
  if (texture) texture.colorSpace = THREE.SRGBColorSpace
  const spriteMat = new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true, color: texture ? 0xffffff : color })
  const sprite = new THREE.Sprite(spriteMat)
  const aspect = canvas ? canvas.width / canvas.height : 3
  const h = style.size * 1.4                                   // текст + плашка
  sprite.scale.set(h * aspect, h, 1)
  sprite.position.copy(v3(geom.label))
  sprite.renderOrder = RENDER_ORDER + 1
  sprite.userData.dimensionId = id
  sprite.userData.dimensionLabel = text
  group.add(sprite)
  return group
}

/** Освободить геометрии, материалы и текстуры группы размера. */
export function disposeDimensionObject(group: THREE.Object3D): void {
  group.traverse((o) => {
    const m = o as THREE.Mesh
    if (m.geometry) m.geometry.dispose()
    const mat = (m as { material?: THREE.Material | THREE.Material[] }).material
    for (const x of Array.isArray(mat) ? mat : mat ? [mat] : []) {
      const map = (x as THREE.SpriteMaterial).map
      if (map) map.dispose()
      x.dispose()
    }
  })
}

/** Первый размер под лучом (линии — с допуском `lineThreshold` мм) или null. */
export function pickDimension(raycaster: THREE.Raycaster, root: THREE.Object3D, lineThreshold = 1.5): string | null {
  const prev = raycaster.params.Line?.threshold
  raycaster.params.Line = { threshold: lineThreshold }
  try {
    const hits = raycaster.intersectObject(root, true)
    for (const h of hits) {
      const id = h.object.userData.dimensionId as string | undefined
      if (id) return id
    }
    return null
  } finally {
    raycaster.params.Line = { threshold: prev ?? 1 }
  }
}
