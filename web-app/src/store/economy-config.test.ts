// src/store/economy-config.test.ts — Тесты экономики v2.0 (§2.1)
import { describe, it, expect } from 'vitest'
import { calculateCashbackV2, calculateCashbackBreakdown, scanForCashback, countSceneObjects } from './economy-config'

describe('calculateCashbackV2', () => {
  it('base case: 1 объект = 1 (base only)', () => {
    const scan = { objectCount: 1, uniqueShapeTypes: 1, toolsCount: 0, toolCategories: 0 }
    expect(calculateCashbackV2(scan)).toBe(1)
  })

  it('5 объектов = +1 scale bonus', () => {
    const scan = { objectCount: 5, uniqueShapeTypes: 1, toolsCount: 0, toolCategories: 0 }
    expect(calculateCashbackV2(scan)).toBe(2) // 1 + 1
  })

  it('10 объектов = +2 scale bonus', () => {
    const scan = { objectCount: 10, uniqueShapeTypes: 1, toolsCount: 0, toolCategories: 0 }
    expect(calculateCashbackV2(scan)).toBe(3) // 1 + 2
  })

  it('30 объектов = +6 scale bonus (cap)', () => {
    const scan = { objectCount: 30, uniqueShapeTypes: 1, toolsCount: 0, toolCategories: 0 }
    expect(calculateCashbackV2(scan)).toBe(7) // 1 + 6
  })

  it('1 unique shape = 0 shapeDiv', () => {
    const scan = { objectCount: 1, uniqueShapeTypes: 1, toolsCount: 0, toolCategories: 0 }
    expect(calculateCashbackV2(scan)).toBe(1)
  })

  it('2 unique shapes = +1 shapeDiv', () => {
    const scan = { objectCount: 1, uniqueShapeTypes: 2, toolsCount: 0, toolCategories: 0 }
    expect(calculateCashbackV2(scan)).toBe(2) // 1 + 1
  })

  it('7 unique shapes = +6 shapeDiv (cap)', () => {
    const scan = { objectCount: 1, uniqueShapeTypes: 7, toolsCount: 0, toolCategories: 0 }
    expect(calculateCashbackV2(scan)).toBe(7) // 1 + 6
  })

  it('6 tools = +6 toolCount', () => {
    const scan = { objectCount: 1, uniqueShapeTypes: 1, toolsCount: 6, toolCategories: 0 }
    expect(calculateCashbackV2(scan)).toBe(7) // 1 + 6
  })

  it('6 tool categories = +6 toolDiv', () => {
    const scan = { objectCount: 1, uniqueShapeTypes: 1, toolsCount: 0, toolCategories: 6 }
    expect(calculateCashbackV2(scan)).toBe(7) // 1 + 6
  })

  it('ceiling = 25', () => {
    const scan = { objectCount: 30, uniqueShapeTypes: 7, toolsCount: 6, toolCategories: 6 }
    expect(calculateCashbackV2(scan)).toBe(25) // 1+6+6+6+6 = 25
  })

  it('overflow ceiling stays at 25', () => {
    const scan = { objectCount: 100, uniqueShapeTypes: 20, toolsCount: 20, toolCategories: 20 }
    expect(calculateCashbackV2(scan)).toBe(25)
  })
})

describe('calculateCashbackBreakdown', () => {
  it('returns breakdown matching calculateCashbackV2', () => {
    const scan = { objectCount: 12, uniqueShapeTypes: 3, toolsCount: 4, toolCategories: 2 }
    const v2 = calculateCashbackV2(scan)
    const breakdown = calculateCashbackBreakdown(scan)
    expect(breakdown.total).toBe(v2)
  })

  it('base = 1', () => {
    const scan = { objectCount: 1, uniqueShapeTypes: 1, toolsCount: 0, toolCategories: 0 }
    expect(calculateCashbackBreakdown(scan).base).toBe(1)
  })

  it('scale = floor(objectCount / 5), cap 6', () => {
    expect(calculateCashbackBreakdown({ objectCount: 4, uniqueShapeTypes: 1, toolsCount: 0, toolCategories: 0 }).scale).toBe(0)
    expect(calculateCashbackBreakdown({ objectCount: 5, uniqueShapeTypes: 1, toolsCount: 0, toolCategories: 0 }).scale).toBe(1)
    expect(calculateCashbackBreakdown({ objectCount: 29, uniqueShapeTypes: 1, toolsCount: 0, toolCategories: 0 }).scale).toBe(5)
    expect(calculateCashbackBreakdown({ objectCount: 30, uniqueShapeTypes: 1, toolsCount: 0, toolCategories: 0 }).scale).toBe(6)
    expect(calculateCashbackBreakdown({ objectCount: 100, uniqueShapeTypes: 1, toolsCount: 0, toolCategories: 0 }).scale).toBe(6)
  })

  it('shapeDiv = max(0, unique-1), cap 6', () => {
    expect(calculateCashbackBreakdown({ objectCount: 1, uniqueShapeTypes: 1, toolsCount: 0, toolCategories: 0 }).shapeDiv).toBe(0)
    expect(calculateCashbackBreakdown({ objectCount: 1, uniqueShapeTypes: 2, toolsCount: 0, toolCategories: 0 }).shapeDiv).toBe(1)
    expect(calculateCashbackBreakdown({ objectCount: 1, uniqueShapeTypes: 8, toolsCount: 0, toolCategories: 0 }).shapeDiv).toBe(6)
  })

  it('toolCount = min(tools, 6)', () => {
    expect(calculateCashbackBreakdown({ objectCount: 1, uniqueShapeTypes: 1, toolsCount: 0, toolCategories: 0 }).toolCount).toBe(0)
    expect(calculateCashbackBreakdown({ objectCount: 1, uniqueShapeTypes: 1, toolsCount: 5, toolCategories: 0 }).toolCount).toBe(5)
    expect(calculateCashbackBreakdown({ objectCount: 1, uniqueShapeTypes: 1, toolsCount: 10, toolCategories: 0 }).toolCount).toBe(6)
  })

  it('toolDiv = min(categories, 6)', () => {
    expect(calculateCashbackBreakdown({ objectCount: 1, uniqueShapeTypes: 1, toolsCount: 0, toolCategories: 0 }).toolDiv).toBe(0)
    expect(calculateCashbackBreakdown({ objectCount: 1, uniqueShapeTypes: 1, toolsCount: 0, toolCategories: 5 }).toolDiv).toBe(5)
    expect(calculateCashbackBreakdown({ objectCount: 1, uniqueShapeTypes: 1, toolsCount: 0, toolCategories: 10 }).toolDiv).toBe(6)
  })
})

describe('countSceneObjects (P1-2 единый подсчёт)', () => {
  it('считает все объекты сцены, включая import_mesh и text3d', () => {
    const objects = {
      '1': { shapeType: 'cube' },
      '2': { shapeType: 'import_mesh' },
      '3': { shapeType: 'text3d' },
      '4': { shapeType: 'csg' },
    }
    expect(countSceneObjects(objects)).toBe(4)
  })

  it('пустая сцена = 0', () => {
    expect(countSceneObjects({})).toBe(0)
  })
})

describe('scanForCashback', () => {
  it('counts all objects (import_mesh not excluded)', () => {
    const objects = {
      '1': { shapeType: 'cube', color: '#ff0000', transform: { scaleX: 1, scaleY: 1, scaleZ: 1 } },
      '2': { shapeType: 'sphere', color: '#00ff00', transform: { scaleX: 1, scaleY: 1, scaleZ: 1 } },
      '3': { shapeType: 'import_mesh', color: '#0000ff', transform: { scaleX: 1, scaleY: 1, scaleZ: 1 } },
    }
    const operations: Array<{ type: string; ids?: string[] }> = []
    const scan = scanForCashback(objects as any, operations)
    expect(scan.objectCount).toBe(3) // all objects counted
  })

  it('counts unique shape types', () => {
    const objects = {
      '1': { shapeType: 'cube', color: '#ff0000', transform: { scaleX: 1, scaleY: 1, scaleZ: 1 } },
      '2': { shapeType: 'cube', color: '#00ff00', transform: { scaleX: 1, scaleY: 1, scaleZ: 1 } },
      '3': { shapeType: 'sphere', color: '#0000ff', transform: { scaleX: 1, scaleY: 1, scaleZ: 1 } },
    }
    const operations: Array<{ type: string; ids?: string[] }> = []
    const scan = scanForCashback(objects as any, operations)
    expect(scan.uniqueShapeTypes).toBe(2) // cube, sphere
  })

  it('counts tools from operations', () => {
    const objects = {
      '1': { shapeType: 'cube', color: '#ff0000', transform: { scaleX: 1, scaleY: 1, scaleZ: 1 } },
    }
    const operations = [
      { type: 'group', ids: ['1', '2'] },
    ]
    const scan = scanForCashback(objects as any, operations)
    expect(scan.toolsCount).toBe(1)
  })

  it('counts tool categories', () => {
    const objects = {
      '1': { shapeType: 'cube', color: '#ff0000', transform: { scaleX: 1, scaleY: 1, scaleZ: 1 } },
    }
    const operations = [
      { type: 'group', ids: ['1', '2'] },
      { type: 'mirror', ids: ['1'] },
    ]
    const scan = scanForCashback(objects as any, operations)
    expect(scan.toolCategories).toBeGreaterThanOrEqual(1)
  })
})
