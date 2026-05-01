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

import { defineEventHandler, getHeader, createError } from 'h3'
import { queryOne } from '~~/server/utils/db'
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

  // Resolve the connected Xero org
  const conn = await queryOne<{ tenant_id: string; timezone: string }>(
    `SELECT tenant_id, timezone FROM xero_org_connection ORDER BY connected_at DESC LIMIT 1`,
  )
  if (!conn) {
    return { ok: true, skipped: 'no Xero connection' }
  }

  // Local-hour gate: only run once per day at 7am local time.
  // Using Intl.DateTimeFormat is the most reliable way to compute "what hour is it
  // RIGHT NOW in this timezone" in a Cloudflare Workers runtime (no luxon/date-fns-tz
  // dependency required).
  const tz = conn.timezone || 'Australia/Sydney'
  let localHour: number
  try {
    localHour = Number(
      new Date().toLocaleString('en-US', { timeZone: tz, hour: 'numeric', hour12: false }),
    )
  } catch (err) {
    console.warn('[anomaly-cron] invalid timezone, falling back to UTC:', tz, err)
    localHour = new Date().getUTCHours()
  }

  if (localHour !== 7) {
    return { ok: true, tenant_id: conn.tenant_id, timezone: tz, skipped: `local hour=${localHour}` }
  }

  // Run detection
  const start = Date.now()
  const result = await runDetectionForTenant(conn.tenant_id, { event })
  const durationMs = Date.now() - start

  console.log('[anomaly-cron]', {
    tenant_id: conn.tenant_id,
    timezone: tz,
    localHour,
    durationMs,
    result,
  })

  return {
    ok: true,
    tenant_id: conn.tenant_id,
    timezone: tz,
    durationMs,
    ...result,
  }
})
