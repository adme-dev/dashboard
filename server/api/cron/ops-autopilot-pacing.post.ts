// server/api/cron/ops-autopilot-pacing.post.ts
// Daily budget & pacing watchdog. Reads media_spend, raises escalations into the inbox.
// Monitoring-only: never writes to an ad platform. Mirrors anomaly-detection's auth + 7am-local gate.
import { createError, getHeader, getQuery } from 'h3'
import { queryOne } from '~~/server/utils/db'
import { runPacingWatchdog } from '~~/server/utils/automation/pacingWatchdog'

export default defineEventHandler(async (event) => {
  const cronSecret = getHeader(event, 'x-cron-secret')
  if (!import.meta.dev && cronSecret !== process.env.CRON_SECRET) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const query = getQuery(event)
  const force = query.force === 'true' || query.force === '1'

  // 7am-local gate (default Australia/Sydney; reuse the connected org's tz if present).
  const conn = await queryOne<{ timezone: string }>(
    `SELECT timezone FROM xero_org_connection ORDER BY connected_at DESC LIMIT 1`,
  )
  const tz = conn?.timezone || 'Australia/Sydney'
  let localHour: number
  try {
    localHour = Number(new Date().toLocaleString('en-US', { timeZone: tz, hour: 'numeric', hour12: false }))
  } catch {
    localHour = new Date().getUTCHours()
  }
  if (!force && localHour !== 7) {
    return { ok: true, skipped: `local hour=${localHour}`, timezone: tz }
  }

  const start = Date.now()
  const result = await runPacingWatchdog({ now: new Date() })
  return { ok: true, durationMs: Date.now() - start, ...result }
})
