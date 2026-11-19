// ============================================================
// thread-table — THREAD-GENERATOR: параметры стандартных резьб
// ============================================================
//
// Метрическая (ISO 261, грубый шаг): M3…M24. Дюймовая: UNC и UNF 1/4"…3/4"
// (диаметр и шаг в мм: 1 дюйм = 25,4 мм, шаг = 25,4 / TPI без округления).
// Базовый профиль ISO 68-1 / Unified: угол 60°, фундаментальная высота
// H = (√3/2)·P, рабочая глубина 5H/8, плоский гребень P/8 и впадина P/4.
// Это базовый профиль без скругления дна и без полей допусков.
// Ключ размера — `id` (стабилен, в истории/тестах): 'M6', '1/4-20-UNC'…

export type ThreadSeries = 'metric' | 'imperial'
export type ThreadKind = 'bolt' | 'nut'

export interface ThreadSize {
  /** Стабильный ключ: 'M6', '1/4-20-UNC', '1/2-20-UNF' */
  id: string
  /** Подпись в UI: 'M6 × 1' / '1/4"-20 UNC × 1.27' */
  label: string
  /** Номинальный наружный диаметр, мм */
  d: number
  /** Шаг, мм */
  pitch: number
  /** Размер гайки под ключ (ширина по граням), мм: метрические — DIN EN ISO 4032 / DIN 934-1, дюймовые — ANSI B18.2.2 */
  flats: number
}

const mm = (inch: number) => inch * 25.4
const tpi = (v: number) => 25.4 / v
const r2 = (v: number) => Math.round(v * 100) / 100

// DIN EN ISO 4032 / DIN 934-1 (ключи, мм): M3=5.5, M4=7, M5=8, M6=10, M8=13,
// M10=16, M12=18, M16=24, M20=30, M24=36.
export const METRIC_THREADS: readonly ThreadSize[] = [
  { id: 'M3', label: 'M3 × 0.5', d: 3, pitch: 0.5, flats: 5.5 },
  { id: 'M4', label: 'M4 × 0.7', d: 4, pitch: 0.7, flats: 7 },
  { id: 'M5', label: 'M5 × 0.8', d: 5, pitch: 0.8, flats: 8 },
  { id: 'M6', label: 'M6 × 1', d: 6, pitch: 1.0, flats: 10 },
  { id: 'M8', label: 'M8 × 1.25', d: 8, pitch: 1.25, flats: 13 },
  { id: 'M10', label: 'M10 × 1.5', d: 10, pitch: 1.5, flats: 16 },
  { id: 'M12', label: 'M12 × 1.75', d: 12, pitch: 1.75, flats: 18 },
  { id: 'M16', label: 'M16 × 2', d: 16, pitch: 2.0, flats: 24 },
  { id: 'M20', label: 'M20 × 2.5', d: 20, pitch: 2.5, flats: 30 },
  { id: 'M24', label: 'M24 × 3', d: 24, pitch: 3.0, flats: 36 },
]

// ANSI B18.2.2 (finished hex nuts), ключи в мм: 1/4=7/16", 5/16=1/2", 3/8=9/16",
// 1/2=3/4", 5/8=15/16", 3/4=1-1/8".
export const IMPERIAL_THREADS: readonly ThreadSize[] = [
  // UNC — грубый шаг
  { id: '1/4-20-UNC', label: '1/4"-20 UNC × 1.27', d: r2(mm(1 / 4)), pitch: tpi(20), flats: r2(mm(7 / 16)) },
  { id: '5/16-18-UNC', label: '5/16"-18 UNC × 1.41', d: r2(mm(5 / 16)), pitch: tpi(18), flats: r2(mm(1 / 2)) },
  { id: '3/8-16-UNC', label: '3/8"-16 UNC × 1.59', d: r2(mm(3 / 8)), pitch: tpi(16), flats: r2(mm(9 / 16)) },
  { id: '1/2-13-UNC', label: '1/2"-13 UNC × 1.95', d: r2(mm(1 / 2)), pitch: tpi(13), flats: r2(mm(3 / 4)) },
  { id: '5/8-11-UNC', label: '5/8"-11 UNC × 2.31', d: r2(mm(5 / 8)), pitch: tpi(11), flats: r2(mm(15 / 16)) },
  { id: '3/4-10-UNC', label: '3/4"-10 UNC × 2.54', d: r2(mm(3 / 4)), pitch: tpi(10), flats: r2(mm(9 / 8)) },
  // UNF — мелкий шаг
  { id: '1/4-28-UNF', label: '1/4"-28 UNF × 0.91', d: r2(mm(1 / 4)), pitch: tpi(28), flats: r2(mm(7 / 16)) },
  { id: '5/16-24-UNF', label: '5/16"-24 UNF × 1.06', d: r2(mm(5 / 16)), pitch: tpi(24), flats: r2(mm(1 / 2)) },
  { id: '3/8-24-UNF', label: '3/8"-24 UNF × 1.06', d: r2(mm(3 / 8)), pitch: tpi(24), flats: r2(mm(9 / 16)) },
  { id: '1/2-20-UNF', label: '1/2"-20 UNF × 1.27', d: r2(mm(1 / 2)), pitch: tpi(20), flats: r2(mm(3 / 4)) },
  { id: '5/8-18-UNF', label: '5/8"-18 UNF × 1.41', d: r2(mm(5 / 8)), pitch: tpi(18), flats: r2(mm(15 / 16)) },
  { id: '3/4-16-UNF', label: '3/4"-16 UNF × 1.59', d: r2(mm(3 / 4)), pitch: tpi(16), flats: r2(mm(9 / 8)) },
]

export function threadSizes(series: ThreadSeries): readonly ThreadSize[] {
  return series === 'metric' ? METRIC_THREADS : IMPERIAL_THREADS
}

export function threadSizeOf(series: ThreadSeries, id: string): ThreadSize | undefined {
  return threadSizes(series).find((s) => s.id === id)
}

/** Фундаментальная высота острого 60° треугольника: H = (√3/2)·P. */
export function threadFundamentalHeight(pitch: number): number {
  return (Math.sqrt(3) / 2) * pitch
}

/** Рабочая глубина базового профиля ISO 68-1 / Unified: 5H/8 = 0,541266·P. */
export function threadProfileDepth(pitch: number): number {
  return (5 / 8) * threadFundamentalHeight(pitch)
}

/** Базовый минорный диаметр наружной/внутренней резьбы: d1 = D1 = d − 2·(5H/8). */
export function threadMinorDiameter(size: ThreadSize): number {
  return size.d - 2 * threadProfileDepth(size.pitch)
}

/** Размер гайки под ключ (ширина по граням, мм) — из таблицы размера (DIN EN ISO 4032 / DIN 934-1, ANSI B18.2.2). */
export function nutAcrossFlats(size: ThreadSize): number {
  return size.flats
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
