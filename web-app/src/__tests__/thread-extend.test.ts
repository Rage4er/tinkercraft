import { beforeAll, describe, expect, it, vi } from 'vitest'
import { buildThread, extractMesh, initWasm, sweepProfileAlongHelix } from '../csg/worker-handlers'
import {
  sanitizeThreadParams, threadDepthOf, threadMinorDiameter, threadNominals, threadPitches, threadSizeOf, threadSizes,
  type ThreadSeries,
} from '../csg/thread-table'
import { threadProfileDepth } from '../csg/thread-table'

beforeAll(async () => {
  vi.stubGlobal('postMessage', vi.fn())
  await initWasm()
})

function builtSize(series: ThreadSeries, id: string, length: number): { size: number[]; vertices: Float32Array } {
  const thread = threadSizeOf(series, id)!
  const manifold = buildThread(thread, length, 'bolt')
  const mesh = extractMesh(manifold)
  manifold.delete()
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < mesh.vertices.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], mesh.vertices[i + k])
      max[k] = Math.max(max[k], mesh.vertices[i + k])
    }
  }
  return { size: max.map((v, k) => v - min[k]), vertices: mesh.vertices }
}

describe('THREAD-EXTEND — таблицы стандартов', () => {
  it('метрическая M0.25…M600, мелкие шаги и расширение выше ISO 261', () => {
    expect(threadSizeOf('metric', 'M0.25')).toMatchObject({ d: 0.25, pitch: 0.075 })
    expect(threadSizeOf('metric', 'M10x1.25')).toMatchObject({ d: 10, pitch: 1.25 })
    expect(threadSizeOf('metric', 'M600')).toMatchObject({ d: 600, pitch: 6, extended: true })
    expect(threadSizes('metric')).toHaveLength(10)
    expect(threadSizes('metric', true).length).toBeGreaterThan(200)
    expect(threadPitches('metric', 'M10', true).map((s) => s.pitch)).toEqual([1.5, 1.25, 1, 0.75])
  })

  it('UNC #1…4 и UNF #0…1½: реальные стандартные границы, TPI без округления', () => {
    expect(threadSizeOf('unf', '#0-80-UNF')!.d).toBeCloseTo(1.524, 12)
    expect(threadSizeOf('unf', '#0-80-UNF')!.pitch).toBeCloseTo(25.4 / 80, 12)
    expect(threadSizeOf('unc', '4-4-UNC')).toMatchObject({ d: 101.6, pitch: 6.35 })
    expect(threadSizeOf('unc', '#0-80-UNF')).toBeUndefined()
    expect(threadSizeOf('unf', '4-4-UNF')).toBeUndefined()
    expect(threadSizeOf('unc', '2-4.5-UNC')!.pitch).toBeCloseTo(25.4 / 4.5, 12)
  })

  it('NPT/BSP 1/8…4 и Square 10…100', () => {
    expect(threadSizeOf('npt', '1/2-14-NPT')).toMatchObject({ d: 21.336, pitch: 25.4 / 14 })
    expect(threadSizeOf('bsp', '1/2-14-BSP')).toMatchObject({ d: 20.955, pitch: 25.4 / 14 })
    expect(threadNominals('npt', true).at(-1)!.id).toBe('4')
    expect(threadNominals('bsp', true).at(-1)!.id).toBe('4')
    expect(threadSizeOf('square', 'SQ10x2')).toMatchObject({ d: 10, pitch: 2, profile: 'square' })
    expect(threadSizeOf('square', 'SQ100x12')).toMatchObject({ d: 100, pitch: 12, profile: 'square' })
    expect(threadMinorDiameter(threadSizeOf('square', 'SQ10x2')!)).toBe(8)
    expect(threadDepthOf(threadSizeOf('square', 'SQ100x12')!)).toBe(6)
    expect(sanitizeThreadParams({ series: 'metric', sizeId: 'M6', length: 20, kind: 'bolt', hand: 'left' })!.hand).toBe('left')
  })
})

describe('THREAD-EXTEND — геометрия WASM', () => {
  it('M0.25 и M600: стержни с табличными диаметрами и длиной', () => {
    expect(builtSize('metric', 'M0.25', 4).size).toEqual([
      expect.closeTo(0.25, 1), expect.closeTo(0.25, 1), expect.closeTo(4, 3),
    ])
    expect(builtSize('metric', 'M600', 12).size).toEqual([
      expect.closeTo(600, 1), expect.closeTo(600, 1), expect.closeTo(12, 3),
    ])
  })

  it('UNC 4″ и UNF #0: стержни с реальными диаметрами', () => {
    expect(builtSize('unc', '4-4-UNC', 12.7).size[0]).toBeCloseTo(101.6, 1)
    expect(builtSize('unf', '#0-80-UNF', 4).size[0]).toBeCloseTo(1.524, 2)
  })

  it('NPT 1/2″ и BSP 1/2″: табличные OD/TPI на текущем профиле', () => {
    expect(builtSize('npt', '1/2-14-NPT', 12).size[0]).toBeCloseTo(21.336, 1)
    expect(builtSize('bsp', '1/2-14-BSP', 12).size[0]).toBeCloseTo(20.955, 1)
  })

  it('Square 10 и 100: прямоугольный виток P/2, замкнутый стержень', () => {
    expect(builtSize('square', 'SQ10x2', 12).size).toEqual([
      expect.closeTo(10, 2), expect.closeTo(10, 2), expect.closeTo(12, 3),
    ])
    expect(builtSize('square', 'SQ100x12', 24).size).toEqual([
      expect.closeTo(100, 1), expect.closeTo(100, 1), expect.closeTo(24, 3),
    ])
  })

  it('левая спираль — точное зеркало правой относительно XZ', () => {
    const profile: Array<[number, number]> = [[0, -0.1], [0, 0.1], [0.5, 0.3], [0.5, -0.3]]
    const right = sweepProfileAlongHelix(5, -2, 2, 2, profile, 24, 'right')
    const left = sweepProfileAlongHelix(5, -2, 2, 2, profile, 24, 'left')
    const a = extractMesh(right), b = extractMesh(left)
    right.delete(); left.delete()
    expect(a.vertices.length).toBe(b.vertices.length)
    const points = (v: Float32Array, mirror: boolean): string[] => {
      const out: string[] = []
      for (let i = 0; i < v.length; i += 3)
        out.push([v[i], mirror ? -v[i + 1] : v[i + 1], v[i + 2]].map((n) => n.toFixed(4)).join(','))
      return out.sort()
    }
    expect(points(b.vertices, false)).toEqual(points(a.vertices, true))
  })

  it('гайка M16: обе фаски 120° прорезаны полнопрофильной ниткой', () => {
    const size = threadSizeOf('metric', 'M16')!
    const nut = buildThread(size, 16, 'nut')
    const mesh = extractMesh(nut)
    nut.delete()
    const v = mesh.vertices
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity
    for (let i = 0; i < v.length; i += 3) {
      minX = Math.min(minX, v[i]); maxX = Math.max(maxX, v[i])
      minY = Math.min(minY, v[i + 1]); maxY = Math.max(maxY, v[i + 1])
      minZ = Math.min(minZ, v[i + 2]); maxZ = Math.max(maxZ, v[i + 2])
    }
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2
    const rMajor = size.d / 2, rMinor = threadMinorDiameter(size) / 2
    const chH = threadProfileDepth(size.pitch) / Math.sqrt(3)
    for (const side of [-1, 1]) {
      const innerZ = (side < 0 ? minZ : maxZ) - side * chH
      let coneSurface = 0, fullDepthGroove = 0
      for (let i = 0; i < v.length; i += 3) {
        const fromInner = side * (v[i + 2] - innerZ)
        const r = Math.hypot(v[i] - cx, v[i + 1] - cy)
        if (fromInner <= 1e-4 || fromInner >= chH - 1e-4 || r > rMajor + 0.01) continue
        if (Math.abs(r - (rMinor + fromInner * Math.sqrt(3))) < 0.01) coneSurface++
        if (Math.abs(r - rMajor) < 0.01) fullDepthGroove++
      }
      expect(coneSurface).toBeGreaterThan(0)
      expect(fullDepthGroove).toBeGreaterThan(0)
    }
  })
})
