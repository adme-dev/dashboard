// server/api/cron/crm-score-decay.post.ts
// P4.1 F3 — decay lead scores so the recency component erodes over time. The
// deterministic scoring.ts util already models the decay curve; this cron just
// re-triggers recomputeScore() for stale 'lead' scores. recomputeScore is
// idempotent (upserts the score, appends a 'decay' history row).
//
// Auth: x-cron-secret matched against CRON_SECRET (skipped in dev).
import { defineEventHandler, getHeader, createError } from 'h3'
import { queryRows } from '~~/server/utils/db'
import { recomputeScore, type ScoreTargetType } from '~~/server/utils/crm/scoreSignals'

const BATCH = 1000

export default defineEventHandler(async (event) => {
  const secret = getHeader(event, 'x-cron-secret')
  if (!import.meta.dev && secret !== process.env.CRON_SECRET) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  // Stale = not recomputed in the last 20h, so an hourly cron refreshes each
  // score about once a day without redundant churn.
  const stale = await queryRows<{ client_id: string, target_type: ScoreTargetType, target_id: string }>(
    `SELECT client_id, target_type, target_id
       FROM crm_scores
      WHERE score_type = 'lead'
        AND computed_at < NOW() - INTERVAL '20 hours'
      ORDER BY computed_at ASC
      LIMIT ${BATCH}`,
  )

  let recomputed = 0
  for (const s of stale) {
    try {
      const r = await recomputeScore({ clientId: s.client_id, targetType: s.target_type, targetId: s.target_id, reason: 'decay' })
      if (r) recomputed++
    } catch (e) {
      console.error('[crm-cron] decay recompute failed', safeError(e))
    }
  }

  const result = { ok: true, stale: stale.length, recomputed, capped: stale.length === BATCH }
  console.log('[crm-cron] score-decay', result)
  return result
})

function safeError(error: unknown) {
  return error instanceof Error ? error.message : 'unknown_error'
}
