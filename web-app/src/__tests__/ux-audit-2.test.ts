// ============================================================
// ux-audit-2.test.ts — UX-прогон 2 (fix-all, H–L): глубокие сценарии на реальном WASM
// ============================================================
// Прогон 2 «как пользователь» (DEVELOPMENT_PLAN.md › «UX-AUDIT-2»): сценарии, которых нет в
// других тестах, — все оправдались; здесь они закреплены регрессией. Общий инвариант —
// «живое = rebuild»: сцена, перестроенная из истории без снимков, совпадает с живой
// (габарит, объём). Браузерная часть (UI, узкие экраны, темы, стресс) — e2e/ux-audit-2.mjs.

import { describe, it, expect, beforeEach, vi } from 'vitest'
vi.mock('../csg/worker-client', async () => {
  const b = await import('./worker-bridge')
  return { ...b }
})
import { useDocumentStore } from '../store/document-store'
import { useNotifications } from '../store/notifications'
import { clearSnapshots } from '../store/snapshots'
import { clearTree } from '../csg/history-tree'
import { computeRSMatrix } from '../csg/worker-matrix'
import { meshVolume } from '../store/edit-child'
import { rebuildFromHistory } from '../store/rebuild'
import { serialize3dtc, parse3dtc } from '../io/3dtc-io'
import { exportToStl } from '../io/stl-export'
import { getTreeView, type TreeViewNode } from '../csg/tree-view'
import type { SceneObject, ShapeParams, ShapeType, TransformNR } from '../csg/types'

const st = () => useDocumentStore.getState()
const ID: TransformNR = { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 }
const at = (x: number, y = 0, z = 0, extra: Partial<TransformNR> = {}): TransformNR => ({ ...ID, x, y, z, ...extra })
const notes = () => useNotifications.getState().notifications.map((n) => `${n.type}:${n.message}`)
function reset(): void {
  useDocumentStore.setState({ objects: {}, operations: [], historyIndex: 0, selectedIds: [], busy: false, clipboard: [] })
  useNotifications.setState({ notifications: [] })
  clearSnapshots(); clearTree()
}
beforeEach(reset)
function worldVerts(obj: SceneObject): Float32Array {
  const t = obj.transform
  const [r00, r01, r02, r10, r11, r12, r20, r21, r22] = computeRSMatrix({ rotX: t.rotX, rotY: t.rotY, rotZ: t.rotZ }, { scaleX: t.scaleX, scaleY: t.scaleY, scaleZ: t.scaleZ })
  const out = new Float32Array(obj.vertices.length)
  for (let i = 0; i < out.length; i += 3) {
    const x = obj.vertices[i], y = obj.vertices[i + 1], z = obj.vertices[i + 2]
    out[i] = r00 * x + r01 * y + r02 * z + t.x; out[i + 1] = r10 * x + r11 * y + r12 * z + t.y; out[i + 2] = r20 * x + r21 * y + r22 * z + t.z
  }
  return out
}
function box(v: Float32Array): number[] {
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < v.length; i += 3) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], v[i + k]); mx[k] = Math.max(mx[k], v[i + k]) }
  return [...mn, ...mx]
}
function same(a: SceneObject, b: SceneObject, tol = 1e-3): string | null {
  const wa = worldVerts(a), wb = worldVerts(b)
  const ba = box(wa), bb = box(wb)
  for (let i = 0; i < 6; i++) if (Math.abs(ba[i] - bb[i]) > tol) return `box ${ba.map((x) => x.toFixed(3))} vs ${bb.map((x) => x.toFixed(3))}`
  const va = meshVolume(wa, a.indices), vb = meshVolume(wb, b.indices)
  if (Math.abs(va - vb) > Math.max(1e-3, Math.abs(vb) * 1e-4)) return `vol ${va.toFixed(3)} vs ${vb.toFixed(3)}`
  return null
}
async function shape(type: ShapeType, params: ShapeParams, t: TransformNR): Promise<string> {
  const before = new Set(Object.keys(st().objects))
  await st().addShape(type, params)
  const id = Object.keys(st().objects).find((k) => !before.has(k))!
  await st().moveObject(id, t)
  return id
}
async function csg(a: string, b: string, op: 'union' | 'subtract' | 'intersect' = 'union'): Promise<string> {
  st().selectObjects([a, b], false)
  await st().csgBoolean(op)
  return st().selectedIds[0]
}
async function move(id: string, p: Partial<TransformNR>): Promise<void> { await st().moveObject(id, { ...st().objects[id].transform, ...p }) }
/** «живое = rebuild»: перестроение из истории без снимков; [] — расхождений нет */
async function liveVsRebuild(tag: string): Promise<string[]> {
  const live = st().objects
  clearSnapshots()
  const rebuilt = await rebuildFromHistory(st().operations.slice(0, st().historyIndex))
  const problems: string[] = []
  const ka = Object.keys(live).sort(), kb = Object.keys(rebuilt).sort()
  if (ka.join() !== kb.join()) problems.push(`${tag}: ids live=${ka} rebuild=${kb}`)
  for (const id of ka) if (rebuilt[id]) { const d = same(live[id], rebuilt[id]); if (d) problems.push(`${tag}: ${id} ${d}`) }
  return problems
}
const vol = (o: SceneObject) => meshVolume(worldVerts(o), o.indices)
const radiusOf = (root: string, node: string) => {
  const find = (v: TreeViewNode | null): TreeViewNode | null => !v ? null : v.id === node ? v : v.children.map(find).find(Boolean) ?? null
  return find(getTreeView(root))?.params?.radius
}
const flatIds = (v: TreeViewNode | null): string[] => v ? [v.id, ...v.children.flatMap(flatIds)] : []
/** Документ через .3dtc (сериализация → разбор) → перестроение из истории. */
async function viaFile(): Promise<Record<string, SceneObject>> {
  const doc = await parse3dtc(await serialize3dtc({ objects: st().objects, operations: st().operations.slice(0, st().historyIndex), operationsTrimmed: false }))
  reset()
  return rebuildFromHistory(doc.operations)
}

describe('UX-прогон 2 — H. Правка истории (глубже)', () => {
  it('H1: правки ребёнка подряд, undo/redo, перемотка к CSG и в конец; = свежему', async () => {
    const a = await shape('cube', { width: 20, height: 20, depth: 20 }, at(0))
    const b = await shape('sphere', { radius: 10, segments: 32 }, at(12))
    const g = await csg(a, b)
    const v0 = vol(st().objects[g])
    await st().editChildParams(g, b, { radius: 12 })
    await st().editChildParams(g, b, { radius: 14 })
    expect(vol(st().objects[g])).toBeGreaterThan(v0)
    expect(notes()).toEqual([])
    const live14 = st().objects[g]
    await st().undo(); await st().undo()
    expect(radiusOf(g, b)).toBe(10)
    await st().redo(); await st().redo()
    expect(same(st().objects[g], live14)).toBeNull()
    await st().jumpToHistory(st().operations.findIndex((o) => o.type === 'group') + 1)
    expect(radiusOf(g, b)).toBe(10)
    await st().jumpToHistory(st().operations.length)
    expect(same(st().objects[g], live14)).toBeNull()
    expect(await liveVsRebuild('H1')).toEqual([])
    reset()
    const g2 = await csg(await shape('cube', { width: 20, height: 20, depth: 20 }, at(0)), await shape('sphere', { radius: 14, segments: 32 }, at(12)))
    expect(same(st().objects[g2], live14)).toBeNull()
  })

  it('H2: CSG 3 уровней со сдвигами/поворотами между уровнями — правка двух глубоких детей = свежему, .3dtc', async () => {
    async function build(rb: number, wa: number) {
      const a = await shape('cube', { width: wa, height: 20, depth: 20 }, at(0))
      const b = await shape('sphere', { radius: rb, segments: 32 }, at(12))
      const g1 = await csg(a, b); await move(g1, { x: 5, rotZ: 20 })
      const c = await shape('cylinder', { radius: 6, height: 30, segments: 32 }, at(-8, 0, 0))
      const g2 = await csg(g1, c); await move(g2, { y: 7, rotX: 15 })
      const d = await shape('sphere', { radius: 6, segments: 32 }, at(0, 7, 12))
      return { a, b, g3: await csg(g2, d, 'subtract') }
    }
    const s0 = await build(10, 20)
    await st().editChildParams(s0.g3, s0.b, { radius: 13 })
    await st().editChildParams(s0.g3, s0.a, { width: 24 })
    expect(notes()).toEqual([])
    const live = st().objects[s0.g3]
    expect(await liveVsRebuild('H2')).toEqual([])
    const loaded = await viaFile()
    expect(same(loaded[s0.g3], live)).toBeNull()
    reset()
    const s1 = await build(13, 24)
    expect(same(st().objects[s1.g3], live)).toBeNull()
  })

  it('H3: правка прошлого шага move — каскад через 2 CSG, undo/redo', async () => {
    const a = await shape('cube', { width: 20, height: 20, depth: 20 }, at(0))
    const b = await shape('sphere', { radius: 10, segments: 32 }, at(12))
    const moveIdx = st().operations.length - 1
    const g = await csg(a, b)
    const h = await csg(g, await shape('cylinder', { radius: 5, height: 30, segments: 32 }, at(-5)))
    const before = st().objects[h]
    expect(await st().editStepParams(moveIdx, { kind: 'move', delta: { x: 16, y: 0, z: 0 } })).toBe(true)
    const after = st().objects[h]
    expect(same(before, after)).not.toBeNull()
    expect(await liveVsRebuild('H3')).toEqual([])
    await st().undo()
    expect(same(st().objects[h], before)).toBeNull()
    await st().redo()
    expect(same(st().objects[h], after)).toBeNull()
  })
})

describe('UX-прогон 2 — I. Копия (глубже)', () => {
  it('I1: копия копии вложенного CSG — правка глубокого ребёнка не трогает оригинал и первую копию', async () => {
    const a = await shape('cube', { width: 20, height: 20, depth: 20 }, at(0))
    const b = await shape('sphere', { radius: 10, segments: 32 }, at(12))
    const g2 = await csg(await csg(a, b), await shape('cylinder', { radius: 5, height: 30, segments: 32 }, at(-5)))
    st().selectObjects([g2], false); st().copySelected(); await st().pasteClipboard()
    const cp1 = st().selectedIds[0]
    st().selectObjects([cp1], false); st().copySelected(); await st().pasteClipboard()
    const cp2 = st().selectedIds[0]
    const orig = st().objects[g2], o1 = st().objects[cp1]
    const sphereNode = flatIds(getTreeView(cp2)).find((id) => id.endsWith(`:${b}`))!
    expect(sphereNode).toBeDefined()
    await st().editChildParams(cp2, sphereNode, { radius: 13 })
    expect(notes()).toEqual([])
    expect(same(st().objects[g2], orig)).toBeNull()
    expect(same(st().objects[cp1], o1)).toBeNull()
    expect(same(st().objects[cp2], o1)).not.toBeNull()
    expect(await liveVsRebuild('I1')).toEqual([])
  })

  it('I2: зеркальный повёрнутый ребёнок → CSG → зеркало CSG → вставка → правка ребёнка копии', async () => {
    const a = await shape('cube', { width: 20, height: 20, depth: 20 }, at(0))
    const s = await shape('cone', { radius: 8, height: 20, segments: 32 }, at(12, 0, 0, { rotY: 30 }))
    st().selectObjects([s], false); await st().mirrorSelected('YZ')
    const m = Object.keys(st().objects).find((id) => id !== a && id !== s)!
    const g = await csg(a, m)
    st().selectObjects([g], false); await st().mirrorSelected('XZ')
    const gm = Object.keys(st().objects).find((id) => st().objects[id].shapeType === 'csg' && id !== g)!
    st().selectObjects([gm], false); st().copySelected(); await st().pasteClipboard()
    const cp = st().selectedIds[0]
    const cone = getTreeView(cp)!.children.find((ch) => ch.shapeType === 'cone')!
    expect(cone.editable).toBe(true)
    const before = { g: st().objects[g], gm: st().objects[gm], cp: st().objects[cp] }
    await st().editChildParams(cp, cone.id, { radius: 10 })
    expect(notes()).toEqual([])
    expect(same(st().objects[g], before.g)).toBeNull()
    expect(same(st().objects[gm], before.gm)).toBeNull()
    expect(same(st().objects[cp], before.cp)).not.toBeNull()
    expect(await liveVsRebuild('I2')).toEqual([])
  })
})

describe('UX-прогон 2 — J. Импорт/экспорт (глубже)', () => {
  it('J1: объединение двух импортов, экспорт STL = сцене', async () => {
    const oct = (r: number): [number[], number[]] => [
      [r, 0, 0, -r, 0, 0, 0, r, 0, 0, -r, 0, 0, 0, r, 0, 0, -r],
      [0, 2, 4, 2, 1, 4, 1, 3, 4, 3, 0, 4, 2, 0, 5, 1, 2, 5, 3, 1, 5, 0, 3, 5],
    ]
    await st().addRawMesh('i1', ...oct(12)); const i1 = st().selectedIds[0]
    await st().addRawMesh('i2', ...oct(10)); const i2 = st().selectedIds[0]
    await move(i2, { x: 8 })
    const u = await csg(i1, i2)
    expect(st().objects[u].shapeType).toBe('csg')
    const n = new DataView(await exportToStl(Object.values(st().objects)).arrayBuffer()).getUint32(80, true)
    expect(n).toBe(st().objects[u].indices.length / 3)
    expect(await liveVsRebuild('J1')).toEqual([])
  })

  it('J2: .3dtc с тремя правками (ребёнок, шаг move, ребёнок) — после загрузки = живому', async () => {
    const a = await shape('cube', { width: 20, height: 20, depth: 20 }, at(0))
    const b = await shape('sphere', { radius: 10, segments: 32 }, at(12))
    const mIdx = st().operations.length - 1
    const g = await csg(a, b)
    await st().editChildParams(g, b, { radius: 12 })
    expect(await st().editStepParams(mIdx, { kind: 'move', delta: { x: 14, y: 2, z: 0 } })).toBe(true)
    await st().editChildParams(g, a, { width: 18 })
    expect(st().operations.map((o) => o.type)).toEqual(['add_shape', 'add_shape', 'move', 'group', 'edit_child_params', 'edit_step', 'edit_child_params'])
    const live = st().objects[g]
    expect(same((await viaFile())[g], live)).toBeNull()
  })
})

describe('UX-прогон 2 — K. Выравнивание (глубже)', () => {
  it('K1: повёрнутый CSG и куб — Z min, затем X max по реальной геометрии', async () => {
    const a = await shape('cube', { width: 20, height: 20, depth: 20 }, at(0))
    const g = await csg(a, await shape('sphere', { radius: 10, segments: 32 }, at(12)))
    await move(g, { rotZ: 35, z: 5 })
    const c = await shape('cube', { width: 10, height: 10, depth: 10 }, at(60, 0, -20))
    st().selectObjects([g, c], false); await st().alignSelected('Z', 'min')
    expect(box(worldVerts(st().objects[g]))[2]).toBeCloseTo(box(worldVerts(st().objects[c]))[2], 3)
    st().selectObjects([g, c], false); await st().alignSelected('X', 'max')
    expect(box(worldVerts(st().objects[g]))[3]).toBeCloseTo(box(worldVerts(st().objects[c]))[3], 3)
    expect(await liveVsRebuild('K1')).toEqual([])
  })
})

describe('UX-прогон 2 — L. Стресс', () => {
  it('L1: 60 объектов, ~110 шагов — undo всё, redo всё, живое = rebuild', async () => {
    const types: ShapeType[] = ['cube', 'sphere', 'cylinder', 'cone', 'torus', 'prism', 'pyramid']
    for (let i = 0; i < 60; i++) await st().addShape(types[i % 7])
    const ids = Object.keys(st().objects)
    for (let i = 0; i < 60; i++) await move(ids[i], { y: (i % 5) * 7, z: i % 3 })
    const n = st().historyIndex
    expect(n).toBeGreaterThan(100)
    for (let i = 0; i < n; i++) await st().undo()
    expect(Object.keys(st().objects)).toHaveLength(0)
    for (let i = 0; i < n; i++) await st().redo()
    expect(Object.keys(st().objects)).toHaveLength(60)
    expect(await liveVsRebuild('L1')).toEqual([])
  }, 60000)
})
