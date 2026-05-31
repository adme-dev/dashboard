/**
 * Write-key tenancy for the cross-origin tracking endpoint.
 *
 * We do NOT host the dealer sites, so we cannot resolve the tenant by request
 * host (the reference's model). Instead the snippet embeds a public write key;
 * we look up tracking_sites by it, with a 5-minute in-memory cache.
 *
 * Origin validation is SOFT in Slice 1: an empty allowlist means allow-all, and
 * the endpoint logs (does not block) a mismatch. Promote to hard 403 once
 * allowlists are proven (see spec Open Questions).
 *
 * NEVER throws — returns null on any DB error so the public endpoint stays a beacon.
 */
import { queryOne } from '~~/server/utils/db'

export interface TrackingSite {
  id: string
  clientId: string
  name: string
  writeKey: string
  allowedOrigins: string[]
  spa: boolean
  consentMode: string
  leadSelectors: string[]
  retentionDays: number
  isActive: boolean
}

const CACHE_TTL_MS = 5 * 60 * 1000
const cache = new Map<string, { site: TrackingSite | null, fetchedAt: number }>()

/** Exported for unit testing the freshness window. */
export function _cacheIsFresh(fetchedAt: number, now: number, ttlMs: number): boolean {
  return now - fetchedAt < ttlMs
}

export function isOriginAllowed(site: Pick<TrackingSite, 'allowedOrigins'>, origin: string | null): boolean {
  if (!site.allowedOrigins || site.allowedOrigins.length === 0) return true // soft mode
  if (!origin) return false
  return site.allowedOrigins.includes(origin)
}

function mapRow(row: any): TrackingSite {
  return {
    id: row.id,
    clientId: row.client_id,
    name: row.name,
    writeKey: row.write_key,
    allowedOrigins: row.allowed_origins ?? [],
    spa: row.spa,
    consentMode: row.consent_mode,
    leadSelectors: row.lead_selectors ?? [],
    retentionDays: row.retention_days,
    isActive: row.is_active
  }
}

/**
 * Resolve a write key to an active tracking site. Returns null for unknown /
 * inactive keys or any error. `nowMs` is injectable for tests; defaults to Date.now().
 */
export async function resolveSiteByWriteKey(
  writeKey: string | null | undefined,
  nowMs: number = Date.now()
): Promise<TrackingSite | null> {
  if (!writeKey) return null
  const cached = cache.get(writeKey)
  if (cached && _cacheIsFresh(cached.fetchedAt, nowMs, CACHE_TTL_MS)) {
    return cached.site
  }
  try {
    const row = await queryOne(
      `SELECT id, client_id, name, write_key, allowed_origins, spa, consent_mode,
              lead_selectors, retention_days, is_active
         FROM tracking_sites
        WHERE write_key = $1 AND is_active = TRUE`,
      [writeKey]
    )
    const site = row ? mapRow(row) : null
    cache.set(writeKey, { site, fetchedAt: nowMs })
    return site
  } catch (err) {
    console.warn('[tracking/site-config] resolveSiteByWriteKey failed:', err)
    return null
  }
}

/** Test/admin hook: drop a cache entry after rotating a key or toggling active. */
export function invalidateSiteCache(writeKey: string): void {
  cache.delete(writeKey)
}
