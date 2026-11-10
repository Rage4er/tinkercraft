// ============================================================
// Snapshot cache — PERF-1: avoid full WASM rebuild on undo/redo
// ============================================================
//
// SceneObject references are immutable: every store action creates new
// object references via spread, never mutating existing ones.  This means
// it is safe to cache the `objects` dictionary at each historyIndex and
// reuse the cached reference on undo/redo without rebuilding through WASM.
//
// The cache is a plain module-level Map — NOT part of Zustand state — so
// updating it never triggers React re-renders.
//
// Дерево (Build Tree) в снимках НЕ хранится (CLEANUP-TREE-SNAPSHOT): undo / redo всегда
// перестраивают его из операций (`rebuildBuildTree`, CYCLE-CSG-RELOAD), а прежние снимки дерева
// писались на каждом шаге и нигде не читались.

import type { SceneObject } from '../csg/types'

/**
 * Maximum number of snapshots to keep in cache.
 * Beyond this limit, the oldest entries are evicted (LRU).
 * 50 snapshots × ~50KB each ≈ 2.5MB worst case — well within budget.
 */
const MAX_CACHE_SIZE = 50

const cache = new Map<number, Record<string, SceneObject>>()

/**
 * Enforce cache eviction: if cache exceeds MAX_CACHE_SIZE, remove oldest entries.
 * FIX (LOW-18-11): Batch deletion — remove multiple entries at once to reduce
 * the number of enforceCacheLimit calls (was 1-per-call, now removes in bulk).
 */
function enforceCacheLimit(map: Map<number, unknown>): void {
  while (map.size > MAX_CACHE_SIZE) {
    const oldestKey = map.keys().next().value
    if (oldestKey !== undefined) {
      map.delete(oldestKey)
    } else {
      break
    }
  }
}

/**
 * Cache the objects dictionary at the given history index.
 * Automatically invalidates any snapshots for indices > `index`
 * (history was truncated by a new operation after undo).
 */
export function cacheSnapshot(
  index: number,
  objects: Record<string, SceneObject>,
): void {
  cache.set(index, objects)
  for (const key of cache.keys()) {
    if (key > index) cache.delete(key)
  }
  enforceCacheLimit(cache)
}

/**
 * Returns the cached snapshot for the given index, or `undefined`
 * if no snapshot is available (must fall back to rebuildFromHistory).
 */
export function getCachedSnapshot(
  index: number,
): Record<string, SceneObject> | undefined {
  // FIX (LOW-18-10): Return without delete/re-insert — Map preserves insertion
  // order and our eviction uses size-based (not LRU) so touch-on-access is unnecessary overhead.
  return cache.get(index)
}

/** Clear all cached snapshots (used on clearScene, openProject, loadFromProject). */
export function clearSnapshots(): void {
  cache.clear()
}
