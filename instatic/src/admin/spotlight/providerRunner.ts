/**
 * providerRunner — async provider lifecycle manager.
 *
 * Responsibilities per provider:
 *   - Per-provider AbortController: cancel the previous in-flight call when
 *     the query changes or the palette closes.
 *   - Per-provider debounce (configurable via SpotlightProvider.debounceMs,
 *     default 150 ms; 0 = synchronous / next microtask).
 *   - Per-provider result cache: keyed `${providerId}:${query}`, 30-second TTL,
 *     cleared when the palette closes.
 *   - Max one in-flight call per provider at any time.
 *
 * Design:
 *   - Plain class (no React) — held in a useRef in SpotlightProvider so the
 *     instance is stable across renders.
 *   - All side effects dispatch into the spotlight reducer via the supplied
 *     `dispatch` callback.
 *   - Errors are caught, logged with `[spotlight:<providerId>]` prefix, and
 *     surfaced to the UI as a SET_LOADING_PROVIDER(false) (clears the spinner)
 *     rather than thrown (no crash).
 */

import type { SpotlightAction } from './state'
import type { SpotlightProvider, CommandContext, Command } from './types'
import { getScope, getPluginPaletteSpotlightProviders } from './commandRegistry'

const CACHE_TTL_MS = 30_000

interface CacheEntry {
  results: Command[]
  expires: number
}

interface ProviderState {
  abortController: AbortController | null
  debounceTimer: ReturnType<typeof setTimeout> | null
}

export class ProviderRunner {
  private readonly dispatch: (action: SpotlightAction) => void
  private readonly getContext: () => CommandContext | null

  /** Per-provider runtime state (abort + debounce). */
  private providerStates = new Map<string, ProviderState>()

  /** Cache keyed by `"${providerId}:${query}"`. */
  private cache = new Map<string, CacheEntry>()

  constructor(
    dispatch: (action: SpotlightAction) => void,
    getContext: () => CommandContext | null,
  ) {
    this.dispatch = dispatch
    this.getContext = getContext
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  /**
   * Fire all providers for the given scope + query.
   *
   * Includes both scope-local providers (from the scope definition) and
   * plugin-registered palette providers (from the plugin runtime). Plugin
   * providers fire regardless of active scope so they are available in the
   * root palette and in any scope where the user is typing.
   *
   * Providers with debounceMs > 0 are deferred; providers with debounceMs === 0
   * run as soon as the current JS task yields (setTimeout 0 equivalent, via
   * a resolved Promise microtask for zero-latency locals).
   *
   * Note: invoked as `runner.run(...)` where `runner = runnerRef.current` in
   * `SpotlightRoot.tsx` — fallow can't trace method calls through useRef.
   */
  // fallow-ignore-next-line unused-class-member
  run(scopeId: string, query: string): void {
    const scope = getScope(scopeId)
    const scopeProviders = scope?.providers ?? []
    const pluginProviders = getPluginPaletteSpotlightProviders()

    // Deduplicate by id in case a provider appears in both lists (unlikely
    // but defensive), preferring the scope-local definition.
    const seen = new Set<string>()
    const providers: SpotlightProvider[] = []
    for (const p of scopeProviders) {
      if (!seen.has(p.id)) { seen.add(p.id); providers.push(p) }
    }
    for (const p of pluginProviders) {
      if (!seen.has(p.id)) { seen.add(p.id); providers.push(p) }
    }

    // Cancel any providers that are no longer in the active set.
    const activeIds = new Set(providers.map((p) => p.id))
    for (const [id, state] of this.providerStates) {
      if (!activeIds.has(id)) {
        this.cancelProvider(id, state)
        this.providerStates.delete(id)
      }
    }

    for (const provider of providers) {
      this.scheduleProvider(provider, query)
    }
  }

  /**
   * Abort all in-flight calls, clear debounce timers, and clear the result
   * cache. Called when the palette closes or the scope stack changes.
   */
  reset(): void {
    for (const [id, state] of this.providerStates) {
      this.cancelProvider(id, state)
    }
    this.providerStates.clear()
    this.cache.clear()
  }

  // ─── Internal ───────────────────────────────────────────────────────────────

  private scheduleProvider(provider: SpotlightProvider, query: string): void {
    const state = this.ensureProviderState(provider.id)

    // Cancel any pending debounce / in-flight call.
    this.cancelProvider(provider.id, state)

    const debounceMs = provider.debounceMs ?? 150

    if (debounceMs <= 0) {
      // Zero debounce: fire in the next microtask so callers that call run()
      // synchronously don't block the React render.
      void Promise.resolve().then(() => this.fireProvider(provider, query))
    } else {
      state.debounceTimer = setTimeout(() => {
        state.debounceTimer = null
        void this.fireProvider(provider, query)
      }, debounceMs)
    }
  }

  private async fireProvider(provider: SpotlightProvider, query: string): Promise<void> {
    const cacheKey = `${provider.id}:${query}`

    // Cache hit: dispatch immediately, no loading state needed.
    const cached = this.cache.get(cacheKey)
    if (cached && Date.now() < cached.expires) {
      this.dispatch({ type: 'SET_ASYNC_RESULTS', providerId: provider.id, results: cached.results })
      return
    }

    const ctx = this.getContext()
    if (!ctx) return

    const state = this.ensureProviderState(provider.id)
    const abort = new AbortController()
    state.abortController = abort

    this.dispatch({ type: 'SET_LOADING_PROVIDER', providerId: provider.id, loading: true })

    try {
      const results = await provider.search(query, ctx, abort.signal)

      // Don't dispatch if aborted (scope changed, palette closed, new query).
      if (abort.signal.aborted) return

      // Cache the result.
      this.cache.set(cacheKey, { results, expires: Date.now() + CACHE_TTL_MS })

      this.dispatch({ type: 'SET_ASYNC_RESULTS', providerId: provider.id, results })
    } catch (err) {
      if (abort.signal.aborted) return
      console.error(`[spotlight:${provider.id}] search failed:`, err)
      // Clear loading state so the UI doesn't show a spinner indefinitely.
      this.dispatch({ type: 'SET_LOADING_PROVIDER', providerId: provider.id, loading: false })
    } finally {
      if (!abort.signal.aborted) {
        state.abortController = null
      }
    }
  }

  private cancelProvider(id: string, state: ProviderState): void {
    if (state.debounceTimer !== null) {
      clearTimeout(state.debounceTimer)
      state.debounceTimer = null
    }
    if (state.abortController) {
      state.abortController.abort()
      state.abortController = null
      // Clear loading indicator for the cancelled provider.
      this.dispatch({ type: 'SET_LOADING_PROVIDER', providerId: id, loading: false })
    }
  }

  private ensureProviderState(id: string): ProviderState {
    let state = this.providerStates.get(id)
    if (!state) {
      state = { abortController: null, debounceTimer: null }
      this.providerStates.set(id, state)
    }
    return state
  }
}

