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
 * Cache-aside helper: check KV → miss → run fetcher → store in KV → return.
 * If KV is unavailable, always runs the fetcher directly.
 */
export async function cachedFetch<T>(
  event: H3Event,
  key: string,
  ttlSeconds: number,
  fetcher: () => Promise<T>
): Promise<T> {
  const cached = await kvGet<T>(event, key)
  if (cached !== null) return cached

  const data = await fetcher()
  // Fire-and-forget — don't block the response on KV write
  kvPut(event, key, data, ttlSeconds)
  return data
}
