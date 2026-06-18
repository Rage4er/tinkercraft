// ============================================================
// Автосохранение в IndexedDB — восстанавливает сцену при перезагрузке
// ============================================================

import type { TinkerCraftOperation } from '../csg/types'

const DB_NAME    = 'tinkercraft-v1'
const STORE_NAME = 'autosave'
const KEY        = 'session'

interface AutosaveEntry {
  operations: TinkerCraftOperation[]
  historyIndex: number
  fileName: string | null
  savedAt: number
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror   = () => reject(req.error)
  })
}

export async function autosaveSession(
  operations: TinkerCraftOperation[],
  historyIndex: number,
  fileName: string | null,
): Promise<void> {
  try {
    const db = await openDB()
    const entry: AutosaveEntry = { operations, historyIndex, fileName, savedAt: Date.now() }
    await new Promise<void>((resolve, reject) => {
      const tx  = db.transaction(STORE_NAME, 'readwrite')
      const req = tx.objectStore(STORE_NAME).put(entry, KEY)
      req.onsuccess = () => resolve()
      req.onerror   = () => reject(req.error)
    })
  } catch (e) {
    console.warn('[AutoSave] write error:', e)
  }
}

export async function restoreSession(): Promise<AutosaveEntry | null> {
  try {
    const db = await openDB()
    return await new Promise<AutosaveEntry | null>((resolve, reject) => {
      const tx  = db.transaction(STORE_NAME, 'readonly')
      const req = tx.objectStore(STORE_NAME).get(KEY)
      req.onsuccess = () => resolve((req.result as AutosaveEntry) ?? null)
      req.onerror   = () => reject(req.error)
    })
  } catch (e) {
    console.warn('[AutoSave] read error:', e)
    return null
  }
}

export async function clearAutosave(): Promise<void> {
  try {
    const db = await openDB()
    await new Promise<void>((resolve, reject) => {
      const tx  = db.transaction(STORE_NAME, 'readwrite')
      const req = tx.objectStore(STORE_NAME).delete(KEY)
      req.onsuccess = () => resolve()
      req.onerror   = () => reject(req.error)
    })
  } catch (e) {
    console.warn('[AutoSave] clear error:', e)
  }
}
