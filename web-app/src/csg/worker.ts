// ============================================================
// CSG Web Worker — manifold-3d в изолированном потоке
// Хранит Map<id, ManifoldObj> в памяти воркера.
// ============================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type M = any

let wasm: M = null

const initPromise: Promise<void> = (async () => {
  const Module = await import('manifold-3d')
  wasm = await Module.default()
  wasm.setup()
  self.postMessage({ type: 'ready' })
})()

// Кэш manifold-объектов по id
const cache = new Map<string, M>()

// ---- Утилиты ----

function buildPrimitive(shapeType: string, params: Record<string, number>): M {
  const { Manifold } = wasm
  switch (shapeType) {
    case 'cube':
      return Manifold.cube(
        [params.width ?? 20, params.depth ?? 20, params.height ?? 20], true
      )
    case 'sphere':
      return Manifold.sphere(params.radius ?? 12, params.segments ?? 32)
    case 'cylinder':
      return Manifold.cylinder(
        params.height ?? 30, params.radius ?? 10, params.radius ?? 10,
        params.segments ?? 32, true
      )
    case 'cone':
      return Manifold.cylinder(
        params.height ?? 30, params.radius ?? 10, 0,
        params.segments ?? 32, true
      )
    default:
      return Manifold.cube([20, 20, 20], true)
  }
}

function applyTransform(manifold: M, t: {
  x: number; y: number; z: number
  rotX: number; rotY: number; rotZ: number
}): M {
  const rx = t.rotX * (Math.PI / 180)
  const ry = t.rotY * (Math.PI / 180)
  const rz = t.rotZ * (Math.PI / 180)
  const cx = Math.cos(rx), sx = Math.sin(rx)
  const cy = Math.cos(ry), sy = Math.sin(ry)
  const cz = Math.cos(rz), sz = Math.sin(rz)
  // 3×4 affine (column-major, translation last)
  const m = [
    cy * cz,                    cy * sz,                   -sy,
    sx * sy * cz - cx * sz,     sx * sy * sz + cx * cz,    sx * cy,
    cx * sy * cz + sx * sz,     cx * sy * sz - sx * cz,    cx * cy,
    t.x, t.y, t.z,
  ]
  return manifold.transform(m)
}

function extractMesh(manifold: M): { vertices: Float32Array; indices: Uint32Array; tris: number } {
  const mesh = manifold.getMesh()
  const numProp: number = mesh.numProp ?? 3
  const raw: Float32Array = mesh.vertProperties
  let vertices: Float32Array
  if (numProp === 3) {
    vertices = new Float32Array(raw)
  } else {
    const count = raw.length / numProp
    vertices = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      vertices[i * 3]     = raw[i * numProp]
      vertices[i * 3 + 1] = raw[i * numProp + 1]
      vertices[i * 3 + 2] = raw[i * numProp + 2]
    }
  }
  const indices = new Uint32Array(mesh.triVerts)
  return { vertices, indices, tris: indices.length / 3 }
}

// ---- Message handler ----

self.addEventListener('message', async (e: MessageEvent) => {
  await initPromise

  const msg = e.data as {
    reqId: string
    type: string
    [k: string]: unknown
  }

  try {
    switch (msg.type) {
      // ── Создать примитив и закэшировать ──
      case 'buildShape': {
        const t0 = performance.now()
        let m = buildPrimitive(
          msg.shapeType as string,
          msg.params as Record<string, number>
        )
        m = applyTransform(m, msg.transform as {
          x: number; y: number; z: number
          rotX: number; rotY: number; rotZ: number
        })
        cache.set(msg.objId as string, m)
        const { vertices, indices, tris } = extractMesh(m)
        self.postMessage(
          { reqId: msg.reqId, type: 'mesh', objId: msg.objId, vertices, indices, tris, ms: performance.now() - t0 },
          [vertices.buffer, indices.buffer]
        )
        break
      }

      // ── CSG булева операция ──
      case 'csgBoolean': {
        const t0 = performance.now()
        const a = cache.get(msg.idA as string)
        const b = cache.get(msg.idB as string)
        if (!a || !b) throw new Error(`Object not found: ${msg.idA} or ${msg.idB}`)
        let result: M
        switch (msg.op) {
          case 'union':    result = a.add(b); break
          case 'subtract': result = a.subtract(b); break
          case 'intersect': result = a.intersect(b); break
          default: throw new Error(`Unknown op: ${msg.op}`)
        }
        // Удаляем исходники из кэша
        cache.delete(msg.idA as string)
        cache.delete(msg.idB as string)
        cache.set(msg.resultId as string, result)
        const { vertices, indices, tris } = extractMesh(result)
        self.postMessage(
          { reqId: msg.reqId, type: 'mesh', objId: msg.resultId, vertices, indices, tris, ms: performance.now() - t0 },
          [vertices.buffer, indices.buffer]
        )
        break
      }

      // ── Пересобрать сцену из нуля по списку операций ──
      case 'rebuildScene': {
        const t0 = performance.now()
        // Очищаем кэш
        cache.clear()
        const ops = msg.operations as Array<{ type: string; [k: string]: unknown }>
        const results: Array<{ objId: string; vertices: Float32Array; indices: Uint32Array; tris: number }> = []
        const deletedIds = new Set<string>()

        for (const op of ops) {
          if (op.type === 'add_shape') {
            let m = buildPrimitive(op.shapeType as string, op.params as Record<string, number>)
            m = applyTransform(m, op.transform as { x: number; y: number; z: number; rotX: number; rotY: number; rotZ: number })
            cache.set(op.id as string, m)
          } else if (op.type === 'delete') {
            for (const id of op.ids as string[]) {
              cache.delete(id)
              deletedIds.add(id)
            }
          } else if (op.type === 'group') {
            // CSG boolean embedded in history
            const a = cache.get((op.ids as string[])[0])
            const b = cache.get((op.ids as string[])[1])
            if (a && b) {
              let result: M
              if (op.isIntersect) result = a.intersect(b)
              else if (op.subtractOp) result = a.subtract(b)
              else result = a.add(b)
              cache.delete((op.ids as string[])[0])
              cache.delete((op.ids as string[])[1])
              cache.set(op.resultId as string, result)
            }
          }
          // move / resize: we store updated transforms in op, re-apply on build
        }

        // Extract meshes for all cached objects
        const transfers: ArrayBuffer[] = []
        for (const [objId, m] of cache) {
          const { vertices, indices, tris } = extractMesh(m)
          results.push({ objId, vertices, indices, tris })
          transfers.push(vertices.buffer, indices.buffer)
        }

        self.postMessage(
          { reqId: msg.reqId, type: 'sceneBuilt', results, ms: performance.now() - t0 },
          transfers
        )
        break
      }

      // ── Удалить объекты из кэша ──
      case 'deleteObjects': {
        for (const id of msg.ids as string[]) cache.delete(id)
        self.postMessage({ reqId: msg.reqId, type: 'ok' })
        break
      }

      // ── Очистить всё ──
      case 'clearAll': {
        cache.clear()
        self.postMessage({ reqId: msg.reqId, type: 'ok' })
        break
      }

      default:
        self.postMessage({ reqId: msg.reqId, type: 'error', message: `Unknown type: ${msg.type}` })
    }
  } catch (err) {
    self.postMessage({ reqId: msg.reqId, type: 'error', message: String(err) })
  }
})
