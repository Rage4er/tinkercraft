// ============================================================
// fillet-parametric-ui.test.tsx — FILLET-PARAMETRIC-UI: шаги B-Rep в панели свойств
// ============================================================
// Объект с brepChain (2 шага) → PropertiesPanel показывает список шагов
// (тип, рёбра, размер); правка размера вызывает editStepParams с сырым
// индексом шага → пересборка цепочки (edit_step fillet_brep).

import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest'
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import i18n from '../i18n'
import PropertiesPanel from '../components/PropertiesPanel'
import { useDocumentStore } from '../store/document-store'
import type { SceneObject, TinkerCraftOperation } from '../csg/types'

beforeAll(async () => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  await i18n.changeLanguage('ru')
})

let root: Root | null = null
let host: HTMLDivElement | null = null
afterEach(() => {
  if (root) act(() => root!.unmount())
  root = null; host?.remove(); host = null
})

const noop = (): void => {}

const obj = (): SceneObject => ({
  id: 'obj_1',
  name: 'Скругление: Куб',
  shapeType: 'import_mesh',
  params: {},
  color: '#89b4fa',
  transform: { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 },
  visible: true,
  locked: false,
  vertices: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
  indices: new Uint32Array([0, 1, 2]),
  brepChain: {
    base: { shapeType: 'cube', params: { width: 20, height: 20, depth: 20 } },
    steps: [
      { kind: 'fillet', size: 2, edgeIndexes: [2] },
      { kind: 'chamfer', size: 1.5, edgeIndexes: [6, 8] },
    ],
  },
})

const ops = (): TinkerCraftOperation[] => [
  { type: 'add_shape', id: 'obj_1', shapeType: 'cube', params: { width: 20, height: 20, depth: 20 }, color: '#89b4fa', transform: { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 } },
  { type: 'fillet_brep', id: 'obj_1', name: 'Скругление: Куб', color: '#89b4fa', transform: { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 }, kind: 'fillet', size: 2, edgeIndexes: [2], base: { shapeType: 'cube', params: { width: 20 } }, resultVertices: [], resultIndices: [] },
  { type: 'fillet_brep', id: 'obj_1', name: 'Фаска: Куб', color: '#89b4fa', transform: { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 }, kind: 'chamfer', size: 1.5, edgeIndexes: [6, 8], base: { shapeType: 'cube', params: { width: 20 } }, resultVertices: [], resultIndices: [] },
]

function renderPanel(): void {
  host = document.body.appendChild(document.createElement('div'))
  root = createRoot(host)
  act(() => {
    root!.render(
      <PropertiesPanel
        firstSelected={obj()} busy={false} selectedIds={['obj_1']} canResize canCsg
        objectList={[obj()]} operationsLength={3} fileName={null}
        currentProjectId={null} currentProjectName={null} modified={false}
        onMoveAxis={noop} onRotAxis={noop} onScaleAxis={noop} onResizeDim={noop}
        onResizeObject={noop} onCsg={noop} onSetColor={noop} onToggleVisible={noop}
        onShowProjects={noop} onSaveToProject={noop}
      />,
    )
  })
}

const commit = (input: HTMLInputElement, value: string) => {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  act(() => {
    setter.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  act(() => { input.dispatchEvent(new FocusEvent('focusout', { bubbles: true })) })
}

describe('PropertiesPanel — шаги B-Rep цепочки', () => {
  it('объект с brepChain: два шага, тип, рёбра и размеры', () => {
    useDocumentStore.setState({ operations: ops(), historyIndex: 3 })
    renderPanel()
    expect(host!.querySelector('[data-testid=brep-chain-panel]')).toBeTruthy()
    expect(host!.querySelectorAll('[data-testid^=brep-chain-step-]').length).toBe(2)
    const inputs = host!.querySelectorAll<HTMLInputElement>('[data-testid=brep-chain-panel] input')
    expect(inputs.length).toBe(2)
    expect(Number(inputs[0].value)).toBe(2)
    expect(Number(inputs[1].value)).toBe(1.5)
    const text = host!.querySelector('[data-testid=brep-chain-panel]')!.textContent ?? ''
    expect(text).toContain('Скругление')
    expect(text).toContain('Фаска')
    expect(text).toContain('7, 9')       // рёбра (индексы +1)
  })

  it('правка размера первого шага → editStepParams(1, fillet_brep 3)', () => {
    useDocumentStore.setState({ operations: ops(), historyIndex: 3 })
    const calls: Array<{ index: number; patch: unknown }> = []
    const real = useDocumentStore.getState().editStepParams
    useDocumentStore.setState({
      editStepParams: async (index, patch) => { calls.push({ index, patch }); return true },
    })
    renderPanel()
    const input = host!.querySelectorAll<HTMLInputElement>('[data-testid=brep-chain-panel] input')[0]
    commit(input, '3')
    expect(calls).toEqual([{ index: 1, patch: { kind: 'fillet_brep', size: 3 } }])
    useDocumentStore.setState({ editStepParams: real })
  })
})
