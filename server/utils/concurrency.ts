/**
 * Bounded-concurrency map.
 *
 * Runs `fn` over `items` with at most `limit` in flight, preserving input
 * order in the result. Use it wherever a handler loops over a growing N of
 * network calls — a fully sequential loop outgrows the Cloudflare execution
 * window as soon as N does (see the GA4 sync timeout and the Xero
 * bank-monitoring transaction loop).
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  const workerCount = Math.max(1, Math.min(limit, items.length))
  const workers = Array.from({ length: workerCount }, async () => {
    for (;;) {
      const i = next++
      if (i >= items.length) return
      results[i] = await fn(items[i]!, i)
    }
  })
  await Promise.all(workers)
  return results
}
