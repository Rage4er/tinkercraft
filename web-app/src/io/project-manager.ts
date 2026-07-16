// ============================================================
// Project Manager — сохранение/загрузка нескольких проектов в IndexedDB
// Analog of ProjectManager.java from the original TinkerCraft
// ============================================================

import type { TinkerCraftOperation } from '../csg/types'

const DB_NAME    = 'tinkercraft-projects'
const DB_VERSION = 1
const STORE      = 'projects'

export interface ProjectMeta {
  id: string
  name: string
  savedAt: number
  thumbnail?: string
  objectCount: number
}

export interface ProjectRecord extends ProjectMeta {
  operations: TinkerCraftOperation[]
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror   = () => reject(req.error)
  })
}

function dbGet<T>(db: IDBDatabase, key: string): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).get(key)
    req.onsuccess = () => resolve(req.result as T)
    req.onerror   = () => reject(req.error)
  })
}

function dbPut(db: IDBDatabase, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE, 'readwrite')
    const req = tx.objectStore(STORE).put(value)
    req.onsuccess = () => resolve()
    req.onerror   = () => reject(req.error)
  })
}

function dbDelete(db: IDBDatabase, key: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE, 'readwrite')
    const req = tx.objectStore(STORE).delete(key)
    req.onsuccess = () => resolve()
    req.onerror   = () => reject(req.error)
  })
}

function dbGetAll<T>(db: IDBDatabase): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).getAll()
    req.onsuccess = () => resolve(req.result as T[])
    req.onerror   = () => reject(req.error)
  })
}

// ---- Public API ----

export async function listProjects(): Promise<ProjectMeta[]> {
  const db = await openDb()
  const all = await dbGetAll<ProjectRecord>(db)
  db.close()
  return all
    .map(r => ({ id: r.id, name: r.name, savedAt: r.savedAt, thumbnail: r.thumbnail, objectCount: r.objectCount }))
    .sort((a, b) => b.savedAt - a.savedAt)
}

export async function saveProject(
  name: string,
  operations: TinkerCraftOperation[],
  objectCount: number,
  thumbnail?: string,
): Promise<ProjectMeta> {
  const db = await openDb()
  const id = `proj_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
  const record: ProjectRecord = { id, name, savedAt: Date.now(), operations, thumbnail, objectCount }
  await dbPut(db, record)
  db.close()
  return { id, name, savedAt: record.savedAt, thumbnail, objectCount }
}

export async function updateProject(
  id: string,
  name: string,
  operations: TinkerCraftOperation[],
  objectCount: number,
  thumbnail?: string,
): Promise<void> {
  const db = await openDb()
  const record: ProjectRecord = { id, name, savedAt: Date.now(), operations, thumbnail, objectCount }
  await dbPut(db, record)
  db.close()
}

export async function loadProject(id: string): Promise<ProjectRecord | undefined> {
  const db = await openDb()
  const r  = await dbGet<ProjectRecord>(db, id)
  db.close()
  return r
}

export async function deleteProject(id: string): Promise<void> {
  const db = await openDb()
  await dbDelete(db, id)
  db.close()
}
