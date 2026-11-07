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
  const [{ FontLoader }, { TextGeometry }, { mergeVertices }, fontModule] = await Promise.all([
    import('three/examples/jsm/loaders/FontLoader.js'),
    import('three/examples/jsm/geometries/TextGeometry.js'),
    import('three/examples/jsm/utils/BufferGeometryUtils.js'),
    import('three/examples/fonts/helvetiker_regular.typeface.json'),
  ])
  type FontData = Parameters<InstanceType<typeof FontLoader>['parse']>[0]
  const fontJson = ((fontModule as { default?: unknown }).default ?? fontModule) as FontData
  const font = new FontLoader().parse(fontJson)
  const geo = new TextGeometry(text, { font, size, depth, curveSegments: 4, bevelEnabled: false })
  try {
    geo.deleteAttribute('normal')
    geo.deleteAttribute('uv')
    const welded = mergeVertices(geo, TEXT_WELD_TOLERANCE)
    try {
      const pos = welded.attributes.position
      const vertices = Array.from(pos.array as ArrayLike<number>)
      const src = welded.index ? Array.from(welded.index.array as ArrayLike<number>) : Array.from({ length: pos.count }, (_, i) => i)
      const indices: number[] = []
      for (let i = 0; i + 2 < src.length; i += 3) {
        const a = src[i], b = src[i + 1], c = src[i + 2]
        if (a !== b && b !== c && a !== c) indices.push(a, b, c)   // вырожденные (после сварки) — прочь
      }
      if (indices.length === 0) throw new TextMeshError('errors.textNoGlyphs', `no glyphs for "${text}"`)
      return { vertices, indices }
    } finally {
      welded.dispose()
    }
  } finally {
    geo.dispose()
  }
}
