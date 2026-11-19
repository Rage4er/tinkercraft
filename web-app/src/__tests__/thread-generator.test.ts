// ============================================================
// thread-generator.test.ts — THREAD-GENERATOR: резьба (болт/гайка)
// ============================================================
// Таблицы: метрическая M3…M24 (ISO 261), дюймовая UNC/UNF 1/4"…3/4".
// Базовый профиль ISO 68-1 / Unified: 60°, H = 0,866·P, глубина 5H/8,
// гребень P/8 и впадина P/4. Геометрия (WASM): радиально-осевой свип вдоль
// спирали + булевы. Проверки: реальные диаметры и длина, внутренний профиль,
// замкнутость (CSG ∪ куб), объём, undo/redo, ошибки параметров ru/en.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

vi.mock('../csg/worker-client', async () => {
  const bridge = await import('./worker-bridge')
  return {
    workerBuildShape: bridge.workerBuildShape,
    workerBuildImportedMesh: bridge.workerBuildImportedMesh,
    workerBuildThread: bridge.workerBuildThread,
    workerSyncObjects: bridge.workerSyncObjects,
    workerSyncMesh: bridge.workerSyncMesh,
    workerCsgBoolean: bridge.workerCsgBoolean,
    workerCsgBooleanWithSync: bridge.workerCsgBooleanWithSync,
    workerMirrorObject: bridge.workerMirrorObject,
    workerRebuildScene: bridge.workerRebuildScene,
    workerDeleteObjects: bridge.workerDeleteObjects,
    workerClearAll: bridge.workerClearAll,
    workerRebuildNode: bridge.workerRebuildNode,
    isWorkerReady: bridge.isWorkerReady,
    disposeWorker: bridge.disposeWorker,
  }
})

import {
  METRIC_THREADS, IMPERIAL_THREADS, threadSizeOf, threadFundamentalHeight, threadProfileDepth,
  threadMinorDiameter, nutAcrossFlats, sanitizeThreadParams, THREAD_LENGTH_MIN, THREAD_LENGTH_MAX,
} from '../csg/thread-table'
import { addThreadObject } from '../store/add-thread'
import { useDocumentStore } from '../store/document-store'
import { clearSnapshots } from '../store/snapshots'
import { clearTree, getNode } from '../csg/history-tree'
import { useNotifications } from '../store/notifications'
import { meshVolume } from '../store/edit-child'
import { computeRSMatrix } from '../csg/worker-matrix'
import i18n from '../i18n'
import ru from '../i18n/locales/ru/translation.json'
import en from '../i18n/locales/en/translation.json'
import type { SceneObject } from '../csg/types'

const st = () => useDocumentStore.getState()

function reset(): void {
  useDocumentStore.setState({ objects: {}, operations: [], historyIndex: 0, selectedIds: [], busy: false })
  useNotifications.setState({ notifications: [] })
  clearSnapshots(); clearTree()
}
beforeEach(reset)
afterEach(async () => { await i18n.changeLanguage('ru') })

function worldVerts(obj: SceneObject): Float32Array {
  const t = obj.transform
  const [r00, r01, r02, r10, r11, r12, r20, r21, r22] = computeRSMatrix(
    { rotX: t.rotX, rotY: t.rotY, rotZ: t.rotZ },
    { scaleX: t.scaleX, scaleY: t.scaleY, scaleZ: t.scaleZ },
  )
  const out = new Float32Array(obj.vertices.length)
  for (let i = 0; i < out.length; i += 3) {
    const x = obj.vertices[i], y = obj.vertices[i + 1], z = obj.vertices[i + 2]
    out[i] = r00 * x + r01 * y + r02 * z + t.x
    out[i + 1] = r10 * x + r11 * y + r12 * z + t.y
    out[i + 2] = r20 * x + r21 * y + r22 * z + t.z
  }
  return out
}

/** Мировой AABB: [sx, sy, sz] — размеры по осям. */
function worldSize(obj: SceneObject): number[] {
  const v = worldVerts(obj)
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < v.length; i += 3)
    for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], v[i + k]); mx[k] = Math.max(mx[k], v[i + k]) }
  return [mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]]
}

const errors = () => useNotifications.getState().notifications.filter((n) => n.type === 'error')

describe('thread-table: параметры резьбы', () => {
  it('метрическая M3…M24: 10 размеров, шаг растет с диаметром', () => {
    expect(METRIC_THREADS).toHaveLength(10)
    expect(METRIC_THREADS[0]).toMatchObject({ id: 'M3', d: 3, pitch: 0.5 })
    expect(METRIC_THREADS[3]).toMatchObject({ id: 'M6', d: 6, pitch: 1.0 })
    expect(METRIC_THREADS[9]).toMatchObject({ id: 'M24', d: 24, pitch: 3.0 })
    for (let i = 1; i < METRIC_THREADS.length; i++)
      expect(METRIC_THREADS[i].pitch).toBeGreaterThan(METRIC_THREADS[i - 1].pitch)
  })

  it('дюймовая UNC/UNF: 1/4"…3/4", шаг = 25,4 / TPI', () => {
    expect(IMPERIAL_THREADS).toHaveLength(12)
    const q = threadSizeOf('imperial', '1/4-20-UNC')!
    expect(q.d).toBeCloseTo(6.35, 2)
    expect(q.pitch).toBeCloseTo(1.27, 2)
    const h = threadSizeOf('imperial', '1/2-13-UNC')!
    expect(h.d).toBeCloseTo(12.7, 2)
    expect(h.pitch).toBeCloseTo(25.4 / 13, 2)
    expect(threadSizeOf('imperial', '1/4-28-UNF')).toBeDefined()
  })

  it('дюймовый шаг хранится точно, без округления до подписи UI', () => {
    for (const size of IMPERIAL_THREADS) {
      const tpi = Number(size.id.split('-')[1])
      expect(size.pitch * tpi).toBeCloseTo(25.4, 12)
    }
  })

  it('базовый профиль ISO/Unified: 60°, глубина 5H/8, минорные диаметры и ключи по стандарту', () => {
    expect(threadFundamentalHeight(1)).toBeCloseTo(0.8660254, 6)
    expect(threadProfileDepth(1)).toBeCloseTo(0.5412659, 6)
    expect(threadMinorDiameter(threadSizeOf('metric', 'M6')!)).toBeCloseTo(4.917468, 5)
    expect(threadMinorDiameter(threadSizeOf('metric', 'M10')!)).toBeCloseTo(8.376202, 5)
    expect(threadMinorDiameter(threadSizeOf('metric', 'M12')!)).toBeCloseTo(10.105569, 5)
    expect(nutAcrossFlats(threadSizeOf('metric', 'M6')!)).toBe(10)
    expect(nutAcrossFlats(threadSizeOf('metric', 'M12')!)).toBe(18)
    expect(nutAcrossFlats(threadSizeOf('imperial', '1/2-13-UNC')!)).toBeCloseTo(19.05, 2)
  })

  it('sanitizeThreadParams: валидирует размер, длину клампит, чужой id — null', () => {
    expect(sanitizeThreadParams({ series: 'metric', sizeId: 'M6', length: 20, kind: 'bolt' }))
      .toEqual({ series: 'metric', sizeId: 'M6', length: 20, kind: 'bolt' })
    expect(sanitizeThreadParams({ series: 'metric', sizeId: 'M6', length: 1, kind: 'bolt' })!.length)
      .toBe(THREAD_LENGTH_MIN)
    expect(sanitizeThreadParams({ series: 'metric', sizeId: 'M6', length: 9999, kind: 'nut' })!.length)
      .toBe(THREAD_LENGTH_MAX)
    expect(sanitizeThreadParams({ series: 'metric', sizeId: 'M999', length: 20, kind: 'bolt' })).toBeNull()
    expect(sanitizeThreadParams({ series: 'x', sizeId: 'M6', length: 20, kind: 'x' }))
      .toEqual({ series: 'metric', sizeId: 'M6', length: 20, kind: 'bolt' })
  })
})

describe('THREAD-GENERATOR: геометрия (WASM)', () => {
  it('M6 × 20 → болт import_mesh «Резьба: M6×20», габарит ≈ 6×20, дерево baked', async () => {
    expect(await addThreadObject({ series: 'metric', sizeId: 'M6', length: 20, kind: 'bolt' })).toBe(true)
    const id = Object.keys(st().objects)[0]
    expect(id.startsWith('thr_')).toBe(true)
    const obj = st().objects[id]
    expect(obj.shapeType).toBe('import_mesh')
    expect(obj.name).toBe(i18n.t('threadModal.boltName', { size: 'M6', length: 20 }))
    expect(getNode(id)?.type).toBe('baked')
    expect(errors()).toEqual([])
    const [sx, sy, sz] = worldSize(obj)
    expect(sx).toBeCloseTo(6, 1)
    expect(sy).toBeCloseTo(6, 1)
    expect(sz).toBeCloseTo(20, 3)
    const v = meshVolume(worldVerts(obj), obj.indices)
    const core = Math.PI * Math.pow(threadMinorDiameter(threadSizeOf('metric', 'M6')!) / 2, 2) * 20
    expect(v).toBeGreaterThan(core)
  })

  it('M10 × 30 → габарит ≈ 10×30', async () => {
    await addThreadObject({ series: 'metric', sizeId: 'M10', length: 30, kind: 'bolt' })
    const obj = Object.values(st().objects)[0]
    const [sx, , sz] = worldSize(obj)
    expect(sx).toBeCloseTo(10, 1)
    expect(sz).toBeCloseTo(30, 3)
  })

  it('дюймовая: 1/4"-20 UNC ≈ 6,35; 1/2"-13 UNC ≈ 12,7 (стержень)', async () => {
    await addThreadObject({ series: 'imperial', sizeId: '1/4-20-UNC', length: 15, kind: 'bolt' })
    const a = Object.values(st().objects)[0]
    expect(worldSize(a)[0]).toBeCloseTo(6.35, 1)
    reset()
    await addThreadObject({ series: 'imperial', sizeId: '1/2-13-UNC', length: 25, kind: 'bolt' })
    const b = Object.values(st().objects)[0]
    expect(worldSize(b)[0]).toBeCloseTo(12.7, 1)
  })

  it('гайка M6: шестигранник (X — по вершинам 2s/√3, Y — по граням s), отверстие вычтено', async () => {
    await addThreadObject({ series: 'metric', sizeId: 'M6', length: 8, kind: 'nut' })
    const obj = Object.values(st().objects)[0]
    expect(obj.name).toBe(i18n.t('threadModal.nutName', { size: 'M6' }))
    const [sx, sy, sz] = worldSize(obj)
    const s = nutAcrossFlats(threadSizeOf('metric', 'M6')!)
    const Rc = s / Math.sqrt(3)
    expect(sx).toBeCloseTo(2 * Rc, 2)
    expect(sy).toBeCloseTo(s, 2)
    expect(sz).toBeCloseTo(8, 3)
    const v = meshVolume(worldVerts(obj), obj.indices)
    const hexVol = (Math.sqrt(3) / 2) * Math.pow(s, 2) * 8 * 0.99
    expect(v).toBeLessThan(hexVol)
    expect(v).toBeGreaterThan(hexVol * 0.5)
  })

  it('гайка M6: внутренняя резьба имеет реальные D1 = 4,917 и D = 6,000 мм', async () => {
    const size = threadSizeOf('metric', 'M6')!
    await addThreadObject({ series: 'metric', sizeId: 'M6', length: 8, kind: 'nut' })
    const obj = Object.values(st().objects)[0]
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    for (let i = 0; i < obj.vertices.length; i += 3) {
      minX = Math.min(minX, obj.vertices[i]); maxX = Math.max(maxX, obj.vertices[i])
      minY = Math.min(minY, obj.vertices[i + 1]); maxY = Math.max(maxY, obj.vertices[i + 1])
    }
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2
    const radii: number[] = []
    for (let i = 0; i < obj.vertices.length; i += 3) {
      const r = Math.hypot(obj.vertices[i] - cx, obj.vertices[i + 1] - cy)
      if (Math.abs(obj.vertices[i + 2]) < 3 && r < size.d / 2 + 0.05) radii.push(r)
    }
    expect(radii.length).toBeGreaterThan(100)
    // Хорды 72-сегментной триангуляции срезают minor-диаметр менее чем на 0,01 мм.
    expect(Math.abs(2 * Math.min(...radii) - threadMinorDiameter(size))).toBeLessThan(0.01)
    expect(2 * Math.max(...radii)).toBeCloseTo(size.d, 3)
  })

  it.each([
    { sizeId: 'M6', length: 8 },
    { sizeId: 'M16', length: 16 },
  ])('гайка $sizeId: обе фаски 120° прорезаны полнопрофильной резьбой без торцевого среза витка', async ({ sizeId, length }) => {
    const size = threadSizeOf('metric', sizeId)!
    await addThreadObject({ series: 'metric', sizeId, length, kind: 'nut' })
    const obj = Object.values(st().objects)[0]
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity
    for (let i = 0; i < obj.vertices.length; i += 3) {
      minX = Math.min(minX, obj.vertices[i]); maxX = Math.max(maxX, obj.vertices[i])
      minY = Math.min(minY, obj.vertices[i + 1]); maxY = Math.max(maxY, obj.vertices[i + 1])
      minZ = Math.min(minZ, obj.vertices[i + 2]); maxZ = Math.max(maxZ, obj.vertices[i + 2])
    }
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2
    const rMajor = size.d / 2
    const rMinor = threadMinorDiameter(size) / 2
    const chH = threadProfileDepth(size.pitch) / Math.sqrt(3)
    const radiiAt = (z: number): number[] => {
      const radii: number[] = []
      for (let i = 0; i < obj.vertices.length; i += 3) {
        if (Math.abs(obj.vertices[i + 2] - z) < 1e-4)
          radii.push(Math.hypot(obj.vertices[i] - cx, obj.vertices[i + 1] - cy))
      }
      return radii
    }
    for (const side of [-1, 1]) {
      const endZ = side < 0 ? minZ : maxZ
      const opening = radiiAt(endZ).filter((r) => r <= rMajor + 0.01)
      expect(opening.length).toBeGreaterThanOrEqual(72)
      expect(Math.abs(Math.min(...opening) - rMajor)).toBeLessThan(0.01)
      expect(Math.abs(Math.max(...opening) - rMajor)).toBeLessThan(0.01)
      const transition = radiiAt(endZ - side * chH)
      expect(transition.filter((r) => Math.abs(r - rMinor) < 0.01).length).toBeGreaterThanOrEqual(6)
      const innerZ = endZ - side * chH
      let coneSurface = 0, fullDepthGroove = 0
      for (let i = 0; i < obj.vertices.length; i += 3) {
        const fromInner = side * (obj.vertices[i + 2] - innerZ)
        const r = Math.hypot(obj.vertices[i] - cx, obj.vertices[i + 1] - cy)
        if (fromInner <= 1e-4 || fromInner >= chH - 1e-4 || r > rMajor + 0.01) continue
        const coneRadius = rMinor + fromInner * Math.sqrt(3)
        if (Math.abs(r - coneRadius) < 0.01) coneSurface++
        if (Math.abs(r - rMajor) < 0.01) fullDepthGroove++
      }
      expect(coneSurface).toBeGreaterThan(0)
      expect(fullDepthGroove).toBeGreaterThan(0)
    }
  })

  it('болт ∪ куб → CSG без уведомлений (замкнутый меш)', async () => {
    await addThreadObject({ series: 'metric', sizeId: 'M6', length: 20, kind: 'bolt' })
    const thr = Object.keys(st().objects)[0]
    const t = st().objects[thr].transform
    await st().addShape('cube', { width: 10, height: 10, depth: 10 })
    const cube = Object.keys(st().objects).find((k) => k !== thr)!
    await st().moveObject(cube, { ...st().objects[cube].transform, x: t.x + 30, y: t.y, z: t.z })
    st().selectObjects([thr, cube], false)
    await st().csgBoolean('union')
    expect(errors()).toEqual([])
    expect(st().objects[thr]).toBeUndefined()
    expect(st().objects[cube]).toBeUndefined()
    expect(st().objects[st().selectedIds[0]].shapeType).toBe('csg')
  })

  it('гайка ∪ куб → CSG без уведомлений (замкнутый внутренний профиль)', async () => {
    await addThreadObject({ series: 'metric', sizeId: 'M8', length: 10, kind: 'nut' })
    const nut = Object.keys(st().objects)[0]
    const t = st().objects[nut].transform
    await st().addShape('cube', { width: 10, height: 10, depth: 10 })
    const cube = Object.keys(st().objects).find((k) => k !== nut)!
    await st().moveObject(cube, { ...st().objects[cube].transform, x: t.x + 30, y: t.y, z: t.z })
    st().selectObjects([nut, cube], false)
    await st().csgBoolean('union')
    expect(errors()).toEqual([])
    expect(st().objects[st().selectedIds[0]].shapeType).toBe('csg')
  })

  it('undo/redo: резьба убирается и возвращается', async () => {
    await addThreadObject({ series: 'metric', sizeId: 'M8', length: 20, kind: 'bolt' })
    expect(Object.keys(st().objects)).toHaveLength(1)
    await st().undo()
    expect(Object.keys(st().objects)).toHaveLength(0)
    await st().redo()
    expect(Object.keys(st().objects)).toHaveLength(1)
  })

  it('ошибки: чужой размер → threadBadParams (ru/en), объект не добавлен', async () => {
    expect(await addThreadObject({ series: 'metric', sizeId: 'M999', length: 20, kind: 'bolt' })).toBe(false)
    expect(Object.keys(st().objects)).toHaveLength(0)
    expect(errors()[0].message).toContain(ru.errors.threadBadParams.slice(0, 20))
    await i18n.changeLanguage('en')
    useNotifications.setState({ notifications: [] })
    expect(await addThreadObject({ series: 'metric', sizeId: 'M999', length: 20, kind: 'bolt' })).toBe(false)
    expect(errors()[0].message).toContain(en.errors.threadBadParams.slice(0, 20))
  })
})
