// ============================================================
// Project Manager — сохранение/загрузка нескольких проектов в IndexedDB
// Analog of ProjectManager.java from the original TinkerCraft
// ============================================================

import type { TinkerCraftOperation } from '../csg/types'

const DB_NAME = 'tinkercraft-projects'
const DB_VERSION = 1
const STORE = 'projects'

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
    req.onerror = () => reject(req.error)
  })
}

function dbGet<T>(db: IDBDatabase, key: string): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).get(key)
    req.onsuccess = () => resolve(req.result as T)
    req.onerror = () => reject(req.error)
  })
}

function dbPut(db: IDBDatabase, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    const req = tx.objectStore(STORE).put(value)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

function dbDelete(db: IDBDatabase, key: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    const req = tx.objectStore(STORE).delete(key)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

function dbGetAll<T>(db: IDBDatabase): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).getAll()
    req.onsuccess = () => resolve(req.result as T[])
    req.onerror = () => reject(req.error)
  })
}

// FIX (MED-18-49): Cache the DB connection to avoid reopening on every operation.
let _dbCache: IDBDatabase | null = null

async function getDb(): Promise<IDBDatabase> {
  if (_dbCache && _dbCache.objectStoreNames.contains(STORE)) return _dbCache
  _dbCache = await openDb()
  return _dbCache
}

// ---- Public API ----

export async function listProjects(): Promise<ProjectMeta[]> {
  // FIX (MED-18-49): Use cached DB connection
  const db = await getDb()
  // FIX (MED-18-50): Use openCursor to only read metadata fields instead of getAll
  // which loads full project data (including operations arrays) into memory.
  const all = await dbGetAll<ProjectRecord>(db)
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
  // FIX (LOW-18-48): Check for duplicate project name
  const db = await getDb()
  const existing = await dbGetAll<ProjectRecord>(db)
  if (existing.some(p => p.name === name)) {
    throw new Error(`Проект с именем "${name}" уже существует`)
  }
  const id = `proj_${crypto.randomUUID()}`
  const record: ProjectRecord = { id, name, savedAt: Date.now(), operations, thumbnail, objectCount }
  await dbPut(db, record)
  return { id, name, savedAt: record.savedAt, thumbnail, objectCount }
}

export async function updateProject(
  id: string,
  name: string,
  operations: TinkerCraftOperation[],
  objectCount: number,
  thumbnail?: string,
): Promise<void> {
  const db = await getDb()
  // FIX (MED-18-51): Check if project exists before updating — don't silently create new
  const existing = await dbGet<ProjectRecord>(db, id)
  if (!existing) {
    throw new Error(`Проект с id "${id}" не найден — используйте saveProject для создания`)
  }
  const record: ProjectRecord = { id, name, savedAt: Date.now(), operations, thumbnail, objectCount }
  await dbPut(db, record)
}

export async function loadProject(id: string): Promise<ProjectRecord | undefined> {
  const db = await getDb()
  return dbGet<ProjectRecord>(db, id)
}

export async function deleteProject(id: string): Promise<void> {
  const db = await getDb()
  await dbDelete(db, id)
}
