/**
 * Pure rate-limit primitives for the RateLimiter Durable Object.
 * No `cloudflare:workers` imports so this stays unit-testable under node vitest.
 */

export interface WindowState {
  windowStart: number
  currCount: number
  prevCount: number
}

export function newWindow(now: number): WindowState {
  return { windowStart: now, currCount: 0, prevCount: 0 }
}

/** Roll the window forward to `now`, carrying the previous bucket for weighting. */
function roll(s: WindowState, now: number, windowMs: number): void {
  const elapsed = now - s.windowStart
  if (elapsed >= 2 * windowMs) {
    s.prevCount = 0
    s.currCount = 0
    s.windowStart = now
  } else if (elapsed >= windowMs) {
    s.prevCount = s.currCount
    s.currCount = 0
    s.windowStart += windowMs
  }
}

/**
 * Sliding-window-counter check. Rolls the window, computes the weighted estimate,
 * and (on allow) increments the current bucket. Returns the verdict.
 */
export function checkAndCount(
  s: WindowState,
  now: number,
  limit: number,
  windowMs: number,
): { allowed: boolean; retryAfterSec: number } {
  // Clamp defensively: a non-positive window (env misconfig) would make the
  // weight math degenerate (divide-by-zero / always-reset). Caller's `|| 10000`
  // guards 0/NaN but not negatives, so harden here where it's unit-testable.
  const w = windowMs > 0 ? windowMs : 1
  roll(s, now, w)
  const elapsedInCurr = now - s.windowStart
  const prevWeight = Math.max(0, 1 - elapsedInCurr / w)
  const estimated = s.currCount + s.prevCount * prevWeight
  if (estimated + 1 > limit) {
    const retryAfterSec = Math.max(1, Math.ceil((s.windowStart + w - now) / 1000))
    return { allowed: false, retryAfterSec }
  }
  s.currCount += 1
  return { allowed: true, retryAfterSec: 0 }
}

/** Bounded insertion-ordered LRU. `set` bumps recency; oldest is evicted past `cap`. */
export class LruMap<V> {
  private map = new Map<string, V>()
  constructor(private cap: number) {}

  get(key: string): V | undefined {
    return this.map.get(key)
  }

  set(key: string, value: V): void {
    if (this.map.has(key)) this.map.delete(key)
    this.map.set(key, value)
    if (this.map.size > this.cap) {
      const oldest = this.map.keys().next().value as string | undefined
      if (oldest !== undefined) this.map.delete(oldest)
    }
  }

  get size(): number {
    return this.map.size
  }
}
