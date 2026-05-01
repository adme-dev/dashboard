/**
 * Daily cron: measure outcomes for closed recommendations.
 *
 * For each rec marked done with acted_at >= 7/14/30 days ago that doesn't
 * yet have an outcome row at that checkpoint, this re-computes the target
 * metric via measureRecommendation() and writes to recommendation_outcomes.
 *
 * The detail view sidebar already renders outcomes — this is the loop
 * that turns the recommendation system from "alert list" into "tracked
 * intervention with measured impact".
 *
 * Mirrors the anomaly + advisor cron auth pattern: x-cron-secret with
 * dev bypass, local-hour gate (default 7am tenant-local), ?force=true
 * to skip the gate.
 */

import { defineEventHandler, getHeader, getQuery, createError } from 'h3'
import { queryOne, queryRows, execute } from '~~/server/utils/db'
import { getActiveOrgToken } from '~~/server/utils/tokenStore'
import { measureRecommendation } from '~~/server/utils/advisorGenerators'

const TARGET_LOCAL_HOUR = 7
const CHECKPOINT_DAYS = [7, 14, 30] as const

export default defineEventHandler(async (event) => {
  const cronSecret = getHeader(event, 'x-cron-secret')
  const expectedSecret = process.env.CRON_SECRET

  if (!import.meta.dev && cronSecret !== expectedSecret) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const query = getQuery(event)
  const force = query.force === 'true' || query.force === '1'

  const conn = await queryOne<{ tenant_id: string; timezone: string }>(
    `SELECT tenant_id, timezone FROM xero_org_connection ORDER BY connected_at DESC LIMIT 1`,
  )
  if (!conn) {
    return { ok: true, skipped: 'no Xero connection' }
  }

  const tz = conn.timezone || 'Australia/Sydney'
  let localHour: number
  try {
    localHour = Number(
      new Date().toLocaleString('en-US', { timeZone: tz, hour: 'numeric', hour12: false }),
    )
  } catch {
    localHour = new Date().getUTCHours()
  }

  if (!force && localHour !== TARGET_LOCAL_HOUR) {
    return { ok: true, tenant_id: conn.tenant_id, timezone: tz, skipped: `local hour=${localHour}` }
  }

  // Try to get a Xero token. Some measurements need it (collections,
  // concentration, agi-per-fte) — others (margin, growth, retainer-cap,
  // vendor-growth) are DB-only. If token retrieval fails, only skip the
  // Xero-backed measurements; don't fail the whole cron.
  let accessToken: string | null = null
  try {
    const token = await getActiveOrgToken(event)
    accessToken = token.access_token!
  } catch (err: any) {
    console.warn('[advisor-outcomes-cron] no Xero token; Xero-backed measurements will be skipped:', err?.message ?? err)
  }

  const start = Date.now()
  const measured: Array<{ recId: string; days: number; metric: number; delta: number }> = []
  const skipped: Array<{ recId: string; days: number; reason: string }> = []
  const failed: Array<{ recId: string; days: number; error: string }> = []

  for (const days of CHECKPOINT_DAYS) {
    // Find recs acted on roughly `days` ago (with a 1-day grace window so
    // the cron doesn't have to fire at exactly the right minute) that
    // don't yet have an outcome at this checkpoint.
    const due = await queryRows<{
      id: string
      category: string | null
      baseline_metric_value: number | null
      target_direction: 'up' | 'down' | null
      xero_metric_snapshot: Record<string, any> | null
      acted_at: string
    }>(
      `SELECT
         r.id,
         r.category,
         r.baseline_metric_value::float AS baseline_metric_value,
         r.target_direction,
         r.xero_metric_snapshot,
         r.acted_at
       FROM recommendations r
       WHERE r.tenant_id = $1
         AND r.status = 'done'
         AND r.acted_at IS NOT NULL
         AND r.acted_at <= NOW() - ($2::int || ' days')::interval
         AND r.acted_at >  NOW() - (($2::int + 2) || ' days')::interval
         AND NOT EXISTS (
           SELECT 1 FROM recommendation_outcomes o
           WHERE o.recommendation_id = r.id AND o.days_after_action = $2::int
         )`,
      [conn.tenant_id, days]
    )

    for (const rec of due) {
      try {
        const result = await measureRecommendation(rec, {
          tenantId: conn.tenant_id,
          accessToken,
        })

        if (!result) {
          skipped.push({ recId: rec.id, days, reason: 'measurement-not-supported-or-missing-token' })
          continue
        }

        await execute(
          `INSERT INTO recommendation_outcomes
             (recommendation_id, days_after_action, metric_value, metric_delta, notes)
           VALUES ($1, $2, $3, $4, $5)`,
          [rec.id, days, result.metric_value, result.metric_delta, result.notes ?? null]
        )
        measured.push({ recId: rec.id, days, metric: result.metric_value, delta: result.metric_delta })
      } catch (err: any) {
        console.error(`[advisor-outcomes-cron] measure failed for ${rec.id} @ ${days}d:`, err?.message ?? err)
        failed.push({ recId: rec.id, days, error: err?.message ?? String(err) })
      }
    }
  }

  const durationMs = Date.now() - start

  console.log('[advisor-outcomes-cron]', {
    tenant_id: conn.tenant_id,
    timezone: tz,
    localHour,
    forced: force,
    durationMs,
    measured: measured.length,
    skipped: skipped.length,
    failed: failed.length,
  })

  return {
    ok: true,
    tenant_id: conn.tenant_id,
    timezone: tz,
    localHour,
    forced: force,
    durationMs,
    measured,
    skipped,
    failed,
  }
})
