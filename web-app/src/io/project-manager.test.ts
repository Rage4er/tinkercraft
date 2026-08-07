// ============================================================
// Unit tests — project-manager (IndexedDB mock, real module)
// Uses shared mock from __mocks__/indexeddb.ts
// ============================================================

import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { ProjectRecord, ProjectMeta } from './project-manager'

// Install IndexedDB mock on globalThis
import '../__mocks__/indexeddb'
import { _resetMockIndexedDB } from '../__mocks__/indexeddb'

// Dynamic imports — need vi.resetModules() because project-manager caches _dbCache
let saveProject: typeof import('./project-manager').saveProject
let listProjects: typeof import('./project-manager').listProjects
let loadProject: typeof import('./project-manager').loadProject
let deleteProject: typeof import('./project-manager').deleteProject
let updateProject: typeof import('./project-manager').updateProject

describe('project-manager (IndexedDB mock)', () => {
  beforeEach(async () => {
    _resetMockIndexedDB()
    vi.resetModules()
    // Re-install mock after module reset
    await import('../__mocks__/indexeddb')
    const mod = await import('./project-manager')
    saveProject = mod.saveProject
    listProjects = mod.listProjects
    loadProject = mod.loadProject
    deleteProject = mod.deleteProject
    updateProject = mod.updateProject
  })

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
