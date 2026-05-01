// Per-Worker in-memory sliding window. Good enough for v1 — there's only
// one Pages instance per region, and exceeding the limit returns 429 quickly
// rather than blocking. If we outgrow this, swap for Durable Object counters.

const buckets = new Map<string, number[]>()  // key -> sorted timestamps (ms)

export interface AllowResult {
  allowed: boolean
  retry_after_ms?: number
}

export function allowRequest(key: string, max: number, windowMs: number): AllowResult {
  const now = Date.now()
  const cutoff = now - windowMs
  let arr = buckets.get(key) ?? []
  // Drop expired
  while (arr.length && arr[0] < cutoff) arr.shift()
  if (arr.length >= max) {
    const earliest = arr[0]
    return { allowed: false, retry_after_ms: Math.max(1, earliest + windowMs - now) }
  }
  arr.push(now)
  buckets.set(key, arr)
  return { allowed: true }
}

/** Test-only reset — DO NOT call from production code. */
export function _resetRateLimitForTests(): void {
  buckets.clear()
}
