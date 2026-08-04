// ============================================================
// Unit tests — autosave: session save/restore/clear
// FIX (HIGH-18-24): Coverage for autosave module.
// ============================================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest'

// Mock IndexedDB before importing autosave
const mockDBs = new Map<string, Map<string, unknown>>()

class MockTransaction {
  oncomplete: (() => void) | null = null
  onerror: ((e: Error) => void) | null = null
  store: MockObjectStore

  constructor(store: MockObjectStore) {
    this.store = store
  }
}

class MockObjectStore {
  data = new Map<string, unknown>()

  put(value: unknown, key: string): void {
    this.data.set(key, value)
  }

  get(key: string): unknown {
    return this.data.get(key)
  }

  delete(key: string): void {
    this.data.delete(key)
  }
}

class MockDatabase {
  name: string
  version: number
  store = new MockObjectStore()
  objectStoreNames = new Set(['autosave'])
  transaction(storeName: string, mode: string): MockTransaction {
    return new MockTransaction(this.store)
  }
  close(): void {}
}

const mockIndexedDB: Partial<IDBFactory> = {
  open: (_name: string, _version: number) => {
    const name = `_mock_db_${Date.now()}_${Math.random()}`
    mockDBs.set(name, new Map())
    return {
      result: new MockDatabase() as unknown as IDBDatabase,
      onupgradeneeded: null,
      onsuccess: null,
      onerror: null,
    } as unknown as IDBOpenDBRequest
  },
}

Object.defineProperty(globalThis, 'indexedDB', {
  value: mockIndexedDB as unknown as IDBFactory,
  writable: true,
  configurable: true,
})

// Re-import after mocking
import { autosaveSession, restoreSession, clearAutosave } from './autosave'

describe('autosave', () => {
  beforeEach(() => {
    mockDBs.clear()
  })

  it('saves and restores a session', async () => {
    const operations = [{ type: 'add_shape', id: 'obj_1', shapeType: 'cube' as const, params: { width: 20, height: 20, depth: 20 }, color: '#89b4fa', transform: { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 } }]
    await autosaveSession(operations, 1, 'test.doodle')
    const result = await restoreSession()
    expect(result).not.toBeNull()
    expect(result?.operations).toEqual(operations)
    expect(result?.historyIndex).toBe(1)
    expect(result?.fileName).toBe('test.doodle')
    expect(result?.savedAt).toBeTypeOf('number')
  })

  it('clears a session', async () => {
    const operations = [{ type: 'add_shape', id: 'obj_1', shapeType: 'cube' as const, params: { width: 20, height: 20, depth: 20 }, color: '#89b4fa', transform: { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 } }]
    await autosaveSession(operations, 1, 'test.doodle')
    await clearAutosave()
    const result = await restoreSession()
    expect(result).toBeNull()
  })

  it('handles empty operations', async () => {
    await autosaveSession([], 0, null)
    const result = await restoreSession()
    expect(result).not.toBeNull()
    expect(result?.operations).toEqual([])
    expect(result?.historyIndex).toBe(0)
    expect(result?.fileName).toBeNull()
  })

  it('overwrites previous session', async () => {
    await autosaveSession([{ type: 'add_shape', id: 'a', shapeType: 'cube' as const, params: { width: 10, height: 10, depth: 10 }, color: '#ff0000', transform: { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 } }], 1, 'first.doodle')
    await autosaveSession([{ type: 'add_shape', id: 'b', shapeType: 'sphere' as const, params: { radius: 5 }, color: '#00ff00', transform: { x: 10, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 } }], 1, 'second.doodle')
    const result = await restoreSession()
    expect(result?.fileName).toBe('second.doodle')
    expect(result?.operations[0].id).toBe('b')
  })
})