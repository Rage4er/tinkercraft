// ============================================================
// 3dtc-io — round-trip тесты (Фаза 8.5, Этап 8.5.4)
// ============================================================

import { describe, it, expect } from 'vitest'
import { serialize3dtc, parse3dtc } from './3dtc-io'
import JSZip from 'jszip'
import i18n from '../i18n'
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

  it('edit_step move (9.5.2): patch, before, замены group и align переживают round-trip', async () => {
    const T: TransformNR = { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 }
    const ops: TinkerCraftOperation[] = [
      { type: 'add_shape', id: 'a', shapeType: 'cube', params: { width: 10, height: 10, depth: 10 }, color: '#fff', transform: T },
      { type: 'move', ids: ['a'], delta: { x: 2, y: 0, z: 0 }, rotDelta: { x: 0, y: 20, z: 0 }, scaleDelta: { x: 0, y: 0, z: 0 } },
      { type: 'add_shape', id: 'b', shapeType: 'sphere', params: { radius: 6 }, color: '#fff', transform: T },
      { type: 'group', ids: ['a', 'b'], resultId: 'c', resultVertices: [0, 0, 0, 1, 0, 0, 0, 1, 0], resultIndices: [0, 1, 2], resultCenter: { x: 2, y: 0, z: 0 } },
      { type: 'add_shape', id: 'k', shapeType: 'cube', params: { width: 2, height: 2, depth: 2 }, color: '#fff', transform: T },
      { type: 'align', ids: ['k'], axis: 'X', anchor: 'min', anchorId: 'c', deltas: { k: -3 } },
      {
        type: 'edit_step', stepIndex: 1, stepFingerprint: { type: 'move', targetId: 'a' },
        patch: { kind: 'move', delta: { x: 5, y: 0, z: 0 }, rotDelta: { x: 0, y: 20, z: 0 }, scaleDelta: { x: 0, y: 0, z: 0 } },
        before: { kind: 'move', delta: { x: 2, y: 0, z: 0 }, rotDelta: { x: 0, y: 20, z: 0 }, scaleDelta: { x: 0, y: 0, z: 0 } },
        replacements: [
          {
            stepIndex: 3, kind: 'group',
            resultVertices: new Float32Array([0.5, 0, 0, 1, 0, 0, 0, 1, 0]), resultIndices: new Uint32Array([0, 1, 2]),
            resultCenter: { x: 5, y: 0, z: 0 }, resultRotation: { x: 0, y: 20, z: 0 }, resultScale: { x: 1, y: 1, z: 1 },
            originalBboxSize: { x: 1, y: 1, z: 0 },
          },
          { stepIndex: 5, kind: 'align', deltas: { k: 0 } },
        ],
      },
    ]
    const parsed = await parse3dtc(await serialize3dtc({ objects: {}, operations: ops, operationsTrimmed: false }))
    const e = parsed.operations[6]
    expect(e.type).toBe('edit_step')
    if (e.type !== 'edit_step') return
    expect(e.patch).toEqual(ops[6].type === 'edit_step' ? ops[6].patch : null)
    expect(e.before).toMatchObject({ kind: 'move', delta: { x: 2, y: 0, z: 0 } })
    expect(e.stepFingerprint).toEqual({ type: 'move', targetId: 'a' })
    const [g, al] = e.replacements
    // как у group: массивы меша → number[] (совместимость с rebuildFromHistory)
    expect(g.resultVertices).toEqual(Array.from(new Float32Array([0.5, 0, 0, 1, 0, 0, 0, 1, 0])))
    expect(g.resultIndices).toEqual([0, 1, 2])
    expect(g.resultCenter).toEqual({ x: 5, y: 0, z: 0 })
    expect(al).toEqual({ stepIndex: 5, kind: 'align', deltas: { k: 0 } })
  })

  it('edit_step mirror (9.5.3): плоскость, before и замена group переживают round-trip', async () => {
    const T: TransformNR = { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 }
    const ops: TinkerCraftOperation[] = [
      { type: 'add_shape', id: 'a', shapeType: 'prism', params: { radius: 10, height: 20, sides: 5 }, color: '#fff', transform: T },
      { type: 'mirror', originalIds: ['a'], ids: ['a2'], plane: 'YZ' },
      { type: 'add_shape', id: 'b', shapeType: 'sphere', params: { radius: 6 }, color: '#fff', transform: T },
      { type: 'group', ids: ['a2', 'b'], resultId: 'c', resultVertices: [0, 0, 0, 1, 0, 0, 0, 1, 0], resultIndices: [0, 1, 2], resultCenter: { x: -5, y: 0, z: 0 } },
      {
        type: 'edit_step', stepIndex: 1, stepFingerprint: { type: 'mirror', targetId: 'a2' },
        patch: { kind: 'mirror', plane: 'XZ' }, before: { kind: 'mirror', plane: 'YZ' },
        replacements: [{
          stepIndex: 3, kind: 'group',
          resultVertices: new Float32Array([0, 0.5, 0, 1, 0, 0, 0, 1, 0]), resultIndices: new Uint32Array([0, 2, 1]),
          resultCenter: { x: 0, y: -5, z: 0 }, resultRotation: { x: 0, y: 0, z: 0 }, resultScale: { x: 1, y: 1, z: 1 },
        }],
      },
    ]
    const parsed = await parse3dtc(await serialize3dtc({ objects: {}, operations: ops, operationsTrimmed: false }))
    const e = parsed.operations[4]
    expect(e.type).toBe('edit_step')
    if (e.type !== 'edit_step') return
    expect(e.patch).toEqual({ kind: 'mirror', plane: 'XZ' })
    expect(e.before).toEqual({ kind: 'mirror', plane: 'YZ' })
    expect(e.stepFingerprint).toEqual({ type: 'mirror', targetId: 'a2' })
    expect(e.replacements[0].resultIndices).toEqual([0, 2, 1])
    expect(e.replacements[0].resultCenter).toEqual({ x: 0, y: -5, z: 0 })
  })

  it('extrude (9.5.4): GroupOperation.source и edit_step с заменой плиты переживают round-trip', async () => {
    const T: TransformNR = { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 }
    const ops: TinkerCraftOperation[] = [
      { type: 'add_shape', id: 'a', shapeType: 'cube', params: { width: 10, height: 10, depth: 10 }, color: '#fff', transform: T },
      { type: 'add_shape', id: 's', shapeType: 'cube', params: { width: 10, height: 10, depth: 5 }, color: '#fff', transform: { ...T, z: 7.5 } },
      { type: 'group', ids: ['a', 's'], resultId: 'e', resultVertices: [0, 0, 0, 1, 0, 0, 0, 1, 0], resultIndices: [0, 1, 2], resultCenter: { x: 0, y: 0, z: 0 },
        source: { kind: 'extrude', baseId: 'a', slabId: 's', axis: 'Z', depth: 5 } },
      {
        type: 'edit_step', stepIndex: 2, stepFingerprint: { type: 'group', targetId: 's' },
        patch: { kind: 'extrude', depth: 10 }, before: { kind: 'extrude', depth: 5 },
        replacements: [
          { stepIndex: 1, kind: 'add_shape', params: { width: 10, height: 10, depth: 10 }, transform: { ...T, z: 10 } },
          { stepIndex: 2, kind: 'group', resultVertices: new Float32Array([0, 0, 2, 1, 0, 0, 0, 1, 0]), resultIndices: new Uint32Array([0, 1, 2]) },
        ],
      },
    ]
    const parsed = await parse3dtc(await serialize3dtc({ objects: {}, operations: ops, operationsTrimmed: false }))
    const g = parsed.operations[2]
    expect(g.type === 'group' && g.source).toEqual({ kind: 'extrude', baseId: 'a', slabId: 's', axis: 'Z', depth: 5 })
    const e = parsed.operations[3]
    if (e.type !== 'edit_step') throw new Error('edit_step expected')
    expect(e.patch).toEqual({ kind: 'extrude', depth: 10 })
    expect(e.replacements[0]).toEqual({ stepIndex: 1, kind: 'add_shape', params: { width: 10, height: 10, depth: 10 }, transform: { ...T, z: 10 } })
    expect(e.replacements[1].resultVertices).toEqual([0, 0, 2, 1, 0, 0, 0, 1, 0])
  })

  it('CSG-INDEPENDENT-COPY: снимок дерева вставки (copyTree) и полный TRS переживают round-trip', async () => {
    const T: TransformNR = { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 }
    const ops: TinkerCraftOperation[] = [{
      type: 'group', ids: [], resultId: 'p', resultVertices: [0, 0, 0, 1, 0, 0, 0, 1, 0], resultIndices: [0, 1, 2],
      resultCenter: { x: 5, y: 0, z: 5 }, resultRotation: { x: 0, y: 0, z: 50 }, resultScale: { x: 1, y: 2, z: 1 },
      copyTree: {
        sourceRootId: 'r',
        origin: { ...T, x: 10, rotZ: 30 },
        nodes: [
          { id: 'r', type: 'boolean', operation: 'union', children: ['a', 'k'], relativeToParent: null, localTransform: T },
          { id: 'a', type: 'primitive', shapeType: 'sphere', params: { radius: 8 }, mirrored: ['YZ'], parentId: 'r', relativeToParent: null, localTransform: { ...T, x: 14 } },
          { id: 'k', type: 'baked', vertices: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), indices: new Uint32Array([0, 1, 2]), normals: null, mirroredPlane: 'XZ', parentId: 'r', relativeToParent: null, localTransform: T },
        ],
      },
    }]
    const parsed = await parse3dtc(await serialize3dtc({ objects: {}, operations: ops, operationsTrimmed: false }))
    const g = parsed.operations[0]
    if (g.type !== 'group' || !g.copyTree) throw new Error('group с copyTree expected')
    expect(g.resultRotation).toEqual({ x: 0, y: 0, z: 50 })
    expect(g.resultScale).toEqual({ x: 1, y: 2, z: 1 })
    expect(g.copyTree.sourceRootId).toBe('r')
    expect(g.copyTree.origin).toEqual({ ...T, x: 10, rotZ: 30 })
    expect(g.copyTree.nodes.map(n => n.id)).toEqual(['r', 'a', 'k'])
    expect(g.copyTree.nodes[1]).toMatchObject({ type: 'primitive', params: { radius: 8 }, mirrored: ['YZ'], parentId: 'r' })
    const k = g.copyTree.nodes[2]
    // baked-узел снимка — типизированные массивы (как TreeNode), а не number[]
    expect(k.vertices).toBeInstanceOf(Float32Array)
    expect(Array.from(k.vertices!)).toEqual([0, 0, 0, 1, 0, 0, 0, 1, 0])
    expect(k.indices).toBeInstanceOf(Uint32Array)
    expect(k.mirroredPlane).toBe('XZ')
  })

  it('N-ARY-CSG: N-арный group (ids × 10, groupA) и N-арный узел снимка копии переживают round-trip', async () => {
    const T: TransformNR = { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 }
    const ids = Array.from({ length: 10 }, (_, i) => `o${i}`)
    const ops: TinkerCraftOperation[] = [
      {
        type: 'group', ids, resultId: 'r', treeOperation: 'subtract', groupA: 5, shapeType: 'csg',
        resultVertices: [0, 0, 0, 1, 0, 0, 0, 1, 0], resultIndices: [0, 1, 2], resultCenter: { x: 1, y: 2, z: 3 },
      },
      {
        type: 'group', ids: [], resultId: 'p', resultVertices: [0, 0, 0, 1, 0, 0, 0, 1, 0], resultIndices: [0, 1, 2],
        copyTree: {
          sourceRootId: 'r', origin: T,
          nodes: [{ id: 'r', type: 'boolean', operation: 'intersect', children: ['a', 'b', 'c'], groupA: 2, relativeToParent: null, localTransform: T }],
        },
      },
    ]
    const parsed = await parse3dtc(await serialize3dtc({ objects: {}, operations: ops, operationsTrimmed: false }))
    const [g, p] = parsed.operations
    if (g.type !== 'group' || p.type !== 'group' || !p.copyTree) throw new Error('group expected')
    expect(g.ids).toEqual(ids)
    expect(g.groupA).toBe(5)
    expect(g.treeOperation).toBe('subtract')
    expect(p.copyTree.nodes[0]).toMatchObject({ children: ['a', 'b', 'c'], groupA: 2, operation: 'intersect' })
  })

  it('DIMENSIONS: размеры — отдельный слой `dimensions` (не в operations), переживают round-trip; битые записи отбрасываются', async () => {
    const box = { min: { x: -10, y: -10, z: -10 }, max: { x: 10, y: 10, z: 10 } }
    const dim = {
      id: 'dim_1', type: 'linear' as const,
      objectIdA: 'obj_1', pointA: { x: 10, y: 10, z: 10 }, boxA: box,
      objectIdB: 'obj_2', pointB: { x: -12, y: 0, z: 0 }, boxB: box,
      offset: 15, style: { kind: 'offset' as const, color: '#ff8800', font: 'serif' as const, size: 7, units: 'mm' as const },
    }
    const ops = [{ type: 'add_shape', id: 'obj_1', shapeType: 'cube', params: {}, color: '#fff', transform: T }] as unknown as TinkerCraftOperation[]
    const blob = await serialize3dtc({ objects: {}, operations: ops, operationsTrimmed: false, dimensions: [dim] })
    const zip = await JSZip.loadAsync(await blob.arrayBuffer())
    const model = JSON.parse(await zip.file('model.json')!.async('string'))
    expect(model.version).toBe('3dtc-v1')                         // формат тот же — поле необязательное
    expect(model.operations).toHaveLength(1)                      // размер — не шаг истории
    expect(model.dimensions).toHaveLength(1)
    const parsed = await parse3dtc(blob)
    expect(parsed.dimensions).toEqual([dim])
    expect(parsed.operations).toHaveLength(1)

    // старый файл без поля — пустой слой; битые записи и недопустимые значения — отброшены / по умолчанию
    model.dimensions = [
      dim,
      { id: 'bad' },
      { ...dim, id: 'dim_2', offset: 1e9, style: { kind: 'zigzag', color: 'red', font: 'comic', size: -3 } },
    ]
    const z2 = new JSZip(); z2.file('model.json', JSON.stringify(model))
    const p2 = await parse3dtc(await z2.generateAsync({ type: 'arraybuffer' }))
    expect(p2.dimensions!.map((d) => d.id)).toEqual(['dim_1', 'dim_2'])
    expect(p2.dimensions![1].offset).toBe(500)
    expect(p2.dimensions![1].style).toEqual({ kind: 'standard', color: '#f9e2af', font: 'sans-serif', size: 1, units: 'mm' })
    delete model.dimensions
    const z3 = new JSZip(); z3.file('model.json', JSON.stringify(model))
    expect((await parse3dtc(await z3.generateAsync({ type: 'arraybuffer' }))).dimensions).toEqual([])
  })

  it('rejects unsupported version', async () => {
    // Создаём ZIP с version "1.0.0" (старый .doodle)
    const zip = new JSZip()
    zip.file('model.json', JSON.stringify({ version: '1.0.0', operations: [] }))
    zip.file('thumbnail.png', 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', { base64: true })
    const blob = await zip.generateAsync({ type: 'blob' })
    // UX-AUDIT-7: сообщение — на языке интерфейса (попадает в уведомление «Ошибка открытия»)
    await i18n.changeLanguage('ru')
    await expect(parse3dtc(blob)).rejects.toThrow('Неподдерживаемая версия формата "1.0.0". Ожидается "3dtc-v1".')
    await i18n.changeLanguage('en')
    await expect(parse3dtc(blob)).rejects.toThrow('Unsupported format version "1.0.0". Expected "3dtc-v1".')
  })

  it('rejects missing model.json', async () => {
    const zip = new JSZip()
    zip.file('data.json', '{}')
    zip.file('thumbnail.png', 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', { base64: true })
    const blob = await zip.generateAsync({ type: 'blob' })
    await i18n.changeLanguage('ru')
    await expect(parse3dtc(blob)).rejects.toThrow('model.json не найден')
    await i18n.changeLanguage('en')
    await expect(parse3dtc(blob)).rejects.toThrow('model.json not found')
  })
})
