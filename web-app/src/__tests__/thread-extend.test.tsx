import React, { useState } from 'react'
import { act } from 'react-dom/test-utils'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import ThreadModal from '../components/ThreadModal'
import i18n from '../i18n'

let root: Root | null = null
let host: HTMLDivElement

function Harness(): React.JSX.Element {
  const [allSizes, setAllSizes] = useState(false)
  const [sizeId, setSizeId] = useState('M6')
  return (
    <ThreadModal
      series="metric"
      sizeId={sizeId}
      length={20}
      kind="bolt"
      hand="right"
      starts={1}
      allSizes={allSizes}
      busy={false}
      workerOk
      onSeriesChange={() => undefined}
      onSizeChange={setSizeId}
      onLengthChange={() => undefined}
      onKindChange={() => undefined}
      onHandChange={() => undefined}
      onStartsChange={() => undefined}
      onAllSizesChange={setAllSizes}
      onCreate={() => undefined}
      onClose={() => undefined}
    />
  )
}

beforeEach(async () => {
  await i18n.changeLanguage('ru')
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  act(() => root!.render(<Harness />))
})

afterEach(() => {
  if (root) act(() => root!.unmount())
  root = null
  host.remove()
})

const select = <T extends HTMLElement>(id: string): T => host.querySelector(`[data-testid=${id}]`) as T

describe('THREAD-EXTEND — окно «Резьба»', () => {
  it('галочка «Все размеры» открывает M0.25…M600 и все шаги, снятие возвращает популярные', () => {
    const nominal = select<HTMLSelectElement>('thread-nominal')
    expect(nominal.options).toHaveLength(10)
    expect([...nominal.options].some((o) => o.value === 'M0.25')).toBe(false)

    const all = select<HTMLInputElement>('thread-all-sizes')
    act(() => { all.click() })
    expect(all.checked).toBe(true)
    expect(nominal.options.length).toBeGreaterThan(100)
    expect([...nominal.options].some((o) => o.value === 'M0.25')).toBe(true)
    expect([...nominal.options].some((o) => o.value === 'M600')).toBe(true)

    act(() => {
      nominal.value = 'M10'
      nominal.dispatchEvent(new Event('change', { bubbles: true }))
    })
    const pitch = select<HTMLSelectElement>('thread-size')
    expect([...pitch.options].map((o) => o.value)).toEqual(['M10', 'M10x1.25', 'M10x1', 'M10x0.75'])

    act(() => { all.click() })
    expect(all.checked).toBe(false)
    expect(nominal.options).toHaveLength(10)
    expect(pitch.value).toBe('M10')
  })
})
