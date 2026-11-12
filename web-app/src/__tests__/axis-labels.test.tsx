// ============================================================
// axis-labels.test.tsx — AXIS-LABELS: подписи размеров по осям (вверх — Z)
// ============================================================
// Было: у куба «Высота» меняла размер по Y, «Глубина» — по Z (`Manifold.cube([width, height, depth])`),
// а вертикаль вида — Z. Теперь подпись — по оси, которую поле меняет: X (ширина), Y (глубина),
// Z (высота); у цилиндра / конуса / призмы / пирамиды высота — Z. Ключи params прежние (файлы, история).
// Геометрия — настоящий WASM (worker-bridge): подпись поля сверяется с осью, по которой растёт меш.

import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import i18n from '../i18n'
import PropertiesPanel from '../components/PropertiesPanel'
import { getParamFields } from '../csg/child-params'
import { workerBuildShape } from './worker-bridge'
import type { SceneObject, ShapeParams, ShapeType, TransformNR } from '../csg/types'

const T: TransformNR = { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 }
const noop = () => { }
let root: Root | null = null
let host: HTMLDivElement

afterEach(() => { if (root) act(() => root!.unmount()); root = null; host?.remove() })
beforeAll(async () => { await i18n.changeLanguage('ru') })

function obj(shapeType: ShapeType, params: ShapeParams): SceneObject {
  return { id: 'obj_1', shapeType, params, color: '#89b4fa', transform: { ...T }, visible: true, locked: false, vertices: new Float32Array(9), indices: new Uint32Array(3) }
}
/** Поля группы «Размеры» панели свойств: подпись → id; onResizeDim / onResizeObject — что меняет поле. */
function renderDims(o: SceneObject) {
  const calls: Array<[string, number]> = []
  host = document.body.appendChild(document.createElement('div'))
  root = createRoot(host)
  act(() => {
    root!.render(
      <PropertiesPanel
        firstSelected={o} busy={false} selectedIds={[o.id]} canResize canCsg={false} objectList={[o]} operationsLength={1}
        fileName={null} currentProjectId={null} currentProjectName={null} modified={false}
        onMoveAxis={noop} onRotAxis={noop} onScaleAxis={noop}
        onResizeDim={(dim, v) => calls.push([dim, v])}
        onResizeObject={(_id, p) => { for (const [k, v] of Object.entries(p)) calls.push([k, v as number]) }}
        onCsg={noop} onSetColor={noop} onToggleVisible={noop} onShowProjects={noop} onSaveToProject={noop}
      />,
    )
  })
  const group = [...host.querySelectorAll('.csg-group')].find((g) => g.querySelector('.csg-group-title')?.textContent === i18n.t('properties.dimensions', { unit: i18n.t('units.mm') }))!
  const labels = [...group.querySelectorAll('.props-label')].map((l) => l.textContent)
  const set = (label: string, v: number) => {
    const id = [...group.querySelectorAll('.props-label')].find((l) => l.textContent === label)!.getAttribute('for')!
    const input = document.getElementById(id) as HTMLInputElement
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    act(() => { input.focus() })
    act(() => { setter.call(input, String(v)); input.dispatchEvent(new Event('input', { bubbles: true })) })
    act(() => { input.blur() })                                   // коммит поля — по уходу (как Enter)
    return calls.at(-1)
  }
  return { labels, set }
}
/** Размер меша по осям (WASM). */
async function extents(shapeType: ShapeType, params: ShapeParams) {
  const m = await workerBuildShape('axis_' + shapeType, shapeType, params, T)
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < m.vertices.length; i += 3) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], m.vertices[i + k]); max[k] = Math.max(max[k], m.vertices[i + k]) }
  return { X: max[0] - min[0], Y: max[1] - min[1], Z: max[2] - min[2] }
}

describe('AXIS-LABELS — панель свойств', () => {
  it('куб: X (ширина), Y (глубина), Z (высота) — по порядку; «Z (высота)» меняет depth', () => {
    const { labels, set } = renderDims(obj('cube', { width: 20, height: 20, depth: 20 }))
    expect(labels).toEqual(['X (ширина)', 'Y (глубина)', 'Z (высота)'])
    expect(labels).not.toContain('Высота')
    expect(set('X (ширина)', 11)).toEqual(['width', 11])
    expect(set('Y (глубина)', 12)).toEqual(['height', 12])
    expect(set('Z (высота)', 13)).toEqual(['depth', 13])
  })

  it.each([['cylinder', { radius: 10, height: 30 }], ['cone', { radius: 10, height: 24 }], ['prism', { radius: 12, height: 20, sides: 6 }], ['pyramid', { radius: 12, height: 20, sides: 4 }]] as const)(
    '%s: высота — «Z (высота)», меняет height', (shape, params) => {
      const { labels, set } = renderDims(obj(shape, { ...params }))
      expect(labels).toContain('Z (высота)')
      expect(labels).not.toContain('Высота')
      expect(set('Z (высота)', 33)).toEqual(['height', 33])
    })

  it('английский: Width (X), Depth (Y), Height (Z)', async () => {
    await i18n.changeLanguage('en')
    try {
      expect(renderDims(obj('cube', { width: 20, height: 20, depth: 20 })).labels).toEqual(['Width (X)', 'Depth (Y)', 'Height (Z)'])
    } finally { await i18n.changeLanguage('ru') }
  })
})

describe('AXIS-LABELS — подпись совпадает с осью геометрии (WASM)', () => {
  it('куб { width 10, height 20, depth 30 }: поле с подписью оси X / Y / Z задаёт размер меша по этой оси', async () => {
    const e = await extents('cube', { width: 10, height: 20, depth: 30 })
    expect(e.X).toBeCloseTo(10, 4); expect(e.Y).toBeCloseTo(20, 4); expect(e.Z).toBeCloseTo(30, 4)
    const byLabel = Object.fromEntries(getParamFields('cube').map((f) => [i18n.t(f.labelKey), f.key]))
    expect(byLabel).toEqual({ 'X (ширина)': 'width', 'Y (глубина)': 'height', 'Z (высота)': 'depth' })
  })

  it('цилиндр { height 40 }: «Z (высота)» — размер по Z (вертикаль вида)', async () => {
    const e = await extents('cylinder', { radius: 5, height: 40 })
    expect(e.Z).toBeCloseTo(40, 4)
    expect(i18n.t(getParamFields('cylinder').find((f) => f.key === 'height')!.labelKey)).toBe('Z (высота)')
  })

  it('панель ребёнка CSG — те же подписи (getParamFields)', () => {
    for (const shape of ['cylinder', 'cone', 'prism', 'pyramid'] as const) {
      expect(getParamFields(shape).find((f) => f.key === 'height')!.labelKey).toBe('properties.sizeZ')
    }
    expect(getParamFields('cube').map((f) => f.labelKey)).toEqual(['properties.sizeX', 'properties.sizeY', 'properties.sizeZ'])
  })
})
