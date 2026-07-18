// server/api/cron/anomaly-detection.post.ts
//
// Hourly cron entrypoint for anomaly detection.
//
// Runs detection for the connected Xero org only when the org's local time
// is 7am. The actual trigger comes from Cloudflare Cron Triggers (configured
// in wrangler.toml) — that hits this endpoint hourly; the local-hour gate
// ensures we only run once per day per tenant in their local TZ.
//
// Auth: x-cron-secret header matched against CRON_SECRET env var.
// In development, the secret check is skipped to allow easy manual triggering.

import { defineEventHandler, getHeader, getQuery, createError } from 'h3'
import { queryOne } from '~~/server/utils/db'
import { resolveCronXeroAuth } from '~~/server/utils/xeroCronAuth'
import { runDetectionForTenant } from '~~/server/utils/anomalyDetection/runForTenant'

export default defineEventHandler(async (event) => {
  // Auth
  const cronSecret = getHeader(event, 'x-cron-secret')
  const expectedSecret = process.env.CRON_SECRET

  // import.meta.dev is the Nuxt/Nitro-canonical dev check; works on Cloudflare
  // Pages preview deploys (where NODE_ENV may not be 'production').
  if (!import.meta.dev && cronSecret !== expectedSecret) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized',
    })
  }

  // ?force=true bypasses the local-7am gate. Use for ad-hoc backfills,
  // smoke tests, or to manually trigger detection without waiting for the
  // next 7am tenant-local. The auth check above still gates access.
  const query = getQuery(event)
  const force = query.force === 'true' || query.force === '1'

  // Resolve the canonical non-legacy tenant while keeping the newest token row
  // on the live refresh-token chain. Selecting the newest connection directly
  // can return the legacy `__default__` credential row and mis-scope anomalies.
  const auth = await resolveCronXeroAuth('anomaly-detection')
  if (!auth) {
    return { ok: true, skipped: 'no Xero connection' }
  }
  const tenantId = auth.tenantId
  const conn = await queryOne<{ timezone: string }>(
    `SELECT timezone FROM xero_org_connection WHERE tenant_id = $1 LIMIT 1`,
    [tenantId]
  )

  // Local-hour gate: only run once per day at 7am local time, unless force=true.
  // Using Intl.DateTimeFormat is the most reliable way to compute "what hour is it
  // RIGHT NOW in this timezone" in a Cloudflare Workers runtime (no luxon/date-fns-tz
  // dependency required).
  const tz = conn?.timezone || 'Australia/Sydney'
  let localHour: number
  try {
    localHour = Number(
      new Date().toLocaleString('en-US', { timeZone: tz, hour: 'numeric', hour12: false }),
    )
  } catch (err) {
    console.warn('[anomaly-cron] invalid timezone, falling back to UTC:', tz, err)
    localHour = new Date().getUTCHours()
  }

  if (!force && localHour !== 7) {
    return { ok: true, tenant_id: tenantId, timezone: tz, skipped: `local hour=${localHour}` }
  }

  // Run detection
  const start = Date.now()
  const result = await runDetectionForTenant(tenantId, { event })
  const durationMs = Date.now() - start

  console.log('[anomaly-cron]', {
    tenant_id: tenantId,
    timezone: tz,
    localHour,
    forced: force,
    durationMs,
    result,
  })

  return {
    ok: true,
    tenant_id: tenantId,
    timezone: tz,
    forced: force,
    durationMs,
    ...result,
  }
})
