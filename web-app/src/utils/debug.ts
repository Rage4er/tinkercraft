// ============================================================
// Debug logging — conditional logs only in development
// ============================================================
// В режиме разработки (pnpm dev) логи выводятся.
// В продакшн-сборке (pnpm build) логи полностью отсутствуют (tree-shaken).
// Vite автоматически определяет режим через import.meta.env.DEV.

/** true — только в режиме разработки (pnpm dev), false — в продакшн-сборке */
export const isDev = import.meta.env.DEV

// ---------------------------------------------------------------------------
// Base loggers
// ---------------------------------------------------------------------------

/** Условный лог — выводит сообщение ТОЛЬКО в режиме разработки. */
export function devLog(prefix: string, ...args: unknown[]): void {
  if (isDev) console.log(`[${prefix}]`, ...args)
}

/** Условный ворнинг — выводит сообщение ТОЛЬКО в режиме разработки. */
export function devWarn(prefix: string, ...args: unknown[]): void {
  if (isDev) console.warn(`[${prefix}]`, ...args)
}

// ---------------------------------------------------------------------------
// Specialized loggers (one per diagnostic domain)
// ---------------------------------------------------------------------------

/**
 * Transform logger — logs position/rotation/scale of objects.
 * @example devLogTransform(action, id, transform)
 */
export const devLogTransform = (action: string, id: string, transform: { x: number; y: number; z: number; rotX: number; rotY: number; rotZ: number; scaleX: number; scaleY: number; scaleZ: number }): void => {
  if (isDev) console.log(`[TRANSFORM:${action}] id=${id} pos(${transform.x},${transform.y},${transform.z}) rot(${transform.rotX},${transform.rotY},${transform.rotZ}) scl(${transform.scaleX},${transform.scaleY},${transform.scaleZ})`)
}

/**
 * Params logger — logs shape parameters (width, height, radius, sides…).
 * @example devLogParams(action, shapeType, params)
 */
export const devLogParams = (action: string, shapeType: string, params: Record<string, unknown>): void => {
  if (isDev) console.log(`[PARAMS:${action}] shape=${shapeType} ${Object.entries(params as Record<string, number>).map(([k, v]) => `${k}=${v}`).join(' ')}`)
}

/**
 * Event logger — logs user events (pointer, transform, resize, fillet, color, visibility).
 * @example devLogEvent(category, event, data)
 */
export const devLogEvent = (category: string, event: string, data?: unknown): void => {
  if (isDev) {
    if (data !== undefined) console.log(`[EVENT:${category}:${event}]`, data)
    else console.log(`[EVENT:${category}:${event}]`)
  }
}

/**
 * Pointer logger — logs mouse coordinates (screen/world/ndc).
 * @example devLogPointer(event, data)
 */
export const devLogPointer = (event: string, data: { screenX?: number; screenY?: number; worldX?: number; worldY?: number; worldZ?: number; ndcX?: number; ndcY?: number }): void => {
  if (isDev) {
    const parts: string[] = []
    if (data.screenX !== undefined) parts.push(`sx=${data.screenX}`)
    if (data.screenY !== undefined) parts.push(`sy=${data.screenY}`)
    if (data.worldX !== undefined) parts.push(`wx=${data.worldX}`)
    if (data.worldY !== undefined) parts.push(`wy=${data.worldY}`)
    if (data.worldZ !== undefined) parts.push(`wz=${data.worldZ}`)
    if (data.ndcX !== undefined) parts.push(`ndcX=${data.ndcX}`)
    if (data.ndcY !== undefined) parts.push(`ndcY=${data.ndcY}`)
    console.log(`[POINTER:${event}] ${parts.join(' ')}`)
  }
}

/**
 * Store logger — logs Zustand store changes (create/update/delete/meshSync).
 * @example devLogStore(action, data)
 */
export const devLogStore = (action: string, data?: unknown): void => {
  if (isDev) {
    if (data !== undefined) console.log(`[STORE:${action}]`, data)
    else console.log(`[STORE:${action}]`)
  }
}

/**
 * CSG logger — logs CSG operations (boolean, ms, tris).
 * @example devLogCsg(action, data)
 */
export const devLogCsg = (action: string, data?: unknown): void => {
  if (isDev) {
    if (data !== undefined) console.log(`[CSG:${action}]`, data)
    else console.log(`[CSG:${action}]`)
  }
}

/**
 * Worker logger — logs WASM worker communication (send/receive/error with timings).
 * @example devLogWorker('send', 'buildShape', { objId, shapeType })
 */
export const devLogWorker = (direction: 'send' | 'receive' | 'error', operation: string, data?: unknown, ms?: number): void => {
  if (isDev) {
    const suffix = ms !== undefined ? ` ${ms}ms` : ''
    if (data !== undefined) console.log(`[WORKER:${direction}:${operation}]${suffix}`, data)
    else console.log(`[WORKER:${direction}:${operation}]${suffix}`)
  }
}

/**
 * Snap logger — logs snap-to-geometry (type/point/distance).
 * @example devLogSnap(action, data)
 */
export const devLogSnap = (action: string, data: { type?: string; point?: { x: number; y: number; z: number }; distance?: number }): void => {
  if (isDev) {
    const parts: string[] = []
    if (data.type) parts.push(`type=${data.type}`)
    if (data.point) parts.push(`pt(${data.point.x},${data.point.y},${data.point.z})`)
    if (data.distance !== undefined) parts.push(`dist=${data.distance}`)
    console.log(`[SNAP:${action}] ${parts.join(' ')}`)
  }
}
