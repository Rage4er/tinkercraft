// ============================================================
// 3dtc-io — round-trip тесты (Фаза 8.5, Этап 8.5.4)
// ============================================================

import { describe, it, expect } from 'vitest'
import { serialize3dtc, parse3dtc } from './3dtc-io'
import JSZip from 'jszip'
import type { SceneObject, TransformNR, TinkerCraftOperation } from '../csg/types'

const T: TransformNR = { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 }

function makeObj(overrides: Partial<SceneObject> = {}): SceneObject {
  return {
    id: 'obj_1',
    shapeType: 'cube',
    params: { width: 10, height: 10, depth: 10 },
    color: '#ff0000',
    transform: { ...T, x: 25, y: 0, z: 0 },
    visible: true,
    locked: false,
    vertices: new Float32Array([-5, -5, -5, 5, -5, -5, 5, 5, -5, -5, 5, -5, -5, -5, 5, 5, -5, 5, 5, 5, 5, -5, 5, 5]),
    indices: new Uint32Array([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 3, 2, 6, 3, 6, 7, 1, 2, 6, 1, 6, 5]),
    ...overrides,
  }
}

describe('3dtc-io round-trip', () => {
  it('serialize → parse → identical objects + operations', async () => {
    const obj = makeObj()
    const doc = {
      objects: { [obj.id]: obj },
      operations: [
        { type: 'add_shape' as const, id: obj.id, shapeType: 'cube' as const, params: { width: 10, height: 10, depth: 10 }, color: '#ff0000', transform: { x: 25, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 } },
      ],
      operationsTrimmed: false,
      fileName: 'test.3dtc',
    }

    const blob = await serialize3dtc(doc)
    const parsed = await parse3dtc(blob)

    // Objects
    expect(parsed.objects).toHaveProperty('obj_1')
    const parsedObj = parsed.objects.obj_1 as SceneObject
    expect(parsedObj.id).toBe('obj_1')
    expect(parsedObj.shapeType).toBe('cube')
    expect(parsedObj.transform).toEqual(obj.transform)
    expect(parsedObj.vertices).toBeInstanceOf(Float32Array)
    expect(parsedObj.indices).toBeInstanceOf(Uint32Array)
    // Verify vertex data integrity
    expect(parsedObj.vertices.length).toBe(obj.vertices.length)
    for (let i = 0; i < obj.vertices.length; i++) {
      expect(parsedObj.vertices[i]).toBeCloseTo(obj.vertices[i], 6)
    }
    // Verify indices
    expect(parsedObj.indices.length).toBe(obj.indices.length)
    for (let i = 0; i < obj.indices.length; i++) {
      expect(parsedObj.indices[i]).toBe(obj.indices[i])
    }

    // Operations
    expect(parsed.operations.length).toBe(1)
    expect(parsed.operations[0].type).toBe('add_shape')
    expect((parsed.operations[0] as any).id).toBe('obj_1')

    // Metadata
    expect(parsed.operationsTrimmed).toBe(false)
    expect(parsed.fileName).toBe('test.3dtc')
  })

  it('version 3dtc-v1', async () => {
    const doc = {
      objects: {},
      operations: [] as TinkerCraftOperation[],
      operationsTrimmed: false,
    }
    const blob = await serialize3dtc(doc)
    const zip = await JSZip.loadAsync(blob)
    const json = JSON.parse(await zip.file('model.json')!.async('text'))
    expect(json.version).toBe('3dtc-v1')
  })

  it('thumbnail preserved', async () => {
    const doc = {
      objects: {},
      operations: [] as TinkerCraftOperation[],
      operationsTrimmed: false,
      thumbnail: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    }
    const blob = await serialize3dtc(doc)
    const parsed = await parse3dtc(blob)
    expect(parsed.thumbnail).toBe(doc.thumbnail)
  })

  it('placeholder thumbnail when none provided', async () => {
    const doc = {
      objects: {},
      operations: [] as TinkerCraftOperation[],
      operationsTrimmed: false,
    }
    const blob = await serialize3dtc(doc)
    const zip = await JSZip.loadAsync(blob)
    const thumbFile = zip.file('thumbnail.png')
    expect(thumbFile).not.toBeNull()
    const parsed = await parse3dtc(blob)
    expect(parsed.thumbnail).toBeDefined()
    expect(parsed.thumbnail!.startsWith('data:image/png;base64,')).toBe(true)
  })

  it('operationsTrimmed flag', async () => {
    const addOp = { type: 'add_shape' as const, id: 'x' as const, shapeType: 'cube' as const, params: { width: 10, height: 10, depth: 10 }, color: '#000', transform: T }
    const doc = {
      objects: {},
      operations: [addOp],
      operationsTrimmed: true,
    }
    const blob = await serialize3dtc(doc)
    const parsed = await parse3dtc(blob)
    expect(parsed.operationsTrimmed).toBe(true)
  })

  it('base64 precision — no Float32 loss', async () => {
    // Создаём объект с вершинами, чувствительными к потере точности
    const vertices = new Float32Array([0.1234567, -987.654321, 0.0, 1.0, 2.0, 3.0])
    const indices = new Uint32Array([0, 1, 2])
    const obj: SceneObject = {
      id: 'prec',
      shapeType: 'cube',
      params: { width: 1, height: 1, depth: 1 },
      color: '#fff',
      transform: { ...T, x: 0.1234567, y: -987.654321, z: 0 },
      visible: true,
      locked: false,
      vertices,
      indices,
    }
    const doc = {
      objects: { prec: obj },
      operations: [] as TinkerCraftOperation[],
      operationsTrimmed: false,
    }
    const blob = await serialize3dtc(doc)
    const parsed = await parse3dtc(blob)
    const parsedObj = parsed.objects.prec as SceneObject
    expect(parsedObj.vertices).toBeInstanceOf(Float32Array)
    for (let i = 0; i < vertices.length; i++) {
      expect(parsedObj.vertices[i]).toBe(vertices[i]) // exact bit-for-bit
    }
  })

  it('rejects unsupported version', async () => {
    // Создаём ZIP с version "1.0.0" (старый .doodle)
    const zip = new JSZip()
    zip.file('model.json', JSON.stringify({ version: '1.0.0', operations: [] }))
    zip.file('thumbnail.png', 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', { base64: true })
    const blob = await zip.generateAsync({ type: 'blob' })
    await expect(parse3dtc(blob)).rejects.toThrow('Неподдерживаемая версия формата')
  })

  it('rejects missing model.json', async () => {
    const zip = new JSZip()
    zip.file('data.json', '{}')
    zip.file('thumbnail.png', 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', { base64: true })
    const blob = await zip.generateAsync({ type: 'blob' })
    await expect(parse3dtc(blob)).rejects.toThrow('model.json не найден')
  })
})
