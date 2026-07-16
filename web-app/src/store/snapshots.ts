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

import type { SceneObject } from '../csg/types'

const cache = new Map<number, Record<string, SceneObject>>()

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
}

/**
 * Returns the cached snapshot for the given index, or `undefined`
 * if no snapshot is available (must fall back to rebuildFromHistory).
 */
export function getCachedSnapshot(
  index: number,
): Record<string, SceneObject> | undefined {
  return cache.get(index)
}

/** Clear all cached snapshots (used on clearScene, openDoodle, loadFromProject). */
export function clearSnapshots(): void {
  cache.clear()
}
