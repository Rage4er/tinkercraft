// ============================================================
// thread-table — THREAD-GENERATOR: параметры стандартных резьб
// ============================================================
//
// Метрическая (ISO, грубый шаг): M3…M24. Дюймовая: UNC и UNF 1/4"…3/4"
// (диаметр и шаг приведены к мм: 1 дюйм = 25,4 мм, шаг = 25,4 / TPI).
// Профиль обеих — 60°; различие только в диаметре и шаге. Глубина профиля
// (высота витка над цилиндром/дном отверстия) — 0,5413 · шаг (5/8 H), как у
// базового профиля ISO/Unified; это упрощение (без скруглений гребня/дна).
// Ключ размера — `id` (стабилен, в истории/тестах): 'M6', '1/4-20-UNC'…

export type ThreadSeries = 'metric' | 'imperial'
export type ThreadKind = 'bolt' | 'nut'

export interface ThreadSize {
  /** Стабильный ключ: 'M6', '1/4-20-UNC', '1/2-20-UNF' */
  id: string
  /** Подпись в UI: 'M6 (шаг 1,0)' / '1/4"-20 UNC (⌀6,35)' */
  label: string
  /** Номинальный наружный диаметр, мм */
  d: number
  /** Шаг, мм */
  pitch: number
}

const mm = (inch: number) => inch * 25.4
const tpi = (v: number) => 25.4 / v
const r2 = (v: number) => Math.round(v * 100) / 100

export const METRIC_THREADS: readonly ThreadSize[] = [
  { id: 'M3', label: 'M3 × 0.5', d: 3, pitch: 0.5 },
  { id: 'M4', label: 'M4 × 0.7', d: 4, pitch: 0.7 },
  { id: 'M5', label: 'M5 × 0.8', d: 5, pitch: 0.8 },
  { id: 'M6', label: 'M6 × 1', d: 6, pitch: 1.0 },
  { id: 'M8', label: 'M8 × 1.25', d: 8, pitch: 1.25 },
  { id: 'M10', label: 'M10 × 1.5', d: 10, pitch: 1.5 },
  { id: 'M12', label: 'M12 × 1.75', d: 12, pitch: 1.75 },
  { id: 'M16', label: 'M16 × 2', d: 16, pitch: 2.0 },
  { id: 'M20', label: 'M20 × 2.5', d: 20, pitch: 2.5 },
  { id: 'M24', label: 'M24 × 3', d: 24, pitch: 3.0 },
]

export const IMPERIAL_THREADS: readonly ThreadSize[] = [
  // UNC — грубый шаг
  { id: '1/4-20-UNC', label: '1/4"-20 UNC × 1.27', d: r2(mm(1 / 4)), pitch: r2(tpi(20)) },
  { id: '5/16-18-UNC', label: '5/16"-18 UNC × 1.41', d: r2(mm(5 / 16)), pitch: r2(tpi(18)) },
  { id: '3/8-16-UNC', label: '3/8"-16 UNC × 1.59', d: r2(mm(3 / 8)), pitch: r2(tpi(16)) },
  { id: '1/2-13-UNC', label: '1/2"-13 UNC × 1.95', d: r2(mm(1 / 2)), pitch: r2(tpi(13)) },
  { id: '5/8-11-UNC', label: '5/8"-11 UNC × 2.31', d: r2(mm(5 / 8)), pitch: r2(tpi(11)) },
  { id: '3/4-10-UNC', label: '3/4"-10 UNC × 2.54', d: r2(mm(3 / 4)), pitch: r2(tpi(10)) },
  // UNF — мелкий шаг
  { id: '1/4-28-UNF', label: '1/4"-28 UNF × 0.91', d: r2(mm(1 / 4)), pitch: r2(tpi(28)) },
  { id: '5/16-24-UNF', label: '5/16"-24 UNF × 1.06', d: r2(mm(5 / 16)), pitch: r2(tpi(24)) },
  { id: '3/8-24-UNF', label: '3/8"-24 UNF × 1.06', d: r2(mm(3 / 8)), pitch: r2(tpi(24)) },
  { id: '1/2-20-UNF', label: '1/2"-20 UNF × 1.27', d: r2(mm(1 / 2)), pitch: r2(tpi(20)) },
  { id: '5/8-18-UNF', label: '5/8"-18 UNF × 1.41', d: r2(mm(5 / 8)), pitch: r2(tpi(18)) },
  { id: '3/4-16-UNF', label: '3/4"-16 UNF × 1.59', d: r2(mm(3 / 4)), pitch: r2(tpi(16)) },
]

export function threadSizes(series: ThreadSeries): readonly ThreadSize[] {
  return series === 'metric' ? METRIC_THREADS : IMPERIAL_THREADS
}

export function threadSizeOf(series: ThreadSeries, id: string): ThreadSize | undefined {
  return threadSizes(series).find((s) => s.id === id)
}

/** Высота профиля витка (радиальная): 5/8 H = 0,5413 · шаг (базовый профиль ISO/Unified). */
export function threadProfileDepth(pitch: number): number {
  return 0.5413 * pitch
}

/** Размер гайки по ключу (ширина под ключ, мм): стандартные значения DIN 934 для метрических; для дюймовых — по d. */
export function nutAcrossFlats(d: number): number {
  // DIN 934: M3=5.5, M4=7, M5=8, M6=10, M8=13, M10=17 (старый)/16, M12=19, M16=24, M20=30, M24=36
  const table: Array<[number, number]> = [
    [3, 5.5], [4, 7], [5, 8], [6, 10], [8, 13], [10, 16], [12, 19], [16, 24], [20, 30], [24, 36],
  ]
  for (const [d0, s] of table) if (Math.abs(d - d0) < 0.26) return s
  return Math.round(d * 1.5 * 2) / 2   // прочие — ≈ 1,5 d, округление до 0,5
}

export const THREAD_LENGTH_MIN = 4
export const THREAD_LENGTH_MAX = 120

/** Проверка и нормализация параметров; null — невалидно (размер не из таблицы / длина вне пределов). */
export function sanitizeThreadParams(input: {
  series: string
  sizeId: string
  length: number
  kind: string
}): { series: ThreadSeries; sizeId: string; length: number; kind: ThreadKind } | null {
  const series: ThreadSeries = input.series === 'imperial' ? 'imperial' : 'metric'
  const kind: ThreadKind = input.kind === 'nut' ? 'nut' : 'bolt'
  const size = threadSizeOf(series, input.sizeId)
  const length = Number(input.length)
  if (!size || !Number.isFinite(length)) return null
  const len = Math.min(THREAD_LENGTH_MAX, Math.max(THREAD_LENGTH_MIN, Math.round(length * 10) / 10))
  return { series, sizeId: size.id, length: len, kind }
}
