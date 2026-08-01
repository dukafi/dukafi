// ---------------------------------------------------------------------------
// Scheduled jobs — `api.cms.schedule.*`
// ---------------------------------------------------------------------------

/**
 * Cadence shapes the plugin can register. All times are interpreted in
 * UTC. The full set is restricted to a small enum of common intervals —
 * full cron strings are intentionally not supported. Plugin authors who
 * need irregular cadences ("every 13 minutes during business hours") can
 * implement that inside a handler that runs `every: { minutes: 1 }` and
 * gates internally.
 */
export type PluginScheduleCadence =
  | { interval: 'hourly' }
  | { interval: 'daily'; at: string }
  | { interval: 'weekly'; at: string; day: 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun' }
  | { interval: 'monthly'; at: string; dayOfMonth: number }
  | { interval: 'every'; minutes: number }

export type PluginScheduleOverlapPolicy = 'skip' | 'queue' | 'parallel'

export interface PluginScheduleDefinition {
  /**
   * Schedule id within the plugin's namespace. Final id is
   * `<pluginId>.<scheduleId>`. Must be unique per plugin.
   */
  id: string
  cadence: PluginScheduleCadence
  /**
   * What to do when a fire arrives while the previous run is still in
   * progress:
   *   - `'skip'`     — drop the new fire (default; safest)
   *   - `'queue'`    — FIFO queue, capped at 10
   *   - `'parallel'` — run concurrently (handler must be safe under it)
   */
  overlap?: PluginScheduleOverlapPolicy
  /**
   * Wall-clock budget for one fire of the handler. Defaults to 5_000ms.
   * Bounded by the host to 5 minutes to prevent any single plugin from
   * monopolising a worker.
   */
  maxDurationMs?: number
  /** Async handler — receives no arguments. Use closure scope for state. */
  handler: () => void | Promise<void>
}

export interface ServerPluginScheduleApi {
  /**
   * Register or update a scheduled job. Idempotent on re-activation —
   * calling with the same `id` keeps last-run history while replacing the
   * cadence + handler with whatever the latest `activate()` declared.
   */
  register: (def: PluginScheduleDefinition) => void
  /**
   * Cancel a previously-registered schedule. Removes the handler from the
   * VM and disables the row in the host. The row stays for audit; future
   * `register` calls re-enable it.
   */
  cancel: (scheduleId: string) => void
  /** Short form for `register({ id, cadence: { interval: 'daily', at }, handler })`. */
  daily: (id: string, at: string, handler: () => void | Promise<void>) => void
  /** Short form for `register({ id, cadence: { interval: 'hourly' }, handler })`. */
  hourly: (id: string, handler: () => void | Promise<void>) => void
  /** Short form for `register({ id, cadence: { interval: 'every', minutes }, handler })`. */
  every: (minutes: number, id: string, handler: () => void | Promise<void>) => void
}
