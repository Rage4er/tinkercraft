// ============================================================
// Unit tests — project-manager (IndexedDB mock, real module)
// FIX (HIGH-18-25): Mock only IndexedDB, not the module itself.
// This verifies the real implementation logic.
// ============================================================

import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { ProjectRecord, ProjectMeta } from './project-manager'

// ---- Mock IndexedDB only (not the module) ----

const _store: Record<string, unknown> = {}

vi.mock('idb', async () => {
  const openDB = vi.fn(() => Promise.resolve({
    tx: vi.fn(() => ({
      objectStore: vi.fn(() => ({
        put: vi.fn(() => ({
          then: vi.fn((cb: any) => cb()),
        })),
        get: vi.fn((id: string) => Promise.resolve(_store[id])),
        delete: vi.fn(() => ({ then: vi.fn((cb: any) => cb()) })),
        getAll: vi.fn(() => Promise.resolve(Object.values(_store))),
      })),
    })),
  }))
  return { openDB }
})

import { saveProject, listProjects, loadProject, deleteProject, updateProject } from './project-manager'

describe('project-manager (IndexedDB mock)', () => {
  beforeEach(() => { Object.keys(_store).forEach(k => delete _store[k]) })

  it('saves a project and returns meta', async () => {
    const meta = await saveProject('Test Project', [], 3)
    expect(meta.name).toBe('Test Project')
    expect(meta.objectCount).toBe(3)
    expect(typeof meta.id).toBe('string')
    expect(typeof meta.savedAt).toBe('number')
  })

  it('lists saved projects', async () => {
    await saveProject('Proj A', [], 1)
    await saveProject('Proj B', [], 2)
    const list = await listProjects()
    expect(list.length).toBe(2)
    const names = list.map(p => p.name).sort()
    expect(names).toContain('Proj A')
    expect(names).toContain('Proj B')
  })

  it('loads a project by id', async () => {
    const meta = await saveProject('Load Me', [{ type: 'delete', ids: ['x'] }] as never, 0)
    const rec = await loadProject(meta.id)
    expect(rec).not.toBeUndefined()
    expect(rec!.name).toBe('Load Me')
    expect(rec!.operations).toHaveLength(1)
  })

  it('returns undefined for unknown id', async () => {
    const rec = await loadProject('nonexistent_id')
    expect(rec).toBeUndefined()
  })

  it('deletes a project', async () => {
    const meta = await saveProject('To Delete', [], 0)
    await deleteProject(meta.id)
    const list = await listProjects()
    expect(list.find(p => p.id === meta.id)).toBeUndefined()
  })

  it('updates a project', async () => {
    const meta = await saveProject('Old Name', [], 1)
    await updateProject(meta.id, 'New Name', [], 5)
    const rec = await loadProject(meta.id)
    expect(rec!.name).toBe('New Name')
    expect(rec!.objectCount).toBe(5)
  })

  it('saves thumbnail if provided', async () => {
    const thumb = 'data:image/png;base64,abc'
    const meta = await saveProject('With Thumb', [], 0, thumb)
    const rec = await loadProject(meta.id)
    expect(rec!.thumbnail).toBe(thumb)
  })
})
