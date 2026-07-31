/**
 * Run `worker(item)` over `items` with at most `limit` tasks in flight at any
 * time. Resolves once every item has been processed; rejects on the first
 * worker error (other in-flight tasks resolve / reject as they finish but
 * their values are not collected). Order of `results` matches `items`.
 *
 * Domain-agnostic: no font / network / file knowledge — just bounded parallel
 * iteration. Used by the Google Fonts installer to cap concurrent woff2
 * downloads.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let cursor = 0
  async function pump(): Promise<void> {
    while (cursor < items.length) {
      const i = cursor++
      results[i] = await worker(items[i], i)
    }
  }
  const workers = Array.from({ length: Math.min(limit, items.length) }, () => pump())
  await Promise.all(workers)
  return results
}
