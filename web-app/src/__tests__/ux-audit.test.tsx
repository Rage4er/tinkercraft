// ============================================================
// ux-audit.test.tsx — UX-AUDIT (v1.3.2): найденные UX-баги, зафиксированные тестами
// ============================================================
// Баги НЕ чинятся в этой задаче. На каждый баг — пара тестов:
//  - `it.fails('UX-AUDIT-N ожидание: …')` — что ждёт пользователь; сейчас НЕ выполняется,
//    поэтому тест «проходит, пока баг есть». Когда баг починят, он станет красным —
//    тогда заменить `it.fails` на `it`.
//  - `it('UX-AUDIT-N реальность: …')` — точное текущее поведение (страховка: `it.fails`
//    засчитал бы и падение из-за ошибки в самом тесте). После фикса — удалить/перевернуть.
// Описание, приоритет и шаги — DEVELOPMENT_PLAN.md › «UX-AUDIT (v1.3.2)».
// Браузерные баги (UX-AUDIT-1, -3 в UI, -5) — e2e/ux-audit.mjs.

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'

vi.mock('../csg/worker-client', async () => {
  const bridge = await import('./worker-bridge')
  return {
    workerBuildShape: bridge.workerBuildShape,
    workerBuildImportedMesh: bridge.workerBuildImportedMesh,
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

import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js'
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js'
import fontData from 'three/examples/fonts/helvetiker_regular.typeface.json'
import i18n from '../i18n'
import NumInput from '../components/NumInput'
import PropertiesPanel from '../components/PropertiesPanel'
import { useDocumentStore } from '../store/document-store'
import { useNotifications } from '../store/notifications'
import { clearSnapshots } from '../store/snapshots'
import { clearTree } from '../csg/history-tree'
import type { SceneObject, ShapeParams, ShapeType, TransformNR } from '../csg/types'

const st = () => useDocumentStore.getState()
const ID: TransformNR = { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 }
const at = (x: number, y = 0, z = 0): TransformNR => ({ ...ID, x, y, z })
const notes = () => useNotifications.getState().notifications

beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})
beforeEach(async () => {
  useDocumentStore.setState({ objects: {}, operations: [], historyIndex: 0, selectedIds: [], busy: false, modified: false })
  useNotifications.setState({ notifications: [] })
  clearSnapshots(); clearTree()
  await i18n.changeLanguage('ru')
})

let root: Root | null = null
let host: HTMLDivElement | null = null
function mount(el: React.ReactElement): HTMLDivElement {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => root!.render(el))
  return host
}
afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = null; host = null
})

async function shape(type: ShapeType, params: ShapeParams, t: TransformNR): Promise<string> {
  const before = new Set(Object.keys(st().objects))
  await st().addShape(type, params)
  const id = Object.keys(st().objects).find((k) => !before.has(k))!
  await st().moveObject(id, t)
  return id
}

/**
 * 3D-текст ровно как в App.handleAddText: TextGeometry (без фаски) → позиции как есть,
 * индексы — `geo.index` или 0..n-1 → addRawMesh(`Текст: …`). Конвертация живёт в App
 * (не экспортируется), поэтому повторена здесь — при её изменении обновить.
 */
async function addText(text: string): Promise<string> {
  const font = new FontLoader().parse(fontData as unknown as Parameters<FontLoader['parse']>[0])
  const geo = new TextGeometry(text, { font, size: 10, depth: 5, curveSegments: 4, bevelEnabled: false })
  const pos = geo.attributes.position
  const vertices = Array.from(pos.array as Float32Array)
  const indices = geo.index ? Array.from(geo.index.array).map(Number) : Array.from({ length: pos.count }, (_, i) => i)
  const before = new Set(Object.keys(st().objects))
  await st().addRawMesh(`Текст: ${text}`, vertices, indices)
  return Object.keys(st().objects).find((k) => !before.has(k))!
}

describe('UX-AUDIT-2 — «Очистить сцену» без подтверждения и без отмены', () => {
  async function scene(): Promise<void> {
    await shape('cube', { width: 20, height: 20, depth: 20 }, at(0))
    await shape('sphere', { radius: 8, segments: 16 }, at(30))
  }
  it.fails('ожидание: после «Очистить сцену» Ctrl+Z возвращает объекты', async () => {
    await scene()
    await st().clearScene()
    await st().undo()
    expect(Object.keys(st().objects)).toHaveLength(2)
  })
  it('реальность: объекты, история и признак «не сохранено» стёрты — отменять нечего', async () => {
    await scene()
    expect(st().modified).toBe(true)
    await st().clearScene()
    expect(Object.keys(st().objects)).toHaveLength(0)
    expect(st().operations).toHaveLength(0)
    expect(st().historyIndex).toBe(0)
    expect(st().modified).toBe(false)                      // «● Не сохранено» пропадает при потере работы
    await st().undo()
    expect(Object.keys(st().objects)).toHaveLength(0)
  })
})

describe('UX-AUDIT-3 — 3D-текст нельзя использовать в CSG', () => {
  it.fails('ожидание: куб − текст «A» (гравировка) — CSG выполняется', async () => {
    const cube = await shape('cube', { width: 20, height: 20, depth: 20 }, at(0))
    const txt = await addText('A')
    await st().moveObject(txt, { ...st().objects[txt].transform, x: 0, y: 0, z: 8 })
    st().selectObjects([cube, txt], false)
    await st().csgBoolean('subtract')
    expect(Object.keys(st().objects)).toHaveLength(1)
    expect(notes().filter((n) => n.type !== 'info')).toEqual([])
  })
  it('реальность: меш текста — «суп» треугольников без общих вершин → отказ «меш не замкнут… Проверьте STL»', async () => {
    const font = new FontLoader().parse(fontData as unknown as Parameters<FontLoader['parse']>[0])
    const geo = new TextGeometry('A', { font, size: 10, depth: 5, curveSegments: 4, bevelEnabled: false })
    expect(geo.index).toBeNull()                           // неиндексированная геометрия → индексы 0..n-1, без сварки
    const cube = await shape('cube', { width: 20, height: 20, depth: 20 }, at(0))
    const txt = await addText('A')
    st().selectObjects([cube, txt], false)
    await st().csgBoolean('subtract')
    expect(Object.keys(st().objects)).toHaveLength(2)
    expect(notes().at(-1)?.message).toBe(i18n.t('errors.csgNonManifold'))
    expect(i18n.t('errors.csgNonManifold')).toContain('STL')   // подсказка про STL, хотя это текст
  })
})

describe('UX-AUDIT-4 — пустой результат CSG создаётся молча', () => {
  async function disjoint(): Promise<[string, string]> {
    const a = await shape('cube', { width: 20, height: 20, depth: 20 }, at(0))
    const b = await shape('sphere', { radius: 8, segments: 16 }, at(40))
    st().selectObjects([a, b], false)
    return [a, b]
  }
  it.fails('ожидание: пересечение непересекающихся — уведомление «результат пуст», объекты не тронуты', async () => {
    const [a, b] = await disjoint()
    await st().csgBoolean('intersect')
    expect(Object.keys(st().objects).sort()).toEqual([a, b].sort())
    expect(notes().some((n) => n.type === 'warning' || n.type === 'info')).toBe(true)
  })
  it('реальность: появляется «CSG результат» с 0 треугольников и шаг истории, без уведомлений', async () => {
    await disjoint()
    const n = st().operations.length
    await st().csgBoolean('intersect')
    const objs = Object.values(st().objects)
    expect(objs).toHaveLength(1)
    expect(objs[0].shapeType).toBe('csg')
    expect(objs[0].indices.length).toBe(0)
    expect(st().operations).toHaveLength(n + 1)
    expect(notes()).toEqual([])
  })
})

describe('UX-AUDIT-6 — 3D-текст в дереве называется «Импорт»', () => {
  it.fails('ожидание: объект текста носит имя «Текст: Hi»', async () => {
    const id = await addText('Hi')
    expect(st().objects[id].name).toBe('Текст: Hi')
  })
  it('реальность: имя есть только в операции истории, у объекта — нет (дерево показывает «Импорт N»)', async () => {
    const id = await addText('Hi')
    expect(st().objects[id].name).toBeUndefined()
    expect(st().objects[id].shapeType).toBe('import_mesh')
    const op = st().operations.at(-1) as { type: string; name?: string }
    expect(op).toMatchObject({ type: 'import_mesh', name: 'Текст: Hi' })
  })
})

describe('UX-AUDIT-7 — в английском интерфейсе единица «мм»', () => {
  it.fails('ожидание: en — единица поля «mm»', async () => {
    await i18n.changeLanguage('en')
    const h = mount(<NumInput label="X" value={1} onChange={() => {}} />)
    expect(h.querySelector('.num-label')!.textContent).toBe('mm')
  })
  it('реальность: en — «мм» (значение по умолчанию NumInput зашито по-русски)', async () => {
    await i18n.changeLanguage('en')
    const h = mount(<NumInput label="X" value={1} onChange={() => {}} />)
    expect(h.querySelector('.num-label')!.textContent).toBe('мм')
  })
})

describe('UX-AUDIT-8 — целое поле «Граней» показывается дробным', () => {
  const prism: SceneObject = {
    id: 'p1', shapeType: 'prism', params: { radius: 12, height: 20, sides: 6 }, color: '#94e2d5', visible: true, locked: false,
    transform: ID, vertices: new Float32Array(9), indices: new Uint32Array([0, 1, 2]),
  }
  const panel = () => {
    const noop = (): void => {}
    return mount(
      <PropertiesPanel
        firstSelected={prism} busy={false} selectedIds={[prism.id]} canResize canCsg={false}
        objectList={[prism]} operationsLength={1} fileName={null} currentProjectId={null} currentProjectName={null} modified={false}
        onMoveAxis={noop} onRotAxis={noop} onScaleAxis={noop} onResizeDim={noop} onResizeObject={noop}
        onCsg={noop} onSetColor={noop} onToggleVisible={noop} onShowProjects={noop} onSaveToProject={noop}
      />,
    )
  }
  const sidesValue = (h: HTMLElement) =>
    Array.from(h.querySelectorAll('.props-row')).find((r) => r.querySelector('.props-label')?.textContent === i18n.t('properties.sides'))!
      .querySelector('input')!.value
  it.fails('ожидание: «Граней 6»', () => {
    expect(sidesValue(panel())).toBe('6')
  })
  it('реальность: «Граней 6.0»', () => {
    expect(sidesValue(panel())).toBe('6.0')
  })
})
