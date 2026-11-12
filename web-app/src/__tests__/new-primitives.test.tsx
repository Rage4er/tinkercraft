// ============================================================
// new-primitives.test.tsx — NEW-PRIMITIVES: капсула, труба, пружина (настоящий WASM — worker-bridge)
// ============================================================
// Каждая фигура: замкнутый меш (manifold), объём — по формуле, рамка — по параметрам, центр масс —
// в origin; добавление в сцену, правка параметров (пересборка), CSG с ней, перестроение по истории
// и .3dtc; палитра, поля свойств и правки ребёнка CSG, подписи истории.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

vi.mock('../csg/worker-client', async () => {
  const bridge = await import('./worker-bridge')
  return {
    workerBuildShape: bridge.workerBuildShape,
    workerBuildImportedMesh: bridge.workerBuildImportedMesh,
    workerSyncObjects: bridge.workerSyncObjects,
    workerSyncMesh: bridge.workerSyncMesh,
    workerCsgBoolean: bridge.workerCsgBoolean,
    workerCsgBooleanWithSync: bridge.workerCsgBooleanWithSync,
    workerCsgBooleanMulti: bridge.workerCsgBooleanMulti,
    workerMirrorObject: bridge.workerMirrorObject,
    workerRebuildScene: bridge.workerRebuildScene,
    workerDeleteObjects: bridge.workerDeleteObjects,
    workerClearAll: bridge.workerClearAll,
    workerRebuildNode: bridge.workerRebuildNode,
    isWorkerReady: bridge.isWorkerReady,
    disposeWorker: bridge.disposeWorker,
  }
})

import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import i18n from '../i18n'
import { useDocumentStore } from '../store/document-store'
import { clearSnapshots } from '../store/snapshots'
import { clearTree } from '../csg/history-tree'
import { rebuildFromHistory } from '../store/rebuild'
import { serialize3dtc, parse3dtc } from '../io/3dtc-io'
import { opLabel } from '../components/Timeline'
import { springGeometry } from '../csg/worker-handlers'
import { getParamFields } from '../csg/child-params'
import { defaultShapeParams, localParamsBox, centerMassAtOrigin } from '../store/helpers'
import { formatParams } from '../csg/tree-view'
import { ALL_SHAPES_DATA } from '../constants'
import { ALL_SHAPES } from '../constants.tsx'
import { ALL_SHAPES_ICONS } from '../constants-react'
import { renderToStaticMarkup } from 'react-dom/server'
import PropertiesPanel from '../components/PropertiesPanel'
import type { SceneObject, ShapeParams, ShapeType, TransformNR } from '../csg/types'

const st = () => useDocumentStore.getState()
const AT = (x: number): TransformNR => ({ x, y: 0, z: 20, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 })
const objs = () => Object.values(st().objects)

/** Объём замкнутого меша (сумма тетраэдров от начала координат) */
function volume(v: ArrayLike<number>, idx: ArrayLike<number>): number {
  let s = 0
  for (let k = 0; k < idx.length; k += 3) {
    const a = idx[k] * 3, b = idx[k + 1] * 3, c = idx[k + 2] * 3
    s += v[a] * (v[b + 1] * v[c + 2] - v[b + 2] * v[c + 1]) - v[a + 1] * (v[b] * v[c + 2] - v[b + 2] * v[c]) + v[a + 2] * (v[b] * v[c + 1] - v[b + 1] * v[c])
  }
  return s / 6
}
/** Каждое ребро — ровно у двух треугольников, во встречных направлениях (замкнутый, согласованный) */
function closedManifold(v: ArrayLike<number>, idx: ArrayLike<number>): boolean {
  // вершины — по координатам (у воркера на шве могут быть дубли с теми же координатами)
  const key = (i: number) => `${v[i * 3].toFixed(4)},${v[i * 3 + 1].toFixed(4)},${v[i * 3 + 2].toFixed(4)}`
  const edges = new Map<string, number>()
  for (let k = 0; k < idx.length; k += 3) {
    for (let e = 0; e < 3; e++) {
      const a = key(idx[k + e]), b = key(idx[k + (e + 1) % 3])
      edges.set(`${a}|${b}`, (edges.get(`${a}|${b}`) ?? 0) + 1)
    }
  }
  for (const [e, n] of edges) {
    const [a, b] = e.split('|')
    if (n !== 1 || edges.get(`${b}|${a}`) !== 1) return false
  }
  return true
}
function size(o: SceneObject): number[] {
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < o.vertices.length; i += 3) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], o.vertices[i + k]); mx[k] = Math.max(mx[k], o.vertices[i + k]) }
  return mx.map((m, k) => Math.round((m - mn[k]) * 100) / 100)
}
async function add(type: ShapeType, params?: ShapeParams, x = 0): Promise<SceneObject> {
  await st().addShape(type, params, AT(x))
  return objs().at(-1)!
}

let root: Root | null = null
let host: HTMLDivElement
afterEach(() => { if (root) act(() => root!.unmount()); root = null; host?.remove() })
beforeEach(async () => {
  await i18n.changeLanguage('ru')
  useDocumentStore.setState({ objects: {}, operations: [], historyIndex: 0, selectedIds: [], busy: false })
  clearSnapshots(); clearTree()
})

describe('NEW-PRIMITIVES — геометрия (WASM)', () => {
  it('капсула r 8, h 30: замкнута, рамка 16 × 16 × 30, объём ≈ πr²(h − 2r) + 4/3 πr³, центр масс в 0', async () => {
    const o = await add('capsule')
    expect(o.params).toEqual(defaultShapeParams('capsule'))
    expect(closedManifold(o.vertices, o.indices)).toBe(true)
    expect(size(o)).toEqual([16, 16, 30])
    const exact = Math.PI * 64 * 14 + (4 / 3) * Math.PI * 512
    expect(volume(o.vertices, o.indices) / exact).toBeGreaterThan(0.97)
    expect(volume(o.vertices, o.indices) / exact).toBeLessThan(1.0001)
    const com = centerMassAtOrigin(new Float32Array(o.vertices), new Uint32Array(o.indices))
    expect(Math.hypot(com.cx, com.cy, com.cz)).toBeLessThan(1e-3)
  })

  it('труба R 12, r 8, h 20: замкнута, рамка 24 × 24 × 20, объём ≈ π(R² − r²)h, отверстие насквозь', async () => {
    const o = await add('tube')
    expect(closedManifold(o.vertices, o.indices)).toBe(true)
    expect(size(o)).toEqual([24, 24, 20])
    const exact = Math.PI * (144 - 64) * 20
    expect(Math.abs(volume(o.vertices, o.indices) / exact - 1)).toBeLessThan(0.01)
    // ни одной вершины ближе внутреннего радиуса к оси
    let minR = Infinity
    for (let i = 0; i < o.vertices.length; i += 3) minR = Math.min(minR, Math.hypot(o.vertices[i], o.vertices[i + 1]))
    expect(minR).toBeGreaterThan(7.9)
    // внутренний ≥ наружного — внутренний ограничен (стенка 0,1)
    const thin = await add('tube', { radius: 10, innerRadius: 15, height: 10 }, 40)
    expect(closedManifold(thin.vertices, thin.indices)).toBe(true)
    expect(volume(thin.vertices, thin.indices)).toBeGreaterThan(0)
  })

  it('пружина R 10, h 30, 5 витков, проволока 1,5: замкнута, рамка ≈ 23 × 23 × 30, объём ≈ πw² · длина спирали', async () => {
    const o = await add('spring')
    expect(closedManifold(o.vertices, o.indices)).toBe(true)
    const [sx, sy, sz] = size(o)
    expect(sx).toBeGreaterThan(22.5); expect(sx).toBeLessThanOrEqual(23.01)
    expect(sy).toBeGreaterThan(22.5); expect(sy).toBeLessThanOrEqual(23.01)
    expect(Math.abs(sz - 30)).toBeLessThan(0.3)
    const len = Math.hypot(2 * Math.PI * 10 * 5, 27)
    const exact = Math.PI * 1.5 * 1.5 * len
    const ratio = volume(o.vertices, o.indices) / exact
    expect(ratio).toBeGreaterThan(0.93); expect(ratio).toBeLessThan(1.02)
    const com = centerMassAtOrigin(new Float32Array(o.vertices), new Uint32Array(o.indices))
    expect(Math.hypot(com.cx, com.cy, com.cz)).toBeLessThan(1e-2)
  })

  it('пружина: проволока ограничена — витки не касаются, ось не пересекает', () => {
    const g = springGeometry({ radius: 10, height: 20, turns: 10, wireRadius: 5 })
    const pitch = (g.h - 2 * g.wire) / g.turns
    expect(2 * g.wire).toBeLessThan(pitch)
    expect(springGeometry({ radius: 2, height: 100, turns: 2, wireRadius: 5 }).wire).toBeLessThanOrEqual(1.8)
  })
})

describe('NEW-PRIMITIVES — сцена (WASM)', () => {
  it('правка параметров пересобирает меш: труба — внутренний 5, пружина — 8 витков', async () => {
    const tube = await add('tube')
    await st().resizeObject(tube.id, { innerRadius: 5 })
    const t2 = st().objects[tube.id]
    expect(t2.params.innerRadius).toBe(5)
    expect(volume(t2.vertices, t2.indices)).toBeGreaterThan(volume(tube.vertices, tube.indices) * 1.4)
    const spring = await add('spring', undefined, 50)
    await st().resizeObject(spring.id, { turns: 8 })
    const s2 = st().objects[spring.id]
    expect(s2.params.turns).toBe(8)
    expect(s2.indices.length).toBeGreaterThan(spring.indices.length)
  })

  it('CSG: куб − капсула и труба ∪ пружина — результат замкнут; перестроение и .3dtc — те же объёмы', async () => {
    await add('cube', { width: 30, height: 30, depth: 20 })
    await add('capsule', { radius: 6, height: 40 })
    st().selectObjects(Object.keys(st().objects), false)
    await st().csgBoolean('subtract')
    await add('tube', undefined, 60)
    await add('spring', { radius: 10, height: 26, turns: 4, wireRadius: 1.2 }, 60)
    const [, tubeId, springId] = Object.keys(st().objects)
    st().selectObjects([tubeId, springId], false)
    await st().csgBoolean('union')
    const results = objs()
    expect(results.map((o) => o.shapeType)).toEqual(['csg', 'csg'])
    for (const o of results) expect(closedManifold(o.vertices, o.indices)).toBe(true)
    const vols = results.map((o) => volume(o.vertices, o.indices))
    // куб 30×30×20 минус цилиндр r 6 по Z на всю высоту (капсула длиннее куба)
    expect(vols[0] / (18000 - Math.PI * 36 * 20)).toBeGreaterThan(0.99)
    expect(vols[0] / (18000 - Math.PI * 36 * 20)).toBeLessThan(1.01)
    const doc = await parse3dtc(await serialize3dtc({ objects: st().objects, operations: st().operations, operationsTrimmed: false }))
    clearSnapshots(); clearTree()
    const rebuilt = Object.values(await rebuildFromHistory(doc.operations))
    rebuilt.forEach((o, i) => expect(volume(o.vertices, o.indices) / vols[i]).toBeCloseTo(1, 3))
  })

  it('история: «Добавить капсулу» / «трубу» / «пружину»; палитра — три новые фигуры; поля и сводка дерева', async () => {
    for (const type of ['capsule', 'tube', 'spring'] as const) await add(type)
    expect(st().operations.map((op) => opLabel(op, i18n.t.bind(i18n)))).toEqual(['Добавить капсулу', 'Добавить трубу', 'Добавить пружину'])
    expect(ALL_SHAPES_DATA.map((s) => s.type)).toEqual(expect.arrayContaining(['capsule', 'tube', 'spring']))
    // у каждой фигуры палитры — иконка (обе карты иконок: палитра и constants-react)
    for (const list of [ALL_SHAPES, ALL_SHAPES_ICONS]) {
      for (const s of list) expect(renderToStaticMarkup(<>{s.icon({ size: 16 })}</>), s.type).toContain('<svg')
    }
    expect(getParamFields('spring').map((f) => f.key)).toEqual(['radius', 'height', 'turns', 'wireRadius'])
    expect(getParamFields('tube').map((f) => f.key)).toEqual(['radius', 'innerRadius', 'height'])
    expect(formatParams(defaultShapeParams('tube'), 'tube')).toBe('R12 r8 H20')
    expect(localParamsBox({ params: defaultShapeParams('spring') } as SceneObject).max).toEqual({ x: 11.5, y: 11.5, z: 15 })
  })

  it('панель свойств пружины: радиус витка, высота, витков (без единицы), радиус проволоки', async () => {
    const o = await add('spring')
    host = document.body.appendChild(document.createElement('div'))
    root = createRoot(host)
    const noop = () => { }
    const resized: Array<Record<string, number>> = []
    act(() => root!.render(
      <PropertiesPanel firstSelected={o} busy={false} selectedIds={[o.id]} canResize canCsg={false} objectList={[o]} operationsLength={1}
        fileName={null} currentProjectId={null} currentProjectName={null} modified={false} onMoveAxis={noop} onRotAxis={noop} onScaleAxis={noop} onResizeDim={noop}
        onResizeObject={(_id, p) => { resized.push(p as Record<string, number>) }} onCsg={noop} onSetColor={noop} onToggleVisible={noop} onShowProjects={noop} onSaveToProject={noop} />,
    ))
    const field = (id: string) => host.querySelector<HTMLInputElement>(`#${id}`)!
    expect(field('num-input-param-radius').value).toBe('10.0')
    expect(field('num-input-size-Z').value).toBe('30.0')
    expect(field('num-input-param-turns').value).toBe('5.0')
    expect(field('num-input-param-wireRadius').value).toBe('1.5')
    expect(host.textContent).toContain('Витков')
    expect(host.textContent).toContain('Радиус проволоки')
    const f = field('num-input-param-turns')
    act(() => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
      set.call(f, '7'); f.dispatchEvent(new Event('input', { bubbles: true }))
    })
    act(() => { f.dispatchEvent(new FocusEvent('blur', { bubbles: false })); f.dispatchEvent(new FocusEvent('focusout', { bubbles: true })) })
    expect(resized).toEqual([{ turns: 7 }])
  })
})
