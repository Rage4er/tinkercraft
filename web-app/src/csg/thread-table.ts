// ============================================================
// thread-table — THREAD-GENERATOR / THREAD-EXTEND: параметры резьб
// ============================================================
// Базовый профиль ISO 68-1 / Unified: 60°, H = (√3/2)·P, рабочая
// глубина 5H/8. Square: прямоугольный профиль, глубина и ширина P/2.
// Дюймовые шаги не округляются: P = 25,4 / TPI. Старые id и популярные
// массивы METRIC_THREADS / IMPERIAL_THREADS сохранены для совместимости.

export type ThreadSeries = 'metric' | 'imperial' | 'unc' | 'unf' | 'npt' | 'bsp' | 'square'
export type ThreadKind = 'bolt' | 'nut'
export type ThreadHand = 'right' | 'left'
export type ThreadProfile = 'tri60' | 'square'

/** Число заходов многозаходной резьбы. */
export const THREAD_STARTS = [1, 2, 3, 4, 6] as const

/** Полные параметры резьбы — операция `thread` и правка её шага (THREAD-PARAMETRIC). */
export interface ThreadParams {
  series: ThreadSeries
  sizeId: string
  length: number
  kind: ThreadKind
  hand: ThreadHand
  starts: number
}

export interface ThreadSize {
  id: string
  label: string
  d: number
  pitch: number
  flats: number
  nominal?: string
  popular?: boolean
  tpi?: number
  profile?: ThreadProfile
  /** Выше диапазона таблицы ISO 261: базовый профиль ISO 68-1, P = 6 мм. */
  extended?: boolean
}

export interface ThreadNominal {
  id: string
  label: string
}

const mm = (inch: number) => inch * 25.4
const tpi = (v: number) => 25.4 / v
const r2 = (v: number) => Math.round(v * 100) / 100
const num = (v: number) => String(v)

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

export const IMPERIAL_THREADS: readonly ThreadSize[] = [
  { id: '1/4-20-UNC', label: '1/4"-20 UNC × 1.27', d: r2(mm(1 / 4)), pitch: tpi(20), flats: r2(mm(7 / 16)) },
  { id: '5/16-18-UNC', label: '5/16"-18 UNC × 1.41', d: r2(mm(5 / 16)), pitch: tpi(18), flats: r2(mm(1 / 2)) },
  { id: '3/8-16-UNC', label: '3/8"-16 UNC × 1.59', d: r2(mm(3 / 8)), pitch: tpi(16), flats: r2(mm(9 / 16)) },
  { id: '1/2-13-UNC', label: '1/2"-13 UNC × 1.95', d: r2(mm(1 / 2)), pitch: tpi(13), flats: r2(mm(3 / 4)) },
  { id: '5/8-11-UNC', label: '5/8"-11 UNC × 2.31', d: r2(mm(5 / 8)), pitch: tpi(11), flats: r2(mm(15 / 16)) },
  { id: '3/4-10-UNC', label: '3/4"-10 UNC × 2.54', d: r2(mm(3 / 4)), pitch: tpi(10), flats: r2(mm(9 / 8)) },
  { id: '1/4-28-UNF', label: '1/4"-28 UNF × 0.91', d: r2(mm(1 / 4)), pitch: tpi(28), flats: r2(mm(7 / 16)) },
  { id: '5/16-24-UNF', label: '5/16"-24 UNF × 1.06', d: r2(mm(5 / 16)), pitch: tpi(24), flats: r2(mm(1 / 2)) },
  { id: '3/8-24-UNF', label: '3/8"-24 UNF × 1.06', d: r2(mm(3 / 8)), pitch: tpi(24), flats: r2(mm(9 / 16)) },
  { id: '1/2-20-UNF', label: '1/2"-20 UNF × 1.27', d: r2(mm(1 / 2)), pitch: tpi(20), flats: r2(mm(3 / 4)) },
  { id: '5/8-18-UNF', label: '5/8"-18 UNF × 1.41', d: r2(mm(5 / 8)), pitch: tpi(18), flats: r2(mm(15 / 16)) },
  { id: '3/4-16-UNF', label: '3/4"-16 UNF × 1.59', d: r2(mm(3 / 4)), pitch: tpi(16), flats: r2(mm(9 / 8)) },
]

const METRIC_POPULAR = new Set(METRIC_THREADS.map((s) => s.id))
const METRIC_LEGACY = new Map(METRIC_THREADS.map((s) => [s.id, s]))
const IMPERIAL_LEGACY = new Map(IMPERIAL_THREADS.map((s) => [s.id, s]))

// ISO/R 1501 для M0.25…M0.9; ISO 261 для M1…M300.
// Строка: диаметр, основной шаг, мелкие шаги. Для M310…M600 ниже —
// расширение диапазона базового профиля (P = 6), а не строка ISO 261.
const METRIC_ROWS: ReadonlyArray<readonly [number, number, readonly number[]]> = [
  [0.25, 0.075, []], [0.3, 0.08, []], [0.35, 0.09, []], [0.4, 0.1, []],
  [0.45, 0.1, []], [0.5, 0.125, []], [0.55, 0.125, []], [0.6, 0.15, []],
  [0.7, 0.175, []], [0.8, 0.2, []], [0.9, 0.225, []],
  [1, 0.25, [0.2]], [1.1, 0.25, [0.2]], [1.2, 0.25, [0.2]], [1.4, 0.3, [0.2]],
  [1.6, 0.35, [0.2]], [1.8, 0.35, [0.2]], [2, 0.4, [0.25]], [2.2, 0.45, [0.25]],
  [2.5, 0.45, [0.35]], [3, 0.5, [0.35]], [3.5, 0.6, [0.35]], [4, 0.7, [0.5]],
  [4.5, 0.75, [0.5]], [5, 0.8, [0.5]], [5.5, 0.5, []], [6, 1, [0.75, 0.5]],
  [7, 1, [0.75]], [8, 1.25, [1, 0.75]], [9, 1.25, [1, 0.75]],
  [10, 1.5, [1.25, 1, 0.75]], [11, 1.5, [1, 0.75]], [12, 1.75, [1.5, 1.25, 1, 0.75]],
  [14, 2, [1.5, 1.25, 1]], [15, 1.5, [1]], [16, 2, [1.5, 1]], [17, 1.5, [1]],
  [18, 2.5, [2, 1.5, 1]], [20, 2.5, [2, 1.5, 1]], [22, 2.5, [2, 1.5, 1]],
  [24, 3, [2, 1.5, 1]], [25, 2, [1.5, 1]], [26, 1.5, []], [27, 3, [2, 1.5, 1]],
  [28, 2, [1.5, 1]], [30, 3.5, [3, 2, 1.5, 1]], [32, 2, [1.5]],
  [33, 3.5, [3, 2, 1.5, 1]], [35, 1.5, []], [36, 4, [3, 2, 1.5]], [38, 1.5, []],
  [39, 4, [3, 2, 1.5]], [40, 3, [2, 1.5]], [42, 4.5, [4, 3, 2, 1.5]],
  [45, 4.5, [4, 3, 2, 1.5]], [48, 5, [4, 3, 2, 1.5]], [50, 3, [2, 1.5]],
  [52, 5, [4, 3, 2, 1.5]], [55, 4, [3, 2, 1.5]], [56, 5.5, [4, 3, 2, 1.5]],
  [58, 4, [3, 2, 1.5]], [60, 5.5, [4, 3, 2, 1.5]], [62, 4, [3, 2, 1.5]],
  [64, 6, [4, 3, 2, 1.5]], [65, 4, [3, 2, 1.5]], [68, 6, [4, 3, 2, 1.5]],
  [70, 6, [4, 3, 2, 1.5]], [72, 6, [4, 3, 2, 1.5]], [75, 4, [3, 2, 1.5]],
  [76, 6, [4, 3, 2, 1.5]], [78, 2, [1.5]], [80, 6, [4, 3, 2, 1.5]], [82, 2, [1.5]],
  [85, 6, [4, 3, 2]], [90, 6, [4, 3, 2]], [95, 6, [4, 3, 2]], [100, 6, [4, 3, 2]],
  [105, 6, [4, 3, 2]], [110, 6, [4, 3, 2]], [115, 6, [4, 3, 2]], [120, 6, [4, 3, 2]],
  [125, 8, [6, 4, 3, 2]], [130, 8, [6, 4, 3, 2]], [135, 6, [4, 3, 2]],
  [140, 8, [6, 4, 3, 2]], [145, 6, [4, 3, 2]], [150, 8, [6, 4, 3, 2]],
  [155, 6, [4, 3, 2]], [160, 8, [6, 4, 3]], [165, 6, [4, 3]], [170, 8, [6, 4, 3]],
  [175, 6, [4, 3]], [180, 8, [6, 4, 3]], [185, 6, [4, 3]], [190, 8, [6, 4, 3]],
  [195, 6, [4, 3]], [200, 8, [6, 4, 3]], [205, 6, [4, 3]], [210, 8, [6, 4, 3]],
  [215, 6, [4, 3]], [220, 8, [6, 4, 3]], [225, 8, [6, 4, 3]], [230, 6, [4, 3]],
  [235, 6, [4, 3]], [240, 8, [6, 4, 3]], [245, 6, [4, 3]], [250, 8, [6, 4, 3]],
  [255, 6, [4, 3]], [260, 8, [6, 4, 3]], [265, 8, [6, 4]], [270, 8, [6, 4]],
  [275, 6, [4]], [280, 8, [6, 4]], [285, 8, [6, 4]], [290, 6, [4]], [295, 6, [4]], [300, 8, [6, 4]],
]

const METRIC_FLATS: Record<number, number> = {
  1: 2.5, 1.2: 3, 1.4: 3.2, 1.6: 3.2, 2: 4, 2.5: 5, 3: 5.5, 4: 7, 5: 8,
  6: 10, 8: 13, 10: 16, 12: 18, 14: 22, 16: 24, 18: 27, 20: 30, 22: 34, 24: 36,
  27: 41, 30: 46, 33: 50, 36: 55, 39: 60, 42: 65, 45: 70, 48: 75, 52: 80, 56: 85, 60: 90, 64: 95,
}

function metricSize(d: number, pitch: number, extended = false): ThreadSize {
  const nominal = `M${num(d)}`
  const coarseId = nominal
  const legacy = METRIC_LEGACY.get(coarseId)
  if (legacy && legacy.pitch === pitch) return { ...legacy, nominal, popular: true }
  const id = pitch === METRIC_ROWS.find((r) => r[0] === d)?.[1] || extended ? coarseId : `${nominal}x${num(pitch)}`
  return {
    id, label: `${nominal} × ${num(pitch)}`, d, pitch, nominal,
    flats: METRIC_FLATS[d] ?? Math.max(d * 1.5, d + 2 * threadProfileDepth(pitch) + 1),
    popular: METRIC_POPULAR.has(id), extended,
  }
}

const METRIC_ALL: readonly ThreadSize[] = [
  ...METRIC_ROWS.flatMap(([d, coarse, fine]) => [metricSize(d, coarse), ...fine.map((p) => metricSize(d, p))]),
  ...Array.from({ length: 30 }, (_, i) => metricSize(310 + i * 10, 6, true)),
]

const INCH_DIAMETERS: Record<string, number> = {
  '#0': 0.060, '#1': 0.073, '#2': 0.086, '#3': 0.099, '#4': 0.112, '#5': 0.125,
  '#6': 0.138, '#8': 0.164, '#10': 0.190, '#12': 0.216,
  '1/4': 1 / 4, '5/16': 5 / 16, '3/8': 3 / 8, '7/16': 7 / 16, '1/2': 1 / 2,
  '9/16': 9 / 16, '5/8': 5 / 8, '3/4': 3 / 4, '7/8': 7 / 8, '1': 1,
  '1-1/8': 1.125, '1-1/4': 1.25, '1-3/8': 1.375, '1-1/2': 1.5, '1-3/4': 1.75,
  '2': 2, '2-1/4': 2.25, '2-1/2': 2.5, '2-3/4': 2.75, '3': 3,
  '3-1/4': 3.25, '3-1/2': 3.5, '3-3/4': 3.75, '4': 4,
}

const UNC_ROWS: ReadonlyArray<readonly [string, number]> = [
  ['#1', 64], ['#2', 56], ['#3', 48], ['#4', 40], ['#5', 40], ['#6', 32], ['#8', 32],
  ['#10', 24], ['#12', 24], ['1/4', 20], ['5/16', 18], ['3/8', 16], ['7/16', 14],
  ['1/2', 13], ['9/16', 12], ['5/8', 11], ['3/4', 10], ['7/8', 9], ['1', 8],
  ['1-1/8', 7], ['1-1/4', 7], ['1-3/8', 6], ['1-1/2', 6], ['1-3/4', 5],
  ['2', 4.5], ['2-1/4', 4.5], ['2-1/2', 4], ['2-3/4', 4], ['3', 4],
  ['3-1/4', 4], ['3-1/2', 4], ['3-3/4', 4], ['4', 4],
]
const UNF_ROWS: ReadonlyArray<readonly [string, number]> = [
  ['#0', 80], ['#1', 72], ['#2', 64], ['#3', 56], ['#4', 48], ['#5', 44], ['#6', 40],
  ['#8', 36], ['#10', 32], ['#12', 28], ['1/4', 28], ['5/16', 24], ['3/8', 24],
  ['7/16', 20], ['1/2', 20], ['9/16', 18], ['5/8', 18], ['3/4', 16], ['7/8', 14],
  ['1', 12], ['1-1/8', 12], ['1-1/4', 12], ['1-3/8', 12], ['1-1/2', 12],
]
const UNIFIED_POPULAR = new Set(['1/4', '5/16', '3/8', '7/16', '1/2', '9/16', '5/8', '3/4', '7/8', '1'])
const UNIFIED_FLATS: Record<string, number> = {
  '1/4': 7 / 16, '5/16': 1 / 2, '3/8': 9 / 16, '7/16': 11 / 16, '1/2': 3 / 4,
  '9/16': 7 / 8, '5/8': 15 / 16, '3/4': 9 / 8, '7/8': 21 / 16, '1': 1.5,
}

function unifiedSize(nominal: string, turns: number, series: 'UNC' | 'UNF'): ThreadSize {
  const id = `${nominal}-${turns}-${series}`
  const legacy = IMPERIAL_LEGACY.get(id)
  const popular = UNIFIED_POPULAR.has(nominal)
  if (legacy) return { ...legacy, nominal, popular, tpi: turns }
  const d = mm(INCH_DIAMETERS[nominal])
  return {
    id, label: `${nominal}"-${turns} ${series} × ${r2(tpi(turns))}`,
    d, pitch: tpi(turns), nominal, popular, tpi: turns,
    flats: UNIFIED_FLATS[nominal] ? r2(mm(UNIFIED_FLATS[nominal])) : Math.max(d * 1.5, d + 2 * threadProfileDepth(tpi(turns)) + 1),
  }
}
const UNC_ALL = UNC_ROWS.map(([d, p]) => unifiedSize(d, p, 'UNC'))
const UNF_ALL = UNF_ROWS.map(([d, p]) => unifiedSize(d, p, 'UNF'))
const IMPERIAL_ALL = [...UNC_ALL, ...UNF_ALL]

const PIPE_ROWS: Record<'npt' | 'bsp', ReadonlyArray<readonly [string, number, number]>> = {
  npt: [
    ['1/8', 0.405, 27], ['1/4', 0.540, 18], ['3/8', 0.675, 18], ['1/2', 0.840, 14],
    ['3/4', 1.050, 14], ['1', 1.315, 11.5], ['1-1/4', 1.660, 11.5], ['1-1/2', 1.900, 11.5],
    ['2', 2.375, 11.5], ['2-1/2', 2.875, 8], ['3', 3.5, 8], ['3-1/2', 4, 8], ['4', 4.5, 8],
  ],
  bsp: [
    ['1/8', 9.728 / 25.4, 28], ['1/4', 13.157 / 25.4, 19], ['3/8', 16.662 / 25.4, 19],
    ['1/2', 20.955 / 25.4, 14], ['3/4', 26.441 / 25.4, 14], ['1', 33.249 / 25.4, 11],
    ['1-1/4', 41.910 / 25.4, 11], ['1-1/2', 47.803 / 25.4, 11], ['2', 59.614 / 25.4, 11],
    ['2-1/2', 75.184 / 25.4, 11], ['3', 87.884 / 25.4, 11], ['4', 113.030 / 25.4, 11],
  ],
}
const PIPE_POPULAR = new Set(['1/4', '3/8', '1/2', '3/4', '1'])
function pipeSizes(series: 'npt' | 'bsp'): ThreadSize[] {
  return PIPE_ROWS[series].map(([nominal, diameter, turns]) => {
    const d = series === 'npt' ? mm(diameter) : diameter * 25.4
    return {
      id: `${nominal}-${turns}-${series.toUpperCase()}`, label: `${nominal}"-${turns} ${series.toUpperCase()} × ${r2(tpi(turns))}`,
      d, pitch: tpi(turns), flats: Math.max(d * 1.5, d + 2 * threadProfileDepth(tpi(turns)) + 1),
      nominal, popular: PIPE_POPULAR.has(nominal), tpi: turns,
    }
  })
}
const NPT_ALL = pipeSizes('npt')
const BSP_ALL = pipeSizes('bsp')

const SQUARE_ROWS: ReadonlyArray<readonly [number, number]> = [
  [10, 2], [12, 3], [16, 4], [20, 5], [25, 5], [32, 6], [40, 8], [50, 8], [63, 10], [80, 10], [100, 12],
]
const SQUARE_ALL = SQUARE_ROWS.map(([d, pitch]) => ({
  id: `SQ${d}x${pitch}`, label: `SQ${d} × ${pitch}`, d, pitch,
  flats: Math.max(d * 1.5, d + pitch + 2), nominal: `SQ${d}`, popular: true, profile: 'square' as const,
}))

function popularOnly(sizes: readonly ThreadSize[]): readonly ThreadSize[] {
  return sizes.filter((s) => s.popular)
}

export function threadSizes(series: ThreadSeries, all = false): readonly ThreadSize[] {
  const sizes = series === 'metric' ? METRIC_ALL
    : series === 'imperial' ? IMPERIAL_ALL
      : series === 'unc' ? UNC_ALL
        : series === 'unf' ? UNF_ALL
          : series === 'npt' ? NPT_ALL
            : series === 'bsp' ? BSP_ALL : SQUARE_ALL
  return all ? sizes : popularOnly(sizes)
}

export function threadSizeOf(series: ThreadSeries, id: string): ThreadSize | undefined {
  return threadSizes(series, true).find((s) => s.id === id)
}

export function threadNominals(series: ThreadSeries, all = false): readonly ThreadNominal[] {
  const seen = new Set<string>()
  const out: ThreadNominal[] = []
  for (const size of threadSizes(series, all)) {
    const nominal = size.nominal ?? size.id
    if (seen.has(nominal)) continue
    seen.add(nominal)
    out.push({ id: nominal, label: series === 'square' || series === 'metric' ? nominal : `${nominal}"` })
  }
  return out
}

export function threadPitches(series: ThreadSeries, nominal: string, all = false): readonly ThreadSize[] {
  return threadSizes(series, all).filter((s) => (s.nominal ?? s.id) === nominal)
}

export function threadFundamentalHeight(pitch: number): number {
  return (Math.sqrt(3) / 2) * pitch
}

export function threadProfileDepth(pitch: number): number {
  return (5 / 8) * threadFundamentalHeight(pitch)
}

export function threadDepthOf(size: ThreadSize): number {
  return size.profile === 'square' ? size.pitch / 2 : threadProfileDepth(size.pitch)
}

export function threadMinorDiameter(size: ThreadSize): number {
  return size.d - 2 * threadDepthOf(size)
}

export function nutAcrossFlats(size: ThreadSize): number {
  return size.flats
}

export const THREAD_LENGTH_MIN = 4
export const THREAD_LENGTH_MAX = 120

export function sanitizeThreadParams(input: {
  series: string
  sizeId: string
  length: number
  kind: string
  hand?: string
  starts?: number
}): { series: ThreadSeries; sizeId: string; length: number; kind: ThreadKind; hand?: ThreadHand; starts?: number } | null {
  const allowed: readonly ThreadSeries[] = ['metric', 'imperial', 'unc', 'unf', 'npt', 'bsp', 'square']
  const series: ThreadSeries = allowed.includes(input.series as ThreadSeries) ? input.series as ThreadSeries : 'metric'
  const kind: ThreadKind = input.kind === 'nut' ? 'nut' : 'bolt'
  const size = threadSizeOf(series, input.sizeId)
  const length = Number(input.length)
  if (!size || !Number.isFinite(length)) return null
  const len = Math.min(THREAD_LENGTH_MAX, Math.max(THREAD_LENGTH_MIN, Math.round(length * 10) / 10))
  const hand: ThreadHand | undefined = input.hand === undefined ? undefined : input.hand === 'left' ? 'left' : 'right'
  const starts = input.starts === undefined ? undefined : Number(input.starts)
  if (starts !== undefined && !(THREAD_STARTS as readonly number[]).includes(starts)) return null
  return { series, sizeId: size.id, length: len, kind, ...(hand ? { hand } : {}), ...(starts !== undefined ? { starts } : {}) }
}

/** Полное нормализованное представление параметров резьбы (операция `thread`). */
export function normalizeThreadParams(input: unknown): ThreadParams | null {
  const p = sanitizeThreadParams(input as {
    series: string; sizeId: string; length: number; kind: string; hand?: string; starts?: number
  })
  if (!p) return null
  return { ...p, hand: p.hand ?? 'right', starts: p.starts ?? 1 }
}

/** Строка размера для имени объекта/операции: суффикс LH у левой резьбы. */
export function threadSizeDisplay(params: Pick<ThreadParams, 'series' | 'sizeId' | 'hand'>): string {
  const size = threadSizeOf(params.series, params.sizeId)
  const base = (size?.id ?? params.sizeId).replace(/-UNC$/, ' UNC').replace(/-UNF$/, ' UNF')
  return params.hand === 'left' ? `${base} LH` : base
}
