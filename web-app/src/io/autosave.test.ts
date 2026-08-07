// ============================================================
// Unit tests — autosave: session save/restore/clear
// Uses shared mock from __mocks__/indexeddb.ts
// ============================================================

import { describe, it, expect, beforeEach, vi } from 'vitest'

// Install IndexedDB mock on globalThis
import '../__mocks__/indexeddb'
import { _resetMockIndexedDB } from '../__mocks__/indexeddb'

// Dynamic imports — reset modules to get fresh autosave instance
let autosaveSession: typeof import('./autosave').autosaveSession
let restoreSession: typeof import('./autosave').restoreSession
let clearAutosave: typeof import('./autosave').clearAutosave

describe('autosave', () => {
  beforeEach(async () => {
    _resetMockIndexedDB()
    vi.resetModules()
    await import('../__mocks__/indexeddb')
    const mod = await import('./autosave')
    autosaveSession = mod.autosaveSession
    restoreSession = mod.restoreSession
    clearAutosave = mod.clearAutosave
  })

  it('saves and restores a session', async () => {
    const operations = [{ type: 'add_shape' as const, id: 'obj_1', shapeType: 'cube' as const, params: { width: 20, height: 20, depth: 20 }, color: '#89b4fa', transform: { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 } }]
    await autosaveSession(operations, 1, 'test.doodle')
    const result = await restoreSession()
    expect(result).not.toBeNull()
    expect(result?.operations).toEqual(operations)
    expect(result?.historyIndex).toBe(1)
    expect(result?.fileName).toBe('test.doodle')
    expect(result?.savedAt).toBeTypeOf('number')
  })

  it('clears a session', async () => {
    const operations = [{ type: 'add_shape' as const, id: 'obj_1', shapeType: 'cube' as const, params: { width: 20, height: 20, depth: 20 }, color: '#89b4fa', transform: { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 } }]
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
    await autosaveSession([{ type: 'add_shape' as const, id: 'a', shapeType: 'cube' as const, params: { width: 10, height: 10, depth: 10 }, color: '#ff0000', transform: { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 } }], 1, 'first.doodle')
    await autosaveSession([{ type: 'add_shape' as const, id: 'b', shapeType: 'sphere' as const, params: { radius: 5 }, color: '#00ff00', transform: { x: 10, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 } }], 1, 'second.doodle')
    const result = await restoreSession()
    expect(result?.fileName).toBe('second.doodle')
    expect((result?.operations[0] as { id: string }).id).toBe('b')
  })
})
