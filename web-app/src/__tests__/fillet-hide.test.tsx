// ============================================================
// fillet-hide.test.tsx — FILLET-HIDE: UI OCCT-скругления скрыт, код оставлен
// ============================================================
// Меню «Скругление / фаска» в тулбаре отсутствует; в панели свойств нет
// секции шагов B-Rep. Объекты с brepChain по-прежнему отображаются и не ломаются.

import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import i18n from '../i18n'
import Toolbar from '../components/Toolbar'
import PropertiesPanel from '../components/PropertiesPanel'
import { FILLET_OCCT_UI } from '../constants'
import { useDocumentStore } from '../store/document-store'
import type { SceneObject, TinkerCraftOperation } from '../csg/types'

beforeAll(async () => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  if (!('ResizeObserver' in globalThis)) {
    class RO { observe(): void {} unobserve(): void {} disconnect(): void {} }
    ;(globalThis as unknown as { ResizeObserver: typeof RO }).ResizeObserver = RO
  }
  await i18n.changeLanguage('ru')
})

let root: Root | null = null
let host: HTMLDivElement | null = null
afterEach(() => {
  if (root) act(() => root!.unmount())
  root = null; host?.remove(); host = null
})

const noop = (): void => {}

const objWithChain = (): SceneObject => ({
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
    steps: [{ kind: 'fillet', size: 2, edgeIndexes: [2] }],
  },
})

const ops = (): TinkerCraftOperation[] => [
  { type: 'add_shape', id: 'obj_1', shapeType: 'cube', params: { width: 20, height: 20, depth: 20 }, color: '#89b4fa', transform: { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 } },
  { type: 'fillet_brep', id: 'obj_1', name: 'Скругление: Куб', color: '#89b4fa', transform: { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 }, kind: 'fillet', size: 2, edgeIndexes: [2], base: { shapeType: 'cube', params: { width: 20 } }, resultVertices: [], resultIndices: [] },
]

describe('FILLET-HIDE', () => {
  it('в тулбаре нет меню «Скругление / фаска» (код BrepMenuButton оставлен)', async () => {
    expect(FILLET_OCCT_UI).toBe(false)
    host = document.body.appendChild(document.createElement('div'))
    root = createRoot(host)
    act(() => {
      root!.render(
        <Toolbar
          objectCount={1} selectedCount={1} canUndo canRedo hasCopied={false} busy={false} workerOk
          cameraMode="perspective" gizmoMode="translate" rulerActive={false} dimensionActive={false} dimensionsVisible
          canMirror canAlign canCsg canBrep
          onOpen={noop} onSave={noop} onExportStl={noop} onImportStl={noop} onShowProjects={noop}
          onUndo={noop} onRedo={noop} onCopy={noop} onPaste={noop} onDelete={noop}
          onFitView={noop} onResetView={noop} onToggleCamera={noop} onGizmo={noop} onToggleRuler={noop}
          onDimensionMode={noop} onDimensionSettings={noop} onToggleDimensions={noop}
          onMirror={noop} onPreviewMirror={noop} onPreviewMirrorEnd={noop}
          alignActive={false} onAlignMode={noop} onCsg={noop} onSettings={noop} onClearScene={noop}
        />,
      )
    })
    const names = Array.from(host.querySelectorAll('[role="toolbar"] button')).map((b) => b.getAttribute('aria-label'))
    expect(names).not.toContain('Скругление / фаска')
    expect(names.length).toBe(29)
  })

  it('в PropertiesPanel нет секции B-Rep, объект с brepChain отображается', () => {
    useDocumentStore.setState({ operations: ops(), historyIndex: 2 })
    host = document.body.appendChild(document.createElement('div'))
    root = createRoot(host)
    act(() => {
      root!.render(
        <PropertiesPanel
          firstSelected={objWithChain()} busy={false} selectedIds={['obj_1']} canResize canCsg
          objectList={[objWithChain()]} operationsLength={2} fileName={null}
          currentProjectId={null} currentProjectName={null} modified={false}
          onMoveAxis={noop} onRotAxis={noop} onScaleAxis={noop} onResizeDim={noop}
          onResizeObject={noop} onCsg={noop} onSetColor={noop} onToggleVisible={noop}
          onShowProjects={noop} onSaveToProject={noop}
        />,
      )
    })
    expect(host.querySelector('[data-testid=brep-chain-panel]')).toBeNull()
    expect(host.textContent).toContain('Скругление / фаска')   // тип объекта — не ломается
    expect(host.querySelector('#num-input-pos-X')).toBeTruthy()
  })
})
