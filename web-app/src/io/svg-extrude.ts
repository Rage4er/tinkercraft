// ============================================================
// svg-extrude — SVG-EXTRUDE: контур 2D из .svg → 3D-тело (2D → 3D)
// ============================================================
//
// Аналог Fusion 360 (Insert SVG → Extrude): `SVGLoader` (three.js, ленивый чанк) разбирает
// документ в `ShapePath` → `SVGLoader.createShapes` выделяет контуры с дырками → каждый контур
// выдавливается `ExtrudeGeometry` (глубина 1) и масштабируется в мм матрицей (scale, −scale, depth):
// ось Y зеркалится, потому что в SVG она направлена вниз, а в сцене — вверх (иначе контур
// получился бы перевёрнутым). Зеркало переводит обход треугольников в обратный — порядок вершин
// каждого треугольника меняется местами до сварки, нормали снова наружу, manifold строится.
// Дальше — пайплайн как у 3D-текста (UX-AUDIT-3/18, `io/text-mesh.ts`): сварка `mergeVertices`,
// вырожденные треугольники прочь, `repairTJunctions` (дырка, касающаяся внешнего контура).
// Контуры свариваются ОТДЕЛЬНО: касающиеся контуры общей сваркой давали бы ребро с 4 гранями.
// Тело создаётся как `import_mesh` через `store/addRawMesh` (история, undo/redo, CSG — всё как
// у импорта STL). Меш гарантированно замкнут (кроме самопересечений контура — тогда воркер
// сообщит об ошибке manifold, как у незамкнутого STL).

import { ExtrudeGeometry, Matrix4, type Shape } from 'three'
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'   // уже в основном чанке (object-geometry)
import { repairTJunctions } from './text-mesh'
import { MAX_STL_TRIANGLES } from './stl-import'
import i18n from '../i18n'

/** Допуск сварки вершин (мм): дубликаты точек контура — точные копии. */
export const SVG_WELD_TOLERANCE = 1e-4
/** Сегментация кривых (круги, дуги) на сегменты — как у текста. */
export const SVG_CURVE_SEGMENTS = 8

/** Ошибка построения тела из SVG с причиной для пользователя (ключ i18n). */
export class SvgExtrudeError extends Error {
  readonly reasonKey: 'errors.svgBadSize' | 'errors.svgNoShapes' | 'errors.svgTooManyTris'
  readonly params?: Record<string, unknown>
  constructor(reasonKey: SvgExtrudeError['reasonKey'], detail: string, params?: Record<string, unknown>) {
    super(detail)
    this.name = 'SvgExtrudeError'
    this.reasonKey = reasonKey
    this.params = params
  }
}

export interface SvgExtrudeOptions {
  /** Глубина выдавливания (высота тела), мм */
  depth: number
  /** Масштаб: 1 единица SVG = scale мм */
  scale: number
}

export interface SvgMesh {
  vertices: number[]
  indices: number[]
}

/** Разобрать SVG-текст в контуры (`Shape`, с дырками). Бросает `SvgExtrudeError`, если контуров нет. */
export async function parseSvgShapes(svgText: string): Promise<Shape[]> {
  const { SVGLoader } = await import('three/examples/jsm/loaders/SVGLoader.js')
  const data = new SVGLoader().parse(svgText)
  const shapes = data.paths.flatMap((p) => SVGLoader.createShapes(p))
  if (shapes.length === 0) throw new SvgExtrudeError('errors.svgNoShapes', 'no shapes')
  return shapes
}

/** Развернуть обход каждого треугольника (b ↔ c) — зеркало по Y меняет ориентацию на обратную. */
function flipTriangleWinding(geo: ExtrudeGeometry): void {
  if (geo.index) {
    const idx = geo.index.array as ArrayLike<number> & { [i: number]: number }
    for (let i = 0; i < geo.index.count; i += 3) {
      const b = idx[i + 1]
      idx[i + 1] = idx[i + 2]
      idx[i + 2] = b
    }
    geo.index.needsUpdate = true
    return
  }
  const pos = geo.attributes.position.array as ArrayLike<number> & { [i: number]: number }
  for (let i = 0; i + 8 < pos.length; i += 9) {
    for (let k = 0; k < 3; k++) {
      const b = pos[i + 3 + k]
      pos[i + 3 + k] = pos[i + 6 + k]
      pos[i + 6 + k] = b
    }
  }
  geo.attributes.position.needsUpdate = true
}

/**
 * Построить замкнутый меш тела из SVG. Бросает `SvgExtrudeError`, если глубина/масштаб
 * не > 0, контуров нет или слишком много треугольников — вызывающий показывает уведомление.
 */
export async function buildSvgMesh(svgText: string, { depth, scale }: SvgExtrudeOptions): Promise<SvgMesh> {
  if (!(depth > 0) || !(scale > 0)) throw new SvgExtrudeError('errors.svgBadSize', `depth ${depth}, scale ${scale}`)
  const shapes = await parseSvgShapes(svgText)
  const vertices: number[] = []
  const indices: number[] = []
  for (const shape of shapes) {
    const geo = new ExtrudeGeometry(shape, { depth: 1, curveSegments: SVG_CURVE_SEGMENTS, bevelEnabled: false })
    try {
      geo.deleteAttribute('normal')
      geo.deleteAttribute('uv')
      // SVG: y вниз, сцена: y вверх. Масштаб → мм: x/y — scale, z (глубина 1) — depth (мм).
      geo.applyMatrix4(new Matrix4().makeScale(scale, -scale, depth))
      flipTriangleWinding(geo)
      const welded = mergeVertices(geo, SVG_WELD_TOLERANCE)
      try {
        const pos = welded.attributes.position
        const v = Array.from(pos.array as ArrayLike<number>)
        const src = welded.index ? Array.from(welded.index.array as ArrayLike<number>) : Array.from({ length: pos.count }, (_, i) => i)
        let tris: number[] = []
        for (let i = 0; i + 2 < src.length; i += 3) {
          const a = src[i], b = src[i + 1], c = src[i + 2]
          if (a !== b && b !== c && a !== c) tris.push(a, b, c)    // вырожденные (после сварки) — прочь
        }
        tris = repairTJunctions(v, tris)
        const base = vertices.length / 3
        for (const x of v) vertices.push(x)
        for (const i of tris) indices.push(base + i)
      } finally {
        welded.dispose()
      }
    } finally {
      geo.dispose()
    }
  }
  const tris = indices.length / 3
  if (tris === 0) throw new SvgExtrudeError('errors.svgNoShapes', 'empty geometry')
  if (tris > MAX_STL_TRIANGLES) {
    throw new SvgExtrudeError('errors.svgTooManyTris', `${tris} tris`, { count: tris.toLocaleString(), max: MAX_STL_TRIANGLES.toLocaleString() })
  }
  return { vertices, indices }
}

/** Причина ошибки для уведомления: известная — переводом (с параметрами шаблона), прочая — сообщением. */
export function svgErrorMessage(e: unknown): string {
  if (e instanceof SvgExtrudeError) return i18n.t(e.reasonKey, e.params ?? {})
  return e instanceof Error ? e.message : String(e)
}

export const MAX_SVG_FILE_SIZE = 10 * 1024 * 1024

/** Диалог выбора .svg (как `openStlFilePicker`, stl-import.ts). */
export function openSvgFilePicker(): Promise<File | null> {
  return new Promise(resolve => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.svg'
    input.onchange = () => resolve(input.files?.[0] ?? null)
    input.oncancel = () => resolve(null)
    input.click()
    setTimeout(() => { input.onchange = null; input.oncancel = null }, 60000)
  })
}

/** Прочитать выбранный .svg как текст. Лимит размера — `MAX_SVG_FILE_SIZE` (проверяет вызывающий). */
export async function readSvgFile(file: File): Promise<string> {
  return file.text()
}
