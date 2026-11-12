// ============================================================
// sfx.test.tsx — SFX: какие события звучат, вкл. / выкл., громкость (настоящий WASM — worker-bridge)
// ============================================================

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
import { useDocumentStore } from '../store/document-store'
import { clearSnapshots } from '../store/snapshots'
import { clearTree } from '../csg/history-tree'
import { notify } from '../store/notifications'
import { useSettingsStore } from '../store/settings'
import { playSfx, setSfxBackend, resetSfxState, SFX_RECIPES, type SfxKind } from '../sfx'
import { useSfx, newOperation, sfxForOperation } from '../hooks/useSfx'
import type { TinkerCraftOperation } from '../csg/types'

const st = () => useDocumentStore.getState()
let played: Array<[SfxKind, number]> = []
let root: Root | null = null
let host: HTMLDivElement
function Harness() { useSfx(); return <button data-testid="b">ok</button> }

beforeEach(() => {
  localStorage.clear()
  useSettingsStore.getState().reset()
  resetSfxState()
  played = []
  setSfxBackend((k, v) => { played.push([k, v]) })
  useDocumentStore.setState({ objects: {}, operations: [], historyIndex: 0, selectedIds: [], busy: false })
  clearSnapshots(); clearTree()
  host = document.body.appendChild(document.createElement('div'))
  root = createRoot(host)
  act(() => root!.render(<Harness />))
})
afterEach(() => { act(() => root!.unmount()); root = null; host.remove(); setSfxBackend() })
const kinds = () => played.map((p) => p[0])

describe('useSfx — когда звучит', () => {
  it('клик по кнопке — click; по отключённой — тишина', () => {
    const b = host.querySelector<HTMLButtonElement>('[data-testid=b]')!
    act(() => { b.click() })
    expect(kinds()).toEqual(['click'])
    b.disabled = true; resetSfxState()
    act(() => { b.click() })
    expect(kinds()).toEqual(['click'])
  })

  it('фигура — create, CSG — success; отмена и повтор — без звука (WASM)', async () => {
    await st().addShape('cube'); await st().addShape('sphere')
    expect(kinds()).toEqual(['create', 'create'])
    st().selectObjects(Object.keys(st().objects), false)
    await st().csgBoolean('union')
    expect(kinds()).toEqual(['create', 'create', 'success'])
    await st().undo(); await st().redo()
    expect(kinds()).toEqual(['create', 'create', 'success'])
  })

  it('ошибка и предупреждение — error; сведения — тишина', () => {
    notify('x', 'info'); notify('y', 'warning')
    expect(kinds()).toEqual(['error'])
  })

  it('звуки выключены — тишина; громкость — в вывод звука', async () => {
    useSettingsStore.getState().setSound({ enabled: false })
    await st().addShape('cube')
    expect(played).toEqual([])
    useSettingsStore.getState().setSound({ enabled: true, volume: 0.8 })
    await st().addShape('cube')
    expect(played).toEqual([['create', 0.8]])
    useSettingsStore.getState().setSound({ volume: 0 })
    await st().addShape('cube')
    expect(played).toHaveLength(1)
  })
})

describe('playSfx / newOperation', () => {
  it('один звук не чаще 40 мс; data-sfx-last / data-sfx-count для e2e', () => {
    expect(playSfx('click', 1000)).toBe(true)
    expect(playSfx('click', 1020)).toBe(false)
    expect(playSfx('click', 1050)).toBe(true)
    expect(document.documentElement.dataset.sfxLast).toBe('click')
    expect(document.documentElement.dataset.sfxCount).toBe('2')
  })

  it('у каждого звука — рецепт (тоны)', () => {
    for (const k of ['click', 'create', 'success', 'error'] as const) expect(SFX_RECIPES[k].length).toBeGreaterThan(0)
  })

  it('новый шаг — дописан к истории; загрузка проекта и правка — не новый шаг; вставка нескольких — новый', () => {
    const a = { type: 'add_shape', id: 'a' } as unknown as TinkerCraftOperation
    const b = { type: 'add_shape', id: 'b' } as unknown as TinkerCraftOperation
    const p1 = { type: 'add_shape', id: 'p1', pasted: true } as unknown as TinkerCraftOperation
    const p2 = { type: 'add_shape', id: 'p2', pasted: true } as unknown as TinkerCraftOperation
    expect(newOperation({ operations: [a], historyIndex: 1 }, { operations: [a, b], historyIndex: 2 })).toBe(b)
    expect(newOperation({ operations: [a, b], historyIndex: 2 }, { operations: [a, b], historyIndex: 1 })).toBeNull()
    expect(newOperation({ operations: [], historyIndex: 0 }, { operations: [a, b], historyIndex: 2 })).toBeNull()  // загрузка
    expect(newOperation({ operations: [a], historyIndex: 1 }, { operations: [a, p1, p2], historyIndex: 3 })).toBe(p2)
    expect(sfxForOperation({ type: 'group', pasted: true } as unknown as TinkerCraftOperation)).toBe('create')
    expect(sfxForOperation({ type: 'move' } as unknown as TinkerCraftOperation)).toBeNull()
  })
})
