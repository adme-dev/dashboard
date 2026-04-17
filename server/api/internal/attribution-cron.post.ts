/**
 * POST /api/internal/attribution-cron
 *
 * Daily impact attribution. For every `status = 'done'` recommendation
 * with a tagged target_metric + baseline + acted_at:
 *   - At 30 / 60 / 90 days after acted_at, re-measure the metric
 *   - Compute delta vs baseline
 *   - Insert a recommendation_outcomes row (idempotent on checkpoint)
 *
 * Auth: X-Attribution-Secret header must match ATTRIBUTION_SECRET env.
 * Internally, the cron uses X-Internal-Cron-Secret (CRON_INTERNAL_SECRET)
 * to bypass the user-session check on /api/xero/* when fetching live
 * metric values.
 *
 * Intended to be hit once a day by a CF Cron Trigger:
 *
 *   curl -X POST https://<host>/api/internal/attribution-cron \
 *        -H "X-Attribution-Secret: $ATTRIBUTION_SECRET"
 */

import { createError } from 'h3'
import { queryRows, execute } from '~~/server/utils/db'
import { fetchMetricValue } from '~~/server/utils/advisorMetrics'

const CHECKPOINTS = [30, 60, 90] as const

type PendingRec = {
  id: string
  tenant_id: string
  target_metric: string
  baseline_metric_value: string | number
  target_direction: 'up' | 'down' | null
  acted_at: string
  done_days_ago: number
  measured_days: number[]
}

export default eventHandler(async (event) => {
  const provided = getHeader(event, 'x-attribution-secret') || ''
  const expected = process.env.ATTRIBUTION_SECRET || useRuntimeConfig().attributionSecret
  if (!expected) {
    throw createError({ statusCode: 503, statusMessage: 'Attribution cron not configured' })
  }
  if (provided !== expected) {
    throw createError({ statusCode: 401, statusMessage: 'Invalid attribution secret' })
  }

  const cronSecret = process.env.CRON_INTERNAL_SECRET
  if (!cronSecret) {
    throw createError({ statusCode: 503, statusMessage: 'CRON_INTERNAL_SECRET not configured' })
  }

  // Pull every rec that is potentially due for a measurement — done,
  // tagged, acted at least 30 days ago. Aggregate the days-ago list of
  // existing outcomes so we can tell which checkpoints are still open.
  const rows = await queryRows<PendingRec>(
    `SELECT
       r.id,
       r.tenant_id,
       r.target_metric,
       r.baseline_metric_value,
       r.target_direction,
       r.acted_at,
       EXTRACT(DAY FROM NOW() - r.acted_at)::int AS done_days_ago,
       COALESCE(
         ARRAY_AGG(o.days_after_action ORDER BY o.days_after_action)
           FILTER (WHERE o.days_after_action IS NOT NULL),
         ARRAY[]::int[]
       ) AS measured_days
     FROM recommendations r
     LEFT JOIN recommendation_outcomes o ON o.recommendation_id = r.id
     WHERE r.status = 'done'
       AND r.acted_at IS NOT NULL
       AND r.target_metric IS NOT NULL
       AND r.baseline_metric_value IS NOT NULL
       AND r.acted_at <= NOW() - INTERVAL '30 days'
     GROUP BY r.id`
  )

  const results: Array<{ recommendation_id: string; checkpoint: number; metric_value: number | null; metric_delta: number | null; status: string }> = []

  for (const row of rows) {
    const doneDays = Number(row.done_days_ago) || 0
    const measured = new Set((row.measured_days ?? []).map((d) => Number(d)))
    const baseline = Number(row.baseline_metric_value)
    const todayISO = new Date().toISOString().slice(0, 10)

    // Process in order, smallest checkpoint first, so a single cron run
    // backfills every missing checkpoint for a long-standing rec.
    for (const checkpoint of CHECKPOINTS) {
      if (doneDays < checkpoint) continue
      if (measured.has(checkpoint)) continue

      const metricValue = await fetchMetricValue(event, row.target_metric, todayISO, {
        'x-internal-cron-secret': cronSecret,
      })
      if (metricValue == null) {
        results.push({
          recommendation_id: row.id,
          checkpoint,
          metric_value: null,
          metric_delta: null,
          status: 'metric-unavailable',
        })
        // Don't write a row we can't measure — the next cron run will retry.
        continue
      }

      const delta = metricValue - baseline
      try {
        await execute(
          `INSERT INTO recommendation_outcomes
              (recommendation_id, days_after_action, metric_value, metric_delta, notes)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            row.id,
            checkpoint,
            metricValue,
            delta,
            `Auto-measured at ${checkpoint}d after acted_at`,
          ]
        )
        results.push({
          recommendation_id: row.id,
          checkpoint,
          metric_value: metricValue,
          metric_delta: delta,
          status: 'measured',
        })
      } catch (err: any) {
        results.push({
          recommendation_id: row.id,
          checkpoint,
          metric_value: metricValue,
          metric_delta: delta,
          status: `insert-failed: ${err?.message ?? 'unknown'}`,
        })
      }
    }
  }

  return {
    ok: true,
    timestamp: new Date().toISOString(),
    scanned: rows.length,
    measurements: results.length,
    results,
  }
})
