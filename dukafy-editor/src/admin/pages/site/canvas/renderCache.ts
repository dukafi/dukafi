/**
 * renderCache — bounded LRU cache for module render() output.
 *
 * WHY: `render()` is a pure function (Constraint #179) — identical (moduleId, props, children)
 * always returns the same RenderOutput. The editor canvas may trigger many re-renders per
 * second during interactions. Caching avoids redundant computation.
 *
 * Architecture:
 * - 500-entry LRU cap (Guideline #307 Hot Path 2)
 * - Cache key: `${moduleId}::${JSON.stringify(props)}::${children.join('||')}`
 *   NOTE: Relies on stable prop key insertion-order from the Zustand store — true for all
 *   store-derived props since slice setters always produce objects with consistent key order.
 * - `renderCache.clear()` MUST be called inside `siteSlice.loadSite()` before store
 *   hydration completes (Guideline #307). Without this, stale HTML from a previous site
 *   bleeds into the canvas on site switch.
 * - The publisher calls module `render()` directly — it bypasses this cache (intentional;
 *   publish is one-shot and the cache is editor-only).
 *
 * Usage:
 *   import { renderCache } from './renderCache'
 *   const cached = renderCache.get(moduleId, props, children)
 *   if (cached) return cached
 *   const output = mod.render(props, children)
 *   renderCache.set(moduleId, props, children, output)
 *   return output
 *
 * Hot-reload (Phase 9):
 *   Call renderCache.invalidateModule(moduleId) when a module is hot-replaced.
 *   This uses the LRUCache iterator to delete all entries for that module.
 */

import { LRUCache } from 'lru-cache'
import type { RenderOutput } from '@core/module-engine'

const CACHE_MAX = 500

type CacheKey = string

function makeCacheKey(
  moduleId: string,
  props: Record<string, unknown>,
  children: string[],
): CacheKey {
  // JSON.stringify is non-deterministic for objects with different key insertion-orders
  // in the general case, but Zustand store props always have stable insertion-order
  // (each slice setter produces objects with consistent key shapes).
  return `${moduleId}::${JSON.stringify(props)}::${children.join('||')}`
}

class RenderCache {
  private readonly _cache = new LRUCache<CacheKey, RenderOutput>({ max: CACHE_MAX })

  /**
   * Look up cached render output for the given (moduleId, props, children) triple.
   * Returns undefined on cache miss.
   */
  get(
    moduleId: string,
    props: Record<string, unknown>,
    children: string[],
  ): RenderOutput | undefined {
    return this._cache.get(makeCacheKey(moduleId, props, children))
  }

  /**
   * Store render output in the cache.
   * Silently evicts the LRU entry when the cache is full.
   */
  set(
    moduleId: string,
    props: Record<string, unknown>,
    children: string[],
    output: RenderOutput,
  ): void {
    this._cache.set(makeCacheKey(moduleId, props, children), output)
  }

  /**
   * Clear the entire cache.
   *
   * MUST be called inside `siteSlice.loadSite()` before store hydration
   * completes (Guideline #307 / Architect callout in message #1216).
   * Without this, stale HTML from a previously loaded site bleeds into the canvas.
   */
  clear(): void {
    this._cache.clear()
  }

  /**
   * Invalidate all cache entries for a specific module.
   *
   * Used during hot-reload in Phase 9: when a plugin module is updated,
   * its cached render outputs become stale. This sweeps all entries whose
   * cache key starts with `${moduleId}::`.
   *
   * The iterator-delete pattern is safe on LRUCache (documented behaviour).
   */
  invalidateModule(moduleId: string): void {
    const prefix = `${moduleId}::`
    for (const key of this._cache.keys()) {
      if (key.startsWith(prefix)) {
        this._cache.delete(key)
      }
    }
  }

  /** Number of entries currently in the cache. */
  get size(): number {
    return this._cache.size
  }
}

/** Module-level singleton. Shared across all components in the editor. */
export const renderCache = new RenderCache()
