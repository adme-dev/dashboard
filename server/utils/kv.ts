import type { H3Event } from 'h3'

/** Minimal KV interface matching Cloudflare KVNamespace */
interface KV {
  get(key: string, type: 'text'): Promise<string | null>
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>
  delete(key: string): Promise<void>
  list(options?: { prefix?: string; cursor?: string }): Promise<{
    keys: Array<{ name: string }>
    list_complete: boolean
    cursor?: string
  }>
}

interface MemoryCacheValue {
  raw: string
  exp: number
}

// In-memory fallback for environments without KV (eg local dev). This keeps
// SWR behavior functional during idle periods and short deploy cold starts.
const memoryCache = new Map<string, MemoryCacheValue>()
const MEMORY_CACHE_DEFAULT_TTL_SECONDS = 3600

function toNumericTTLSeconds(ttlSeconds: number) {
  return Math.max(60, Math.floor(ttlSeconds))
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
    if (kv) {
      const raw = await kv.get(key, 'text')
      if (!raw) {
        const cached = memoryGet<T>(key)
        return cached
      }
      const parsed = JSON.parse(raw) as T
      // Keep memory warm from KV for ultra-fast same-instance reads.
      const ttlSeconds = MEMORY_CACHE_DEFAULT_TTL_SECONDS
      memorySet(key, parsed, ttlSeconds)
      return parsed
    }
    return memoryGet<T>(key)
  } catch {
    return memoryGet<T>(key)
  }
}

/**
 * Put a JSON value into KV with TTL (in seconds).
 */
export async function kvPut<T>(event: H3Event, key: string, data: T, ttlSeconds: number): Promise<void> {
  try {
    const kv = getKV(event)
    const ttl = toNumericTTLSeconds(ttlSeconds)
    const serialized = JSON.stringify(data)
    if (kv) {
      await kv.put(key, serialized, { expirationTtl: ttl })
    }
    // Always write to process-local cache so dev/staging without KV stays usable.
    memorySet(key, data, ttl)
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
    if (kv) {
      await kv.delete(key)
    }
    memoryDelete(key)
  } catch {
    // Silently fail
  }
}

/**
 * Delete every KV key under a prefix. Used by the Xero webhook to drop
 * cached dashboard figures the moment data changes in Xero, instead of
 * waiting out the SWR TTL. Bounded pagination (KV list returns ≤1000
 * keys per page) with a safety cap — our per-tenant key space is tiny.
 */
export async function kvDeleteByPrefix(event: H3Event, prefix: string): Promise<number> {
  try {
    const kv = getKV(event)
    if (!kv) {
      const deleted = memoryDeleteByPrefix(prefix)
      return deleted
    }
    let deleted = 0
    let cursor: string | undefined
    for (let page = 0; page < 10; page++) {
      const res = await kv.list({ prefix, cursor })
      await Promise.all(res.keys.map((k) => kv.delete(k.name)))
      deleted += res.keys.length
      if (res.list_complete || !res.cursor) break
      cursor = res.cursor
    }
    deleted += memoryDeleteByPrefix(prefix)
    return deleted
  } catch {
    // Silently fail — cache invalidation is best-effort.
    return 0
  }
}

function memoryGet<T>(key: string): T | null {
  const item = memoryCache.get(key)
  if (!item) return null
  if (item.exp <= Date.now()) {
    memoryCache.delete(key)
    return null
  }
  try {
    return JSON.parse(item.raw) as T
  } catch {
    memoryCache.delete(key)
    return null
  }
}

function memorySet<T>(key: string, data: T, ttlSeconds: number): void {
  try {
    memoryCache.set(key, {
      raw: JSON.stringify(data),
      exp: Date.now() + toNumericTTLSeconds(ttlSeconds) * 1000,
    })
  } catch {
    // Ignore failures for the same reason as KV failures.
  }
}

function memoryDelete(key: string): void {
  memoryCache.delete(key)
}

function memoryDeleteByPrefix(prefix: string): number {
  let deleted = 0
  for (const key of memoryCache.keys()) {
    if (key.startsWith(prefix)) {
      memoryCache.delete(key)
      deleted++
    }
  }
  return deleted
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
  /** ms since epoch when `v` was fetched from the source. Absent on entries written before P-01. */
  at?: number
}

/**
 * Provenance for a cached value (promise P-01 — every figure carries its as-of).
 * `cachedAt` is when the source was last actually read; null only for legacy entries written
 * before the field existed. `servedStale` is true whenever the value is older than its logical TTL
 * or was served because the live fetch failed.
 */
export interface CacheAsOf {
  cachedAt: string | null
  servedStale: boolean
  source: 'live' | 'cache_fresh' | 'cache_stale_revalidating' | 'cache_stale_if_error' | 'cache_legacy'
  ttlSeconds: number
}

function asOfFor<T>(entry: CachedValue<T>, source: CacheAsOf['source'], ttlSeconds: number): CacheAsOf {
  const at = isCacheEntry(entry) && typeof entry.at === 'number'
    ? new Date(entry.at).toISOString()
    : isCacheEntry(entry) ? new Date(entry.exp - ttlSeconds * 1000).toISOString() : null
  return { cachedAt: at, servedStale: source !== 'live' && source !== 'cache_fresh', source, ttlSeconds }
}

type CachedValue<T> = CacheEntry<T> | T | null | undefined

function extractCachedValue<T>(value: CachedValue<T>): T | null {
  if (!value) return null
  if (isCacheEntry(value)) return value.v
  return value as T
}

function isTransientCacheError(err: any): boolean {
  const status = err?.response?.statusCode
    ?? err?.response?.status
    ?? err?.statusCode
    ?? err?.status

  if (status === 429) return true
  if (Number.isFinite(Number(status)) && Number(status) >= 500) return true

  // No status but request/IO error (network, timeout, abort, DNS, parser, etc.)
  // should still degrade to stale data where available.
  if (!status) return true

  return false
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

  // Capture the env binding and waitUntil synchronously so the background
  // task never touches `event.context` after the originating request has
  // ended — that's what "Cannot perform I/O on behalf of a different
  // request" complains about on Cloudflare Pages.
  const cf = (event.context as any).cloudflare
  const kv = cf?.env?.CACHE as KV | undefined
  const ctx = cf?.ctx

  const task = (async () => {
    try {
      const data = await fetcher()
      const entry: CacheEntry<T> = { v: data, exp: Date.now() + ttlSeconds * 1000, at: Date.now() }
      if (kv) {
        await kv.put(key, JSON.stringify(entry), { expirationTtl: Math.max(60, ttlSeconds * 4) })
      }
      memorySet(key, entry, Math.max(60, ttlSeconds * 4))
    } catch (err) {
      console.warn(`[cachedFetch] background refresh failed for "${key}":`, (err as any)?.message ?? err)
    } finally {
      refreshLocks.delete(key)
    }
  })()

  refreshLocks.set(key, task)

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
  return (await cachedFetchWithMeta(event, key, ttlSeconds, fetcher)).value
}

/** Same as cachedFetch but also returns the value's provenance (see CacheAsOf). */
export async function cachedFetchWithMeta<T>(
  event: H3Event,
  key: string,
  ttlSeconds: number,
  fetcher: () => Promise<T>,
): Promise<{ value: T, asOf: CacheAsOf }> {
  // Honour an explicit cache-bust flag (?bust=1 or ?refresh=1) so a
  // user-clicked "Refresh" button always rebuilds from live Xero
  // instead of serving the cached value.
  const q = getQuery(event) as Record<string, string | undefined>
  const busted = q.bust === '1' || q.refresh === '1'

  if (busted) {
    try {
      const data = await fetcher()
      const entry: CacheEntry<T> = { v: data, exp: Date.now() + ttlSeconds * 1000, at: Date.now() }
      kvPut(event, key, entry, Math.max(60, ttlSeconds * 4))
      return { value: data, asOf: asOfFor(entry, 'live', ttlSeconds) }
    } catch (err) {
      // Stale-if-error: a forced refresh that hits Xero's rate limit (429)
      // or a transient upstream failure should degrade to the last known
      // value, not crash the page. Several dashboards bust a dozen Xero
      // endpoints at once — post-deploy cold storms made every card error
      // simultaneously.
      const cached = await kvGet<CacheEntry<T> | T>(event, key)
      const fallback = extractCachedValue(cached)
      if (fallback !== null && isTransientCacheError(err)) {
        console.warn(`[cachedFetch] bust fetch failed for "${key}" — serving stale:`, (err as any)?.message ?? err)
        return { value: fallback, asOf: asOfFor(cached, 'cache_stale_if_error', ttlSeconds) }
      }
      throw err
    }
  }

  const cached = await kvGet<CacheEntry<T> | T>(event, key)
  const now = Date.now()
  const ttlMs = ttlSeconds * 1000

  if (isCacheEntry(cached)) {
    const entry = cached as CacheEntry<T>
    if (now < entry.exp) {
      // Fresh.
      return { value: entry.v, asOf: asOfFor(entry, 'cache_fresh', ttlSeconds) }
    }
    // Stale — serve it and refresh in the background.
    scheduleRefresh(event, key, ttlSeconds, fetcher)
    return { value: entry.v, asOf: asOfFor(entry, 'cache_stale_revalidating', ttlSeconds) }
  }

  if (cached !== null && cached !== undefined) {
    // Legacy plain-value entry — treat as fresh once, then rewrite in
    // the new format via background refresh.
    scheduleRefresh(event, key, ttlSeconds, fetcher)
    return { value: cached as T, asOf: asOfFor(cached, 'cache_legacy', ttlSeconds) }
  }

  // Cold cache — synchronously fetch.
  try {
    const data = await fetcher()
    const entry: CacheEntry<T> = { v: data, exp: now + ttlMs, at: now }
    // KV TTL > logical TTL so expired-but-usable data sticks around.
    kvPut(event, key, entry, Math.max(60, ttlSeconds * 4))
    return { value: data, asOf: asOfFor(entry, 'live', ttlSeconds) }
  } catch (err) {
    // No usable in-memory value, but a different request may have populated a
    // cache entry very recently. Re-check KV to avoid a hard error cascade.
    const latestCached = await kvGet<CacheEntry<T> | T>(event, key)
    const fallback = extractCachedValue(latestCached)
    if (fallback !== null && isTransientCacheError(err)) {
      console.warn(`[cachedFetch] fetch failed for "${key}" — serving stale value:`, (err as any)?.message ?? err)
      return { value: fallback, asOf: asOfFor(latestCached, 'cache_stale_if_error', ttlSeconds) }
    }
    throw err
  }
}
