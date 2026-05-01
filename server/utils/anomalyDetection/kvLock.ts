import { kvGet, kvPut, kvDelete } from '~~/server/utils/kv'

/**
 * In-flight scan lock backed by Cloudflare KV.
 *
 * 5-minute TTL — well above realistic detection time (~15-60s) but short
 * enough that a crashed run unlocks itself naturally. Concurrent callers
 * for the same tenant see the lock and return early; the page polls every
 * 5s for up to 60s to surface completion.
 *
 * Note: get-then-put is not atomic on KV. Race window is ~50–200ms in
 * practice, acceptable because (a) concurrent callers for the same tenant
 * are rare (one cron + one user click), and (b) the unique partial index
 * on `anomalies(tenant_id, fingerprint) WHERE active` is the correctness
 * backstop. If the race ever surfaces, switch to a Durable Object — out
 * of scope here.
 */
const LOCK_TTL_SECONDS = 300
const LOCK_PREFIX = 'anomaly-scan-lock:'

export async function acquireScanLock(tenantId: string): Promise<boolean> {
  const key = LOCK_PREFIX + tenantId
  const existing = await kvGet<string>(null as any, key)
  if (existing) return false
  await kvPut(null as any, key, new Date().toISOString(), LOCK_TTL_SECONDS)
  return true
}

export async function releaseScanLock(tenantId: string): Promise<void> {
  await kvDelete(null as any, LOCK_PREFIX + tenantId)
}
