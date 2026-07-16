import { getHeader, readRawBody, setResponseStatus } from 'h3'
import { kvDeleteByPrefix } from '../../utils/kv'

/**
 * Xero webhook receiver — drops cached dashboard figures the moment data
 * changes in Xero so the AR / Get Out / KPI cards don't sit on a stale
 * 5-minute SWR entry after a payment is matched.
 *
 * Previously this invalidated the in-memory prefix `kpis:${tenantId}` —
 * a cache layer none of the Xero endpoints use — so inbound webhooks
 * never freshened anything. The real entries live in Cloudflare KV under
 * the prefixes cleared below.
 *
 * Signature: Xero signs the raw body with the webhook signing key
 * (HMAC-SHA256, base64) in `x-xero-signature`, and its intent-to-receive
 * validation requires 401 on bad signature / 200 on good. Verification
 * runs only when XERO_WEBHOOK_KEY is configured so the endpoint still
 * accepts internal/manual pokes on setups without a registered webhook.
 */

async function hmacSha256Base64(key: string, data: string): Promise<string> {
  const enc = new TextEncoder()
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(data))
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
}

export default eventHandler(async (event) => {
  const raw = (await readRawBody(event, 'utf8')) || ''

  const webhookKey = process.env.XERO_WEBHOOK_KEY
  if (webhookKey) {
    const signature = getHeader(event, 'x-xero-signature') || ''
    const expected = await hmacSha256Base64(webhookKey, raw)
    if (signature !== expected) {
      setResponseStatus(event, 401)
      return ''
    }
  }

  let payload: any = null
  try {
    payload = raw ? JSON.parse(raw) : null
  } catch {
    payload = null
  }

  // Real Xero payloads carry events[].tenantId; keep the legacy
  // header/body forms working for manual invalidation pokes.
  const tenantIds = new Set<string>()
  for (const ev of payload?.events ?? []) {
    if (ev?.tenantId) tenantIds.add(String(ev.tenantId))
  }
  const legacyTenant = getHeader(event, 'xero-tenant-id') || payload?.tenantId
  if (legacyTenant) tenantIds.add(String(legacyTenant))

  // Clear the three key FAMILIES rather than a hand-maintained list of
  // per-endpoint prefixes — a five-prefix list was already missing
  // xero:credit-notes, xero:expenses, xero:budgets and friends, and every
  // new cached endpoint would silently miss invalidation. Family-wide
  // clearing over-invalidates across tenants, which is only a perf cost
  // (next request rebuilds) and this is a single-tenant deployment.
  // NB: 'xero:' does not match the 'xero-org-token'/'xero-org-tenant'
  // keys (no colon after 'xero'), so auth is untouched.
  let cleared = 0
  if (tenantIds.size > 0) {
    const results = await Promise.all([
      kvDeleteByPrefix(event, 'xero:'),
      kvDeleteByPrefix(event, 'xero-report:'),
      kvDeleteByPrefix(event, 'xero-get-out:'),
    ])
    cleared = results.reduce((sum, n) => sum + n, 0)
  }

  return { ok: true, tenants: tenantIds.size, cleared }
})
