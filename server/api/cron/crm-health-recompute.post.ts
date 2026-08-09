// server/api/cron/crm-health-recompute.post.ts
// P4.2 — sweep that recomputes the 'health' score for every customer-lifecycle
// contact, so churn risk stays current even between in-band recomputes. Fired by
// the workers/crm-cron companion Worker. Idempotent (recomputeHealth upserts).
//
// Auth: x-cron-secret matched against CRON_SECRET (skipped in dev).
import { defineEventHandler, getHeader, createError } from 'h3'
import { recomputeHealth, listCustomerTargets } from '~~/server/utils/crm/healthSignals'

const BATCH = 2000

export default defineEventHandler(async (event) => {
  const secret = getHeader(event, 'x-cron-secret')
  if (!import.meta.dev && secret !== process.env.CRON_SECRET) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const targets = await listCustomerTargets(BATCH)
  let recomputed = 0
  for (const t of targets) {
    try {
      await recomputeHealth({ clientId: t.client_id, targetType: t.target_type, targetId: t.target_id, reason: 'health_sweep' })
      recomputed++
    } catch (e) {
      console.error('[crm-cron] health recompute failed', safeError(e))
    }
  }

  const result = { ok: true, customers: targets.length, recomputed, capped: targets.length === BATCH }
  console.log('[crm-cron] health-recompute', result)
  return result
})

function safeError(error: unknown) {
  return error instanceof Error ? error.message : 'unknown_error'
}
