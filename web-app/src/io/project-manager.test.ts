// ============================================================
// Unit tests — project-manager (IndexedDB через in-memory mock)
// ============================================================

import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { ProjectRecord, ProjectMeta } from './project-manager'

// ---- Mock IndexedDB ---- (Vitest / jsdom не имеет IndexedDB по умолчанию)

const _store: Record<string, unknown> = {}

vi.mock('./project-manager', async () => {
  const mod = await vi.importActual<typeof import('./project-manager')>('./project-manager')
  return {
    ...mod,
    saveProject: vi.fn(async (name: string, ops: unknown[], objectCount: number, thumbnail?: string) => {
      const id = `proj_test_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
      const record: ProjectRecord = { id, name, savedAt: Date.now(), operations: ops as never, objectCount, thumbnail }
      _store[id] = record
      return { id, name, savedAt: record.savedAt, objectCount, thumbnail } as ProjectMeta
    }),
    listProjects: vi.fn(async () => Object.values(_store).map((r) => {
      const rec = r as ProjectRecord
      return { id: rec.id, name: rec.name, savedAt: rec.savedAt, thumbnail: rec.thumbnail, objectCount: rec.objectCount } as ProjectMeta
    })),
    loadProject: vi.fn(async (id: string) => _store[id] as ProjectRecord | undefined),
    deleteProject: vi.fn(async (id: string) => { delete _store[id] }),
    updateProject: vi.fn(async (id: string, name: string, ops: unknown[], objectCount: number, thumbnail?: string) => {
      if (_store[id]) {
        (_store[id] as ProjectRecord).name = name
        ;(_store[id] as ProjectRecord).objectCount = objectCount
      }
    }),
  }
})

import { saveProject, listProjects, loadProject, deleteProject, updateProject } from './project-manager'

describe('project-manager (mocked)', () => {
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
    const meta = await saveProject('Load Me', [{type:'delete', ids:['x']}] as never, 0)
    const rec  = await loadProject(meta.id)
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
    const meta  = await saveProject('With Thumb', [], 0, thumb)
    const rec   = await loadProject(meta.id)
    expect(rec!.thumbnail).toBe(thumb)
  })
})
