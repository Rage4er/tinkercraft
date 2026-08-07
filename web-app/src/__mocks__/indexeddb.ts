// ============================================================
// In-memory IndexedDB mock for vitest (jsdom has no IndexedDB)
// Usage: import '../mocks/indexeddb' at the top of a test file
// ============================================================

type Key = string | number

class MockRequest<T = unknown> {
  result: T | undefined = undefined
  error: DOMException | null = null
  onsuccess: ((this: this, ev: Event) => void) | null = null
  onerror: ((this: this, ev: Event) => void) | null = null

  _resolveWith(val: T | undefined): void {
    this.result = val
    queueMicrotask(() => this.onsuccess?.call(this, new Event('success')))
  }

  _reject(err: DOMException): void {
    this.error = err
    queueMicrotask(() => this.onerror?.call(this, new Event('error')))
  }
}

class MockOpenDBRequest {
  result: IDBDatabase | undefined = undefined
  error: DOMException | null = null
  transaction: IDBTransaction | null = null
  source: IDBObjectStore | null = null
  readyState: IDBRequestReadyState = 'pending'
  onsuccess: ((this: this, ev: Event) => void) | null = null
  onerror: ((this: this, ev: Event) => void) | null = null
  onupgradeneeded: ((this: this, ev: IDBVersionChangeEvent) => void) | null = null
  onblocked: ((this: this, ev: Event) => void) | null = null

  _fireUpgrade(db: MockDatabase, oldVersion: number, newVersion: number): void {
    this.result = db as unknown as IDBDatabase
    this.readyState = 'done'
    queueMicrotask(() => {
      const ev = { oldVersion, newVersion } as IDBVersionChangeEvent
      this.onupgradeneeded?.call(this, ev)
      // Fire onsuccess after upgrade handler runs
      queueMicrotask(() => this.onsuccess?.call(this, new Event('success')))
    })
  }

  _fireSuccess(db: MockDatabase): void {
    this.result = db as unknown as IDBDatabase
    this.readyState = 'done'
    queueMicrotask(() => this.onsuccess?.call(this, new Event('success')))
  }
}

class MockObjectStore {
  data = new Map<Key, unknown>()
  name: string
  keyPath: string | string[] | null
  indexNames: DOMStringList

  constructor(name: string, keyPath?: string | string[]) {
    this.name = name
    this.keyPath = keyPath ?? null
    this.indexNames = {
      length: 0, item: () => null, contains: () => false,
      [Symbol.iterator]: function* () { },
    } as unknown as DOMStringList
  }

  put(value: unknown, key?: Key): MockRequest<Key> {
    const k = key ?? (this.keyPath ? (value as Record<string, unknown>)?.[this.keyPath as string] as Key : undefined) ?? Date.now()
    this.data.set(k, value)
    const req = new MockRequest<Key>()
    req._resolveWith(k)
    return req
  }

  get(key: Key): MockRequest<unknown> {
    const req = new MockRequest<unknown>()
    req._resolveWith(this.data.get(key))
    return req
  }

  delete(key: Key): MockRequest<undefined> {
    this.data.delete(key)
    const req = new MockRequest<undefined>()
    req._resolveWith(undefined)
    return req
  }

  clear(): MockRequest<undefined> {
    this.data.clear()
    const req = new MockRequest<undefined>()
    req._resolveWith(undefined)
    return req
  }

  getAll(): MockRequest<unknown[]> {
    const req = new MockRequest<unknown[]>()
    req._resolveWith([...this.data.values()])
    return req
  }

  count(): MockRequest<number> {
    const req = new MockRequest<number>()
    req._resolveWith(this.data.size)
    return req
  }

  createIndex(): IDBIndex {
    return {} as IDBIndex
  }

  index(): IDBIndex {
    return {} as IDBIndex
  }
}

class MockTransaction {
  objectStoreNames: DOMStringList
  mode: IDBTransactionMode
  db: IDBDatabase
  error: DOMException | null = null
  oncomplete: ((this: this, ev: Event) => void) | null = null
  onerror: ((this: this, ev: Event) => void) | null = null
  onabort: ((this: this, ev: Event) => void) | null = null
  private _stores: Map<string, MockObjectStore>

  constructor(db: IDBDatabase, stores: Map<string, MockObjectStore>, mode: IDBTransactionMode) {
    this.db = db
    this._stores = stores
    this.mode = mode
    this.objectStoreNames = {
      length: stores.size,
      item: (i: number) => [...stores.keys()][i] ?? null,
      contains: (name: string) => stores.has(name),
      [Symbol.iterator]: function* () { yield* stores.keys() },
    } as unknown as DOMStringList

    // Auto-complete after microtask drain
    queueMicrotask(() => {
      queueMicrotask(() => {
        queueMicrotask(() => this.oncomplete?.call(this, new Event('complete')))
      })
    })
  }

  objectStore(name: string): MockObjectStore {
    const s = this._stores.get(name)
    if (!s) throw new DOMException(`Object store "${name}" not found`, 'NotFoundError')
    return s
  }

  abort(): void {
    this.onabort?.call(this, new Event('abort'))
  }
}

class MockDatabase {
  name: string
  version: number
  objectStoreNames: DOMStringList
  private _stores = new Map<string, MockObjectStore>()

  constructor(name: string, version: number) {
    this.name = name
    this.version = version
    this.objectStoreNames = this._buildNames()
  }

  private _buildNames(): DOMStringList {
    const keys = [...this._stores.keys()]
    return {
      length: keys.length,
      item: (i: number) => keys[i] ?? null,
      contains: (name: string) => this._stores.has(name),
      [Symbol.iterator]: function* () { yield* keys },
    } as unknown as DOMStringList
  }

  createObjectStore(name: string, options?: IDBObjectStoreParameters): MockObjectStore {
    const keyPath = options?.keyPath as string | string[] | undefined
    const s = new MockObjectStore(name, keyPath)
    this._stores.set(name, s)
    this.objectStoreNames = this._buildNames()
    return s
  }

  deleteObjectStore(name: string): void {
    this._stores.delete(name)
    this.objectStoreNames = this._buildNames()
  }

  transaction(storeNames: string | string[], mode?: IDBTransactionMode): MockTransaction {
    const names = Array.isArray(storeNames) ? storeNames : [storeNames]
    const txStores = new Map<string, MockObjectStore>()
    for (const n of names) {
      const s = this._stores.get(n)
      if (!s) throw new DOMException(`Store "${n}" not found`, 'NotFoundError')
      txStores.set(n, s)
    }
    return new MockTransaction(this as unknown as IDBDatabase, txStores, mode ?? 'readonly')
  }

  close(): void { }
}

// Global DB registry — tests can inspect/reset state
const _dbs = new Map<string, MockDatabase>()

export function _resetMockIndexedDB(): void {
  _dbs.clear()
}

const mockFactory: IDBFactory = {
  open(name: string, version?: number): IDBOpenDBRequest {
    const ver = version ?? 1
    let db = _dbs.get(name)
    const isNew = !db
    if (!db) {
      db = new MockDatabase(name, ver)
      _dbs.set(name, db)
    }
    const req = new MockOpenDBRequest()
    if (isNew) {
      req._fireUpgrade(db, 0, ver)
    } else {
      req._fireSuccess(db)
    }
    return req as unknown as IDBOpenDBRequest
  },

  deleteDatabase(name: string): IDBOpenDBRequest {
    _dbs.delete(name)
    const req = new MockOpenDBRequest()
    queueMicrotask(() => req.onsuccess?.call(req, new Event('success')))
    return req as unknown as IDBOpenDBRequest
  },

  cmp(a: Key, b: Key): number {
    if (a === b) return 0
    return a < b ? -1 : 1
  },

  databases(): Promise<IDBDatabaseInfo[]> {
    return Promise.resolve([..._dbs.entries()].map(([n, db]) => ({ name: n, version: db.version })))
  },
}

Object.defineProperty(globalThis, 'indexedDB', {
  value: mockFactory,
  writable: true,
  configurable: true,
})
