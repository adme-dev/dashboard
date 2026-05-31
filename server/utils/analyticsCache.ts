// server/utils/analyticsCache.ts
/**
 * Thin caching layer for the analytics read endpoints, built on the proven SWR
 * `cachedFetch` (kv.ts). Adds:
 *  - a stable cache key from the query params,
 *  - a "provisional" flag for windows that touch the last ~48h (spend + GA4 are
 *    still restating), surfaced so the UI can badge the data,
 *  - a shorter TTL for provisional windows so recent data self-heals quickly.
 *
 * Pre-aggregated rollup tables / materialized views are intentionally NOT built
 * here: current data volume (~hundreds of media_spend rows) makes the live
 * queries sub-100ms, so rollups would be premature. Revisit when a single
 * client's daily fact crosses ~10⁵ rows.
 */
import type { H3Event } from 'h3'
import { cachedFetch } from './kv'

/** True when the window end is within `trailingDays` of today → data may still restate. */
export function isProvisionalWindow(endDate: string, today: string, trailingDays = 2): boolean {
  const end = new Date(`${endDate}T00:00:00Z`).getTime()
  const cutoff = new Date(`${today}T00:00:00Z`).getTime() - trailingDays * 86_400_000
  return end >= cutoff
}

/** Stable cache key for an analytics payload. */
export function analyticsCacheKey(
  name: string,
  parts: { clientId?: string, startDate: string, endDate: string, platforms?: string | null }
): string {
  return [
    'analytics',
    name,
    parts.clientId || 'all',
    parts.startDate,
    parts.endDate,
    parts.platforms || 'all'
  ].join(':')
}

export interface CacheEnvelope {
  generatedAt: string | null
  provisional: boolean
}

/**
 * Run `fetcher` through SWR cache, returning its payload plus a `_cache`
 * envelope. `generatedAt` reflects when the cached copy was built (accurate
 * across SWR refreshes); `provisional` is computed at serve time.
 */
export async function cachedAnalytics<T extends object>(
  event: H3Event,
  key: string,
  opts: { endDate: string, today?: string, freshTtl?: number, provisionalTtl?: number },
  fetcher: () => Promise<T>
): Promise<T & { _cache: CacheEnvelope }> {
  const today = opts.today ?? new Date().toISOString().slice(0, 10)
  const provisional = isProvisionalWindow(opts.endDate, today)
  const ttl = provisional ? (opts.provisionalTtl ?? 120) : (opts.freshTtl ?? 600)

  const stamped = async () => ({ ...(await fetcher()), _generatedAt: new Date().toISOString() })
  const data = await cachedFetch(event, key, ttl, stamped) as T & { _generatedAt?: string }

  const { _generatedAt, ...rest } = data as T & { _generatedAt?: string }
  return { ...(rest as T), _cache: { generatedAt: _generatedAt ?? null, provisional } }
}
