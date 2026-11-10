import { describe, it, expect } from 'vitest'
import { getParamFields, clampFieldValue } from './child-params'

describe('getParamFields', () => {
  it('куб: ширина/высота/глубина', () => {
    expect(getParamFields('cube').map((f) => f.key)).toEqual(['width', 'height', 'depth'])
  })
  it('сфера: радиус', () => {
    expect(getParamFields('sphere').map((f) => f.key)).toEqual(['radius'])
  })
  it('цилиндр и конус: радиус и высота', () => {
    expect(getParamFields('cylinder').map((f) => f.key)).toEqual(['radius', 'height'])
    expect(getParamFields('cone').map((f) => f.key)).toEqual(['radius', 'height'])
  })
  it('тор: радиус тора и трубки', () => {
    expect(getParamFields('torus').map((f) => f.key)).toEqual(['torusRadius', 'tubeRadius'])
  })
  it('призма/пирамида: радиус, высота, число граней (целое, умолчание 6/4)', () => {
    const prism = getParamFields('prism')
    const pyramid = getParamFields('pyramid')
    expect(prism.map((f) => f.key)).toEqual(['radius', 'height', 'sides'])
    expect(prism[2].fallback).toBe(6)
    expect(pyramid[2].fallback).toBe(4)
    expect(prism[2].integer).toBe(true)
  })
  it('csg / import_mesh / undefined — полей нет', () => {
    expect(getParamFields('csg')).toEqual([])
    expect(getParamFields('import_mesh')).toEqual([])
    expect(getParamFields(undefined)).toEqual([])
  })
})

describe('clampFieldValue', () => {
  it('ограничивает снизу минимумом поля', () => {
    const [w] = getParamFields('cube')
    expect(clampFieldValue(w, -5)).toBe(0.1)
    expect(clampFieldValue(w, 12.5)).toBe(12.5)
  })
  it('округляет целые поля', () => {
    const sides = getParamFields('prism')[2]
    expect(clampFieldValue(sides, 5.6)).toBe(6)
    expect(clampFieldValue(sides, 1)).toBe(3)
  })
})
