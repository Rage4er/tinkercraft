// ============================================================
// Auto-save to IndexedDB — restores scene on reload
// ============================================================

import type { TinkerCraftOperation } from '../csg/types'

const DB_NAME = 'tinkercraft-v1'
/** IndexedDB schema version. Bump when store structure changes to trigger migration. */
const DB_VERSION = 2
const STORE_NAME = 'autosave'
const KEY = 'session'

interface AutosaveEntry {
  operations: TinkerCraftOperation[]
  historyIndex: number
  fileName: string | null
  savedAt: number
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = (e) => {
      const db = req.result
      // Migration from v1 to v2: recreate store if needed
      if (!e.oldVersion || e.oldVersion < 2) {
        if (db.objectStoreNames.contains(STORE_NAME)) {
          db.deleteObjectStore(STORE_NAME)
        }
        db.createObjectStore(STORE_NAME)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
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
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const req = tx.objectStore(STORE_NAME).put(entry, KEY)
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
    })
  } catch (e) {
    console.warn('[AutoSave] write error:', e)
  }
}

export async function restoreSession(): Promise<AutosaveEntry | null> {
  try {
    const db = await openDB()
    return await new Promise<AutosaveEntry | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const req = tx.objectStore(STORE_NAME).get(KEY)
      req.onsuccess = () => resolve((req.result as AutosaveEntry) ?? null)
      req.onerror = () => reject(req.error)
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
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const req = tx.objectStore(STORE_NAME).delete(KEY)
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
    })
  } catch (e) {
    console.warn('[AutoSave] clear error:', e)
  }
}
