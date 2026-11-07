// ============================================================
// text-mesh — меш 3D-текста для сцены (UX-AUDIT-3)
// ============================================================
//
// `TextGeometry` (three.js) — НЕиндексированная геометрия: у каждого треугольника свои
// вершины, а на рёбрах ещё и разные нормали/UV. Раньше App отдавал её как есть с индексами
// 0..n-1 — «суп» треугольников без общих рёбер, manifold его не строил, и CSG с текстом
// (гравировка: куб − текст) отказывал «Меш не замкнут… Проверьте STL».
// Здесь: снимаем нормали и UV (нужна только позиция — нормали считает воркер), сшиваем
// совпадающие вершины (`mergeVertices`) и выбрасываем вырожденные треугольники —
// получается замкнутый меш, годный для CSG.
// UX-AUDIT-18: у helvetiker нет кириллицы и диакритики — такие строки строятся запасным
// шрифтом Droid Sans; каждый контур выдавливается и сваривается отдельно (соседние буквы
// касаются), Т-образные стыки (дырка касается контура) чинятся; символы, которых нет ни в
// одном шрифте, возвращаются в `missing` — вызывающий предупреждает.

import { ExtrudeGeometry } from 'three'
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'   // уже в основном чанке (object-geometry)

/** Допуск сварки вершин (мм): глифы шрифта — сотни единиц, совпадающие точки — точные копии. */
export const TEXT_WELD_TOLERANCE = 1e-4

export interface TextMeshOptions {
  /** Высота букв, мм */
  size: number
  /** Глубина (толщина) текста, мм */
  depth: number
}

export interface TextMesh {
  vertices: number[]
  indices: number[]
  /**
   * UX-AUDIT-18: символы строки, которых нет в шрифте (без пробельных), — three.js рисует
   * вместо них «?»; вызывающий предупреждает пользователя. Пусто — всё есть.
   */
  missing: string[]
}

/** Ошибка построения текста с причиной для пользователя (ключ i18n) — UX-AUDIT-10. */
export class TextMeshError extends Error {
  readonly reasonKey: 'errors.textNoGlyphs' | 'errors.textBadSize'
  constructor(reasonKey: TextMeshError['reasonKey'], detail: string) {
    super(detail)
    this.name = 'TextMeshError'
    this.reasonKey = reasonKey
  }
}

/**
 * Построить замкнутый меш текста. Бросает `TextMeshError`, если размер/глубина не > 0 или
 * геометрии нет (в шрифте нет ни одного символа строки) — вызывающий показывает
 * уведомление (UX-AUDIT-10, `store/add-text.ts`).
 */
export async function buildTextMesh(text: string, { size, depth }: TextMeshOptions): Promise<TextMesh> {
  if (!(size > 0) || !(depth > 0)) throw new TextMeshError('errors.textBadSize', `size ${size}, depth ${depth}`)
  // шрифт (~60 КБ) и генераторы — отдельным чанком, только когда текст действительно нужен
  const [{ FontLoader }, fontModule] = await Promise.all([
    import('three/examples/jsm/loaders/FontLoader.js'),
    import('three/examples/fonts/helvetiker_regular.typeface.json'),
  ])
  type FontData = Parameters<InstanceType<typeof FontLoader>['parse']>[0]
  const parse = (mod: unknown) => new FontLoader().parse(((mod as { default?: unknown }).default ?? mod) as FontData)
  const missingIn = (f: ReturnType<typeof parse>): string[] => {
    const glyphs = (f.data as { glyphs?: Record<string, unknown> }).glyphs ?? {}
    return [...new Set(Array.from(text).filter((ch) => !/\s/.test(ch) && !(ch in glyphs)))]
  }
  let font = parse(fontModule)
  let missing = missingIn(font)
  // UX-AUDIT-18: в helvetiker нет кириллицы и диакритики — строка рисовалась «??????». Если
  // символов не хватает, строка строится запасным шрифтом Droid Sans (Apache 2.0, из three.js:
  // кириллица, латиница, диакритика; ~310 КБ — грузится только при необходимости).
  if (missing.length > 0) {
    const fallback = parse(await import('three/examples/fonts/droid/droid_sans_regular.typeface.json'))
    const missingFallback = missingIn(fallback)
    if (missingFallback.length < missing.length) { font = fallback; missing = missingFallback }
  }
  // UX-AUDIT-18: каждый контур (буква, точка над «ё», …) выдавливается и сваривается ОТДЕЛЬНО,
  // меши склеиваются без общей сварки: у Droid Sans соседние буквы касаются, и общая сварка
  // давала ребро с 4 гранями (не manifold). Отдельные оболочки — допустимы.
  // То же, что `TextGeometry(text, …)` = `ExtrudeGeometry(font.generateShapes(text, size), …)`.
  const vertices: number[] = []
  const indices: number[] = []
  for (const shape of font.generateShapes(text, size)) {
    const geo = new ExtrudeGeometry(shape, { depth, curveSegments: 4, bevelEnabled: false })
    try {
      geo.deleteAttribute('normal')
      geo.deleteAttribute('uv')
      const welded = mergeVertices(geo, TEXT_WELD_TOLERANCE)
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
  if (indices.length === 0) throw new TextMeshError('errors.textNoGlyphs', `no glyphs for "${text}"`)
  return { vertices, indices, missing }
}

/**
 * UX-AUDIT-18: Т-образные стыки. У глифов, где дырка касается внешнего контура (Droid Sans:
 * «Д», «д», «Ф»), крышка триангулирована через точку касания, а боковая стенка — одним
 * ребром мимо неё: открытые рёбра, manifold не строится. Открытое ребро a→b, на котором
 * лежит вершина v (конец другого открытого ребра), делится: треугольник (a, b, c) →
 * (a, v, c) + (v, b, c). Повторяется, пока есть что делить. Замкнутые меши не меняются.
 */
export function repairTJunctions(vertices: ArrayLike<number>, indices: number[], eps = 1e-4): number[] {
  let tris = indices.slice()
  for (let pass = 0; pass < 32; pass++) {
    const edges = new Set<string>()
    for (let i = 0; i < tris.length; i += 3) for (let k = 0; k < 3; k++) edges.add(`${tris[i + k]}>${tris[i + (k + 1) % 3]}`)
    const open: Array<[number, number, number]> = []           // [a, b, индекс треугольника]
    for (let i = 0; i < tris.length; i += 3) {
      for (let k = 0; k < 3; k++) {
        const a = tris[i + k], b = tris[i + (k + 1) % 3]
        if (!edges.has(`${b}>${a}`)) open.push([a, b, i])
      }
    }
    if (open.length === 0) return tris
    const candidates = [...new Set(open.flatMap(([a, b]) => [a, b]))]
    const P = (v: number): [number, number, number] => [vertices[v * 3], vertices[v * 3 + 1], vertices[v * 3 + 2]]
    const splits = new Map<number, { a: number; b: number; v: number }>()   // треугольник → деление
    for (const [a, b, tri] of open) {
      if (splits.has(tri)) continue
      const pa = P(a), pb = P(b)
      const ab = [pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]]
      const len2 = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2
      if (len2 === 0) continue
      let best = -1, bestT = 2
      for (const v of candidates) {
        if (v === a || v === b) continue
        const pv = P(v)
        const t = ((pv[0] - pa[0]) * ab[0] + (pv[1] - pa[1]) * ab[1] + (pv[2] - pa[2]) * ab[2]) / len2
        if (t <= eps || t >= 1 - eps) continue
        const d = [pa[0] + ab[0] * t - pv[0], pa[1] + ab[1] * t - pv[1], pa[2] + ab[2] * t - pv[2]]
        if (d[0] ** 2 + d[1] ** 2 + d[2] ** 2 > eps * eps * len2 + eps * eps) continue
        if (t < bestT) { bestT = t; best = v }
      }
      if (best >= 0) splits.set(tri, { a, b, v: best })
    }
    if (splits.size === 0) return tris                         // делить нечего — как есть
    const next: number[] = []
    for (let i = 0; i < tris.length; i += 3) {
      const sp = splits.get(i)
      if (!sp) { next.push(tris[i], tris[i + 1], tris[i + 2]); continue }
      const t = [tris[i], tris[i + 1], tris[i + 2]]
      const k = t.findIndex((x, j) => x === sp.a && t[(j + 1) % 3] === sp.b)
      const c = t[(k + 2) % 3]
      next.push(sp.a, sp.v, c, sp.v, sp.b, c)
    }
    tris = next
  }
  return tris
}

