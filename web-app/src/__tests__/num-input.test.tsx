// ============================================================
// num-input.test.tsx — UX-NUMINPUT: «-0.0» в поле и уникальные id полей панели свойств
// ============================================================

import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest'
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import i18n from '../i18n'
import NumInput, { formatNum } from '../components/NumInput'
import PropertiesPanel from '../components/PropertiesPanel'
import type { SceneObject, ShapeParams, ShapeType } from '../csg/types'

beforeAll(async () => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
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

/** Изменить значение контролируемого input так, чтобы React увидел событие. */
function typeInto(input: HTMLInputElement, text: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  act(() => {
    setter.call(input, text)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

describe('formatNum / NumInput — без «-0.0»', () => {
  it('ноль после округления показывается без минуса (с точностью поля), прочее — как раньше', () => {
    expect(formatNum(-0, 1)).toBe('0.0')
    expect(formatNum(-0.00001, 1)).toBe('0.0')
    expect(formatNum(-0.00001, 3)).toBe('0.000')
    expect(formatNum(-0.04, 1)).toBe('0.0')                           // округляется к нулю — без минуса
    expect(formatNum(-0.04, 2)).toBe('-0.04')
    expect(formatNum(-0.00001, 0)).toBe('0')
    expect(formatNum(-2.5, 1)).toBe('-2.5')
    expect(formatNum(8, 1)).toBe('8.0')
  })

  it('поле со значением −1e-6 показывает 0.0; ввод «-0» + blur → onChange(+0)', () => {
    const onChange = vi.fn()
    const h = mount(<NumInput label="X" value={-1e-6} onChange={onChange} />)
    const input = h.querySelector('input')!
    expect(input.value).toBe('0.0')
    typeInto(input, '-0')
    act(() => { input.focus(); input.blur() })
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(Object.is(onChange.mock.calls[0][0], 0)).toBe(true)
  })

  it('id по умолчанию — num-input-<label>; явный id связывает <label> с полем', () => {
    const h = mount(<><NumInput label="X" value={1} onChange={vi.fn()} /><NumInput id="num-input-scale-X" label="X" value={2} onChange={vi.fn()} /></>)
    const [a, b] = Array.from(h.querySelectorAll('input'))
    expect(a.id).toBe('num-input-X')
    expect(b.id).toBe('num-input-scale-X')
    const labels = Array.from(h.querySelectorAll('label'))
    expect(labels.map((l) => l.htmlFor)).toEqual(['num-input-X', 'num-input-scale-X'])
  })
})

function obj(shapeType: ShapeType, params: ShapeParams): SceneObject {
  return {
    id: 'o1', shapeType, params, color: '#89b4fa', visible: true, locked: false,
    transform: { x: 1, y: 2, z: 3, rotX: 10, rotY: 20, rotZ: 30, scaleX: 1, scaleY: 1, scaleZ: 1 },
    vertices: new Float32Array(9), indices: new Uint32Array([0, 1, 2]),
  }
}

describe('PropertiesPanel — уникальные id полей (UX-NUMINPUT)', () => {
  for (const [type, params] of [
    ['cube', { width: 20, height: 20, depth: 20 }],
    ['cylinder', { radius: 10, height: 20 }],
    ['torus', { torusRadius: 15, tubeRadius: 4 }],
    ['prism', { radius: 12, height: 20, sides: 6 }],
  ] as Array<[ShapeType, ShapeParams]>) {
    it(`${type}: id полей уникальны, каждая <label> указывает на поле своей строки`, () => {
      const o = obj(type, params)
      const noop = (): void => {}
      const h = mount(
        <PropertiesPanel
          firstSelected={o} busy={false} selectedIds={[o.id]} canResize canCsg={false} canAlign={false}
          objectList={[o]} operationsLength={1} fileName={null} currentProjectId={null} currentProjectName={null} modified={false}
          onMoveAxis={noop} onRotAxis={noop} onScaleAxis={noop} onResizeDim={noop} onResizeObject={noop}
          onCsg={noop} onAlign={noop} onSetColor={noop} onToggleVisible={noop} onShowProjects={noop} onSaveToProject={noop}
        />,
      )
      const inputs = Array.from(h.querySelectorAll<HTMLInputElement>('input.props-input'))
      expect(inputs.length).toBeGreaterThanOrEqual(9)                       // позиция 3 + поворот 3 + масштаб 3 (+ размеры)
      const ids = inputs.map((i) => i.id)
      expect(new Set(ids).size).toBe(ids.length)
      for (const label of Array.from(h.querySelectorAll<HTMLLabelElement>('label.props-label'))) {
        const target = document.getElementById(label.htmlFor)
        expect(target, label.htmlFor).not.toBeNull()
        expect(target!.closest('.props-row')).toBe(label.closest('.props-row'))
      }
      // позиция, поворот и масштаб — разные поля с ожидаемыми значениями
      const val = (id: string) => h.querySelector<HTMLInputElement>(`#${id}`)!.value
      expect([val('num-input-pos-X'), val('num-input-rot-X'), val('num-input-scale-X')]).toEqual(['1.0', '10.0', '1.0'])
      expect(val('num-input-pos-Z')).toBe('3.0')
      expect(val('num-input-rot-Z')).toBe('30.0')
    })
  }
})
