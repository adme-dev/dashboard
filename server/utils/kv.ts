import type { H3Event } from 'h3'

/** Minimal KV interface matching Cloudflare KVNamespace */
interface KV {
  get(key: string, type: 'text'): Promise<string | null>
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>
  delete(key: string): Promise<void>
}

/**
 * Get the Cloudflare KV namespace from the event context.
 * Returns null when KV is unavailable (local dev without wrangler).
 */
export function getKV(event: H3Event): KV | null {
  try {
    const env = (event.context as any).cloudflare?.env
    return env?.CACHE ?? null
  } catch {
    return null
  }
}

/**
 * Get a JSON value from KV. Returns null on miss or error.
 */
export async function kvGet<T>(event: H3Event, key: string): Promise<T | null> {
  try {
    const kv = getKV(event)
    if (!kv) return null
    const raw = await kv.get(key, 'text')
    if (!raw) return null
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

/**
 * Put a JSON value into KV with TTL (in seconds).
 */
export async function kvPut<T>(event: H3Event, key: string, data: T, ttlSeconds: number): Promise<void> {
  try {
    const kv = getKV(event)
    if (!kv) return
    await kv.put(key, JSON.stringify(data), { expirationTtl: ttlSeconds })
  } catch {
    // Silently fail — KV is a performance optimization, not critical
  }
}

/**
 * Delete a key from KV.
 */
export async function kvDelete(event: H3Event, key: string): Promise<void> {
  try {
    const kv = getKV(event)
    if (!kv) return
    await kv.delete(key)
  } catch {
    // Silently fail
  }
}

/**
 * Stale-while-revalidate cache entry. `exp` is the *logical* expiry
 * (ms since epoch). The actual KV TTL is intentionally longer so an
 * expired entry is still available to serve as stale while a
 * background refresh runs.
 */
interface CacheEntry<T> {
  v: T
  exp: number
}

function isCacheEntry(value: any): value is CacheEntry<any> {
  return !!value
    && typeof value === 'object'
    && 'v' in value
    && 'exp' in value
    && typeof value.exp === 'number'
}

// Per-isolate de-dup of in-flight background refreshes so a burst of
// requests doesn't fan out N identical Xero calls.
const refreshLocks = new Map<string, Promise<unknown>>()

function scheduleRefresh<T>(
  event: H3Event,
  key: string,
  ttlSeconds: number,
  fetcher: () => Promise<T>,
): void {
  if (refreshLocks.has(key)) return

  const task = (async () => {
    try {
      const data = await fetcher()
      const entry: CacheEntry<T> = { v: data, exp: Date.now() + ttlSeconds * 1000 }
      await kvPut(event, key, entry, Math.max(60, ttlSeconds * 4))
    } catch (err) {
      console.warn(`[cachedFetch] background refresh failed for "${key}":`, (err as any)?.message ?? err)
    } finally {
      refreshLocks.delete(key)
    }
  })()

  refreshLocks.set(key, task)

  // Tell Cloudflare Workers to keep the isolate alive until the refresh
  // resolves (CF Pages Functions expose `waitUntil` on the context).
  const ctx = (event.context as any).cloudflare?.ctx
  if (ctx && typeof ctx.waitUntil === 'function') {
    ctx.waitUntil(task)
  }
}

/**
 * Stale-while-revalidate cache helper.
 *
 *   1. Cache hit (fresh)  → return value immediately, no Xero call.
 *   2. Cache hit (stale)  → return stale value immediately, kick off
 *                            a background refresh via waitUntil.
 *   3. Cache miss         → synchronously fetch + store + return.
 *
 * Callers never wait on Xero unless the entry has never been primed or
 * the isolate was recycled with a cold KV. Everything else serves <5ms.
 *
 * Backward compatible with values written by the old plain-value format
 * — those are treated as fresh once, then rewritten with metadata.
 */
export async function cachedFetch<T>(
  event: H3Event,
  key: string,
  ttlSeconds: number,
  fetcher: () => Promise<T>,
): Promise<T> {
  const cached = await kvGet<CacheEntry<T> | T>(event, key)
  const now = Date.now()
  const ttlMs = ttlSeconds * 1000

  if (isCacheEntry(cached)) {
    const entry = cached as CacheEntry<T>
    if (now < entry.exp) {
      // Fresh.
      return entry.v
    }
    // Stale — serve it and refresh in the background.
    scheduleRefresh(event, key, ttlSeconds, fetcher)
    return entry.v
  }

  if (cached !== null && cached !== undefined) {
    // Legacy plain-value entry — treat as fresh once, then rewrite in
    // the new format via background refresh.
    scheduleRefresh(event, key, ttlSeconds, fetcher)
    return cached as T
  }

  // Cold cache — synchronously fetch.
  const data = await fetcher()
  const entry: CacheEntry<T> = { v: data, exp: now + ttlMs }
  // KV TTL > logical TTL so expired-but-usable data sticks around.
  kvPut(event, key, entry, Math.max(60, ttlSeconds * 4))
  return data
}
