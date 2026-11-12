// ============================================================
// lock-object.test.tsx — LOCK-OBJECT: блокировка объекта (настоящий WASM — worker-bridge)
// ============================================================
// Замок — шаг истории `lock` (как видимость): undo / redo, перестроение без снимков, .3dtc.
// Заблокированный: не двигается, не меняет размеры, не удаляется, не идёт в CSG (уведомление);
// снять — тем же действием. UI: замок в дереве и панели свойств, поля трансформа отключены.

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
import { useNotifications } from '../store/notifications'
import { serialize3dtc, parse3dtc } from '../io/3dtc-io'
import { opLabel, filterKeyOf } from '../components/Timeline'
import ComponentTree from '../components/ComponentTree'
import PropertiesPanel from '../components/PropertiesPanel'
import type { TransformNR } from '../csg/types'

const st = () => useDocumentStore.getState()
const AT = (x: number): TransformNR => ({ x, y: 0, z: 10, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 })
const notes = () => useNotifications.getState().notifications.map((n) => n.message)
let root: Root | null = null
let host: HTMLDivElement
afterEach(() => { if (root) act(() => root!.unmount()); root = null; host?.remove() })

beforeEach(async () => {
  await i18n.changeLanguage('ru')
  useDocumentStore.setState({ objects: {}, operations: [], historyIndex: 0, selectedIds: [], busy: false })
  useNotifications.setState({ notifications: [] })
  clearSnapshots(); clearTree()
  await st().addShape('cube', undefined, AT(0))
  await st().addShape('sphere', undefined, AT(40))
})
const ids = () => Object.keys(st().objects)

describe('LOCK-OBJECT — модель', () => {
  it('замок — шаг «Заблокировать» / «Разблокировать»; undo / redo; перестроение без снимков; .3dtc', async () => {
    const [a] = ids()
    st().toggleLocked(a)
    expect(st().objects[a].locked).toBe(true)
    const op = st().operations.at(-1)!
    expect(op).toEqual({ type: 'lock', ids: [a], locked: true })
    expect(opLabel(op, i18n.t.bind(i18n))).toBe('Заблокировать')
    expect(filterKeyOf(op)).toBe('lock')
    await st().undo()
    expect(st().objects[a].locked).toBe(false)
    await st().redo()
    expect(st().objects[a].locked).toBe(true)
    expect((await rebuildFromHistory(st().operations))[a].locked).toBe(true)
    const doc = await parse3dtc(await serialize3dtc({ objects: st().objects, operations: st().operations, operationsTrimmed: false }))
    expect(doc.operations.at(-1)).toEqual(op)
    st().toggleLocked(a)
    expect(st().objects[a].locked).toBe(false)
    expect(opLabel(st().operations.at(-1)!, i18n.t.bind(i18n))).toBe('Разблокировать')
  })

  it('заблокированный не двигается и не меняет размеры (уведомление, шага нет)', async () => {
    const [a] = ids()
    st().toggleLocked(a)
    const n = st().operations.length
    await st().moveObject(a, { ...st().objects[a].transform, x: 99 })
    await st().resizeObject(a, { width: 50 })
    expect(st().objects[a].transform.x).toBe(0)
    expect(st().objects[a].params.width).not.toBe(50)
    expect(st().operations).toHaveLength(n)
    expect(notes()).toContain(i18n.t('lock.cantMove'))
  })

  it('удаление: заблокированный остаётся, остальные выбранные удаляются', async () => {
    const [a, b] = ids()
    st().toggleLocked(a)
    st().selectObjects([a, b], false)
    await st().deleteSelected()
    expect(ids()).toEqual([a])
    expect(notes()).toContain(i18n.t('lock.cantDelete'))
  })

  it('CSG с заблокированным — отказ; после снятия замка — работает', async () => {
    const [a, b] = ids()
    st().toggleLocked(b)
    st().selectObjects([a, b], false)
    await st().csgBoolean('union')
    expect(ids()).toEqual([a, b])
    expect(notes()).toContain(i18n.t('lock.cantCsg'))
    st().toggleLocked(b)
    st().selectObjects([a, b], false)
    await st().csgBoolean('union')
    expect(Object.values(st().objects).map((o) => o.shapeType)).toEqual(['csg'])
  })
})

describe('LOCK-OBJECT — интерфейс', () => {
  it('дерево: замок в строке — переключает; удалить заблокированный — кнопка отключена', () => {
    const [a] = ids()
    const toggled: string[] = []
    host = document.body.appendChild(document.createElement('div'))
    root = createRoot(host)
    const render = () => act(() => root!.render(
      <ComponentTree objects={Object.values(st().objects)} selectedIds={new Set()} onSelect={() => { }} onRename={() => { }} onToggleVis={() => { }} onDelete={() => { }} onToggleLock={(id) => { toggled.push(id); st().toggleLocked(id) }} />,
    ))
    render()
    const row = () => host.querySelector(`.ct-item[data-object-id="${a}"]`)!
    act(() => { row().querySelector<HTMLButtonElement>('[data-testid=obj-lock]')!.click() })
    render()
    expect(toggled).toEqual([a])
    expect(row().querySelector('[data-testid=obj-lock]')!.getAttribute('aria-pressed')).toBe('true')
    expect(row().querySelector<HTMLButtonElement>('.ct-del')!.disabled).toBe(true)
  })

  it('панель свойств: «Заблокирован — Да», поля позиции и размеров отключены', () => {
    const [a] = ids()
    st().toggleLocked(a)
    host = document.body.appendChild(document.createElement('div'))
    root = createRoot(host)
    const noop = () => { }
    act(() => root!.render(
      <PropertiesPanel firstSelected={st().objects[a]} busy={false} selectedIds={[a]} canResize canCsg={false} objectList={Object.values(st().objects)} operationsLength={1}
        fileName={null} currentProjectId={null} currentProjectName={null} modified={false} onMoveAxis={noop} onRotAxis={noop} onScaleAxis={noop} onResizeDim={noop}
        onResizeObject={noop} onCsg={noop} onSetColor={noop} onToggleVisible={noop} onToggleLocked={noop} onShowProjects={noop} onSaveToProject={noop} />,
    ))
    expect(host.querySelector('[data-testid=props-lock]')!.getAttribute('aria-pressed')).toBe('true')
    expect(host.querySelector<HTMLInputElement>('#num-input-pos-X')!.disabled).toBe(true)
    expect(host.querySelector<HTMLInputElement>('#num-input-size-X')!.disabled).toBe(true)
  })
})
