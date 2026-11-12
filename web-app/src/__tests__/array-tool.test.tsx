// ============================================================
// array-tool.test.tsx — ARRAY-TOOL: линейный и круговой массив (настоящий WASM — worker-bridge)
// ============================================================
// Массив — ОДИН шаг истории `array` (параметры + запечённые шаги копий, как у вставки):
// undo / redo целиком, перестроение без снимков, .3dtc. Круговой — позиция и ориентация копий
// (рамка тела по реальным вершинам). Копия CSG — независимое дерево. Окно «Массив».

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
import { useUiStore } from '../store/ui-store'
import { clearSnapshots } from '../store/snapshots'
import { clearTree, getNode } from '../csg/history-tree'
import { rebuildFromHistory } from '../store/rebuild'
import { useNotifications } from '../store/notifications'
import { serialize3dtc, parse3dtc } from '../io/3dtc-io'
import { opLabel, filterKeyOf } from '../components/Timeline'
import { computeWorldAABB } from '../store/helpers'
import { findCreationTransform } from '../store/edit-child'
import { arrayInstanceTransform, circularInstanceAngle, sanitizeArrayParams, ARRAY_MAX_NEW_OBJECTS } from '../store/array-tool'
import { sfxForOperation } from '../hooks/useSfx'
import ArrayModal from '../components/ArrayModal'
import type { ArrayOperation, SceneObject, TransformNR } from '../csg/types'

const st = () => useDocumentStore.getState()
const AT = (x: number, y = 0, z = 10): TransformNR => ({ x, y, z, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 })
const objs = () => Object.values(st().objects)
const r2 = (v: number) => Math.round(v * 100) / 100 || 0
/** Центр и размер мировой рамки тела (по вершинам) */
const box = (o: SceneObject) => {
  const b = computeWorldAABB(o)
  return {
    c: [b.min.x + b.max.x, b.min.y + b.max.y, b.min.z + b.max.z].map((v) => r2(v / 2)),
    s: [b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z].map(r2),
  }
}

let root: Root | null = null
let host: HTMLDivElement
afterEach(() => { if (root) act(() => root!.unmount()); root = null; host?.remove() })

beforeEach(async () => {
  await i18n.changeLanguage('ru')
  useDocumentStore.setState({ objects: {}, operations: [], historyIndex: 0, selectedIds: [], busy: false })
  useNotifications.setState({ notifications: [] })
  clearSnapshots(); clearTree()
})

describe('ARRAY-TOOL — расчёт экземпляров', () => {
  it('линейный: сдвиг на шаг × i по оси; круговой: 360° — через 360 / N, дуга — от 0 до угла', () => {
    expect(arrayInstanceTransform(AT(5), { kind: 'linear', axis: 'X', count: 3, step: 20 }, 2).x).toBe(45)
    expect(arrayInstanceTransform(AT(5), { kind: 'linear', axis: 'Z', count: 3, step: -7 }, 1).z).toBe(3)
    const full = { kind: 'circular' as const, axis: 'Y' as const, count: 6, angle: 360 }
    expect([0, 1, 2, 5].map((i) => circularInstanceAngle(full, i))).toEqual([0, 60, 120, 300])
    const arc = { kind: 'circular' as const, axis: 'Z' as const, count: 3, angle: 90 }
    expect([0, 1, 2].map((i) => circularInstanceAngle(arc, i))).toEqual([0, 45, 90])
  })

  it('пределы: N — целое 2…100, круговой угол 0 → 360, нечисла — по умолчанию', () => {
    expect(sanitizeArrayParams({ kind: 'linear', axis: 'X', count: 1.4, step: Number.NaN })).toEqual({ kind: 'linear', axis: 'X', count: 2, step: 20 })
    expect(sanitizeArrayParams({ kind: 'circular', axis: 'Q' as 'X', count: 1000, angle: 0 }).count).toBe(100)
    expect(sanitizeArrayParams({ kind: 'circular', axis: 'Z', count: 4, angle: 0 })).toMatchObject({ axis: 'Z', angle: 360, center: { x: 0, y: 0, z: 0 } })
  })
})

describe('ARRAY-TOOL — стор (WASM)', () => {
  it('линейный N = 3, шаг 20, X: две копии на X = 20 и 40 — один шаг «Массив», выделены все три', async () => {
    await st().addShape('cube', { width: 10, height: 10, depth: 10 }, AT(0))
    const [src] = Object.keys(st().objects)
    st().selectObjects([src], false)
    const n = st().operations.length
    expect(await st().arraySelected({ kind: 'linear', axis: 'X', count: 3, step: 20 })).toBe(true)
    expect(st().operations).toHaveLength(n + 1)
    const op = st().operations.at(-1) as ArrayOperation
    expect(op.type).toBe('array')
    expect(op.sourceIds).toEqual([src])
    expect(op.ops.map((o) => o.type)).toEqual(['add_shape', 'add_shape'])
    expect(objs().map((o) => box(o).c)).toEqual([[0, 0, 10], [20, 0, 10], [40, 0, 10]])
    expect(st().selectedIds).toHaveLength(3)
    expect(opLabel(op, i18n.t.bind(i18n))).toBe('Массив: линейный ×3, шаг 20 (X)')
    expect(filterKeyOf(op)).toBe('array')
    expect(sfxForOperation(op)).toBe('create')
  })

  it('круговой N = 6, 360°, ось Y через (0, 0, 10): брусок 30×4×4 на X = 20 — копии по кругу и повёрнуты вокруг Y', async () => {
    await st().addShape('cube', { width: 30, height: 4, depth: 4 }, AT(20))
    const [src] = Object.keys(st().objects)
    st().selectObjects([src], false)
    await st().arraySelected({ kind: 'circular', axis: 'Y', count: 6, angle: 360, center: { x: 0, y: 0, z: 10 } })
    const all = objs()
    expect(all).toHaveLength(6)
    all.forEach((o, i) => {
      const a = (i * 60 * Math.PI) / 180
      // поворот вокруг +Y: x' = x·cos + z·sin, z' = −x·sin + z·cos (относительно центра)
      expect(box(o).c).toEqual([r2(20 * Math.cos(a)), 0, r2(10 - 20 * Math.sin(a))])
      expect(r2(o.transform.rotY)).toBe(i * 60)
      expect(r2(Math.hypot(o.transform.x, o.transform.z - 10))).toBe(20)
    })
    // ориентация — с позицией: на 90° брусок вдоль Z (размер 4 × 4 × 30)
    expect(box(all[0]).s).toEqual([30, 4, 4])
    const q = objs().find((o) => r2(o.transform.rotY) === 120)!
    expect(box(q).s[1]).toBe(4)
    expect(q.transform.rotX).toBe(0)
  })

  it('undo — массив целиком; redo — снова; перестроение без снимков — те же объекты', async () => {
    await st().addShape('cube', undefined, AT(0))
    await st().addShape('sphere', undefined, AT(0, 40))
    st().selectObjects(Object.keys(st().objects), false)
    await st().arraySelected({ kind: 'linear', axis: 'Y', count: 4, step: 25 })
    expect(objs()).toHaveLength(8)
    const after = Object.fromEntries(objs().map((o) => [o.id, box(o).c]))
    await st().undo()
    expect(objs()).toHaveLength(2)
    await st().redo()
    expect(Object.fromEntries(objs().map((o) => [o.id, box(o).c]))).toEqual(after)
    clearSnapshots(); clearTree()
    const rebuilt = await rebuildFromHistory(st().operations)
    expect(Object.fromEntries(Object.values(rebuilt).map((o) => [o.id, box(o).c]))).toEqual(after)
  })

  it('.3dtc: шаг массива (параметры и копии) — тот же; перестроение из файла — те же объекты', async () => {
    await st().addShape('cylinder', undefined, AT(30))
    st().selectObjects(Object.keys(st().objects), false)
    await st().arraySelected({ kind: 'circular', axis: 'Z', count: 4, angle: 360, center: { x: 0, y: 0, z: 0 } })
    const doc = await parse3dtc(await serialize3dtc({ objects: st().objects, operations: st().operations, operationsTrimmed: false }))
    const op = doc.operations.at(-1) as ArrayOperation
    expect(op.params).toEqual({ kind: 'circular', axis: 'Z', count: 4, angle: 360, center: { x: 0, y: 0, z: 0 } })
    expect(op.ops).toHaveLength(3)
    clearSnapshots(); clearTree()
    const rebuilt = await rebuildFromHistory(doc.operations)
    expect(Object.values(rebuilt).map((o) => box(o).c)).toEqual([[30, 0, 10], [0, 30, 10], [-30, 0, 10], [0, -30, 10]])
  })

  it('CSG: копии — независимые CSG со своим деревом (система создания есть), .3dtc с мешами копий', async () => {
    await st().addShape('cube', { width: 20, height: 20, depth: 20 }, AT(0))
    await st().addShape('sphere', { radius: 8, segments: 24 }, AT(10))
    st().selectObjects(Object.keys(st().objects), false)
    await st().csgBoolean('subtract')
    const [csg] = Object.keys(st().objects)
    st().selectObjects([csg], false)
    await st().arraySelected({ kind: 'linear', axis: 'X', count: 3, step: 30 })
    const copies = Object.keys(st().objects).filter((id) => id !== csg)
    expect(copies).toHaveLength(2)
    for (const id of copies) {
      expect(st().objects[id].shapeType).toBe('csg')
      expect(getNode(id)?.type).toBe('boolean')
      expect(findCreationTransform(st().operations, id)).not.toBeNull()
      expect(st().objects[id].indices.length).toBe(st().objects[csg].indices.length)
    }
    const doc = await parse3dtc(await serialize3dtc({ objects: st().objects, operations: st().operations, operationsTrimmed: false }))
    const op = doc.operations.at(-1) as ArrayOperation
    expect(op.ops.every((o) => o.type === 'group' && Array.isArray(o.resultVertices))).toBe(true)
  })

  it('слишком много копий — уведомление, шага нет; пустое выделение — ничего', async () => {
    await st().addShape('cube', undefined, AT(0))
    await st().addShape('cube', undefined, AT(30))
    const n = st().operations.length
    expect(await st().arraySelected({ kind: 'linear', axis: 'X', count: 3, step: 20 })).toBe(false)
    st().selectObjects(Object.keys(st().objects), false)
    // 2 исходных × 99 копий = 198 ≤ 500 — можно; предел проверяем на 6 исходных × 99
    for (let i = 0; i < 4; i++) await st().addShape('cube', undefined, AT(60 + 30 * i))
    st().selectObjects(Object.keys(st().objects), false)
    expect(await st().arraySelected({ kind: 'linear', axis: 'X', count: 100, step: 20 })).toBe(false)
    expect(st().operations).toHaveLength(n + 4)
    expect(useNotifications.getState().notifications.map((x) => x.message)).toContain(i18n.t('array.tooMany', { max: ARRAY_MAX_NEW_OBJECTS }))
  })
})

describe('ARRAY-TOOL — окно «Массив»', () => {
  it('линейный по умолчанию: шаг = размер по оси + 5; ось Y — шаг по Y; «Создать» — массив, окно закрывается', async () => {
    await st().addShape('cube', { width: 10, height: 16, depth: 10 }, AT(0))
    st().selectObjects(Object.keys(st().objects), false)
    let closed = false
    host = document.body.appendChild(document.createElement('div'))
    root = createRoot(host)
    act(() => root!.render(<ArrayModal onClose={() => { closed = true }} />))
    const step = () => host.querySelector<HTMLInputElement>('#array-step')!.value
    expect(step()).toBe('15.0')
    act(() => host.querySelector<HTMLButtonElement>('[data-testid=array-axis-Y]')!.click())
    expect(step()).toBe('21.0')
    act(() => host.querySelector<HTMLButtonElement>('[data-testid=array-kind-circular]')!.click())
    expect(host.querySelector('[data-testid=array-axis-Z]')!.getAttribute('aria-checked')).toBe('true')
    expect(host.querySelector<HTMLInputElement>('#array-count')!.value).toBe('6')
    act(() => host.querySelector<HTMLButtonElement>('[data-testid=array-kind-linear]')!.click())
    await act(async () => { host.querySelector<HTMLButtonElement>('[data-testid=array-create]')!.click() })
    await vi.waitFor(() => expect(closed).toBe(true))
    expect(objs()).toHaveLength(3)
    expect(useUiStore.getState().showArray).toBe(false)
  })
})
