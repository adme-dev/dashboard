// server/utils/crm/healthSignals.ts
// Gathers customer-health inputs from the DB and persists a recomputed 'health'
// score (+ history row). Pure math lives in healthScoring.ts; this is the I/O
// layer (mirrors scoreSignals.ts for the 'lead' score). No migration — reuses
// crm_scores with score_type='health'.
import { queryOne, queryRows, execute } from '~~/server/utils/db'
import { scoreHealth, type HealthSignals, type HealthResult } from './healthScoring'

export type HealthTargetType = 'person' | 'company'

export async function gatherHealthSignals(
  clientId: string,
  targetType: HealthTargetType,
  targetId: string,
  now: Date,
): Promise<HealthSignals> {
  const commsCol = targetType === 'person' ? 'person_id' : 'company_id'

  const act = await queryOne<{ last_at: string | null }>(
    `SELECT MAX(COALESCE(scheduled_at, created_at))::text AS last_at
       FROM crm_activities
      WHERE client_id = $1 AND target_type = $2 AND target_id = $3 AND deleted_at IS NULL`,
    [clientId, targetType, targetId],
  )
  const comm = await queryOne<{ last_at: string | null, cnt30: string }>(
    `SELECT MAX(occurred_at)::text AS last_at,
            COUNT(*) FILTER (WHERE occurred_at >= NOW() - INTERVAL '30 days')::text AS cnt30
       FROM crm_communications
      WHERE client_id = $1 AND ${commsCol} = $2 AND deleted_at IS NULL`,
    [clientId, targetId],
  )
  const task = await queryOne<{ overdue: string }>(
    `SELECT COUNT(*)::text AS overdue FROM crm_tasks
      WHERE client_id = $1 AND target_type = $2 AND target_id = $3 AND deleted_at IS NULL
        AND status IN ('pending','in_progress') AND due_at IS NOT NULL AND due_at < NOW()`,
    [clientId, targetType, targetId],
  )
  const doc = await queryOne<{ next_expiry: string | null }>(
    `SELECT MIN(expires_at)::text AS next_expiry FROM crm_documents
      WHERE client_id = $1 AND target_type = $2 AND target_id = $3 AND deleted_at IS NULL
        AND expires_at IS NOT NULL`,
    [clientId, targetType, targetId],
  )

  // Most recent touch across activities and communications.
  const touches = [act?.last_at, comm?.last_at].filter(Boolean) as string[]
  const lastEngagementAt = touches.length
    ? touches.reduce((a, b) => (new Date(a) > new Date(b) ? a : b))
    : null
  const contractDaysToExpiry = doc?.next_expiry
    ? Math.floor((new Date(doc.next_expiry).getTime() - now.getTime()) / 86400000)
    : null

  return {
    lastEngagementAt,
    openOverdueTasks: Number(task?.overdue ?? 0),
    commsLast30: Number(comm?.cnt30 ?? 0),
    contractDaysToExpiry,
  }
}

// Recompute + persist the 'health' score for a target. Components map onto the
// shared crm_scores columns: engagement→engagement_score, support→intent_score,
// relationship→fit_score, contract→recency_score.
export async function recomputeHealth(opts: {
  clientId: string
  targetType: HealthTargetType
  targetId: string
  reason: string
  now?: Date
}): Promise<HealthResult> {
  const now = opts.now ?? new Date()
  const signals = await gatherHealthSignals(opts.clientId, opts.targetType, opts.targetId, now)
  const r = scoreHealth(signals, now)

  await execute(
    `INSERT INTO crm_scores
       (client_id, target_type, target_id, score_type, total_score, grade,
        engagement_score, intent_score, fit_score, recency_score, computed_at, updated_at)
     VALUES ($1,$2,$3,'health',$4,$5,$6,$7,$8,$9,NOW(),NOW())
     ON CONFLICT (client_id, target_type, target_id, score_type) DO UPDATE SET
       total_score = EXCLUDED.total_score, grade = EXCLUDED.grade,
       engagement_score = EXCLUDED.engagement_score, intent_score = EXCLUDED.intent_score,
       fit_score = EXCLUDED.fit_score, recency_score = EXCLUDED.recency_score,
       computed_at = NOW(), updated_at = NOW()`,
    [opts.clientId, opts.targetType, opts.targetId, r.total, r.grade, r.engagement, r.support, r.relationship, r.contract],
  )
  await execute(
    `INSERT INTO crm_score_history (client_id, target_type, target_id, score_type, total_score, grade, reason)
     VALUES ($1,$2,$3,'health',$4,$5,$6)`,
    [opts.clientId, opts.targetType, opts.targetId, r.total, r.grade, opts.reason],
  )
  return r
}

// In-band guard: recompute health only for 'customer'-lifecycle contacts.
// Swallows errors so a health-scoring failure never breaks the parent mutation.
export async function recomputeHealthIfCustomer(
  clientId: string,
  targetType: string,
  targetId: string | null | undefined,
  reason: string,
): Promise<void> {
  if ((targetType !== 'person' && targetType !== 'company') || !targetId) return
  try {
    const table = targetType === 'person' ? 'crm_people' : 'crm_companies'
    const row = await queryOne<{ lifecycle_stage: string | null }>(
      `SELECT lifecycle_stage FROM ${table} WHERE id = $1 AND client_id = $2 AND deleted_at IS NULL`,
      [targetId, clientId],
    )
    if (row?.lifecycle_stage !== 'customer') return
    await recomputeHealth({ clientId, targetType: targetType as HealthTargetType, targetId, reason })
  } catch (e) {
    console.error('[crm] health recompute failed', e)
  }
}

// All 'customer'-lifecycle contacts for the health sweep cron.
export async function listCustomerTargets(limit: number): Promise<{ client_id: string, target_type: HealthTargetType, target_id: string }[]> {
  return queryRows<{ client_id: string, target_type: HealthTargetType, target_id: string }>(
    `SELECT client_id, 'person'::text AS target_type, id AS target_id
       FROM crm_people WHERE deleted_at IS NULL AND lifecycle_stage = 'customer'
     UNION ALL
     SELECT client_id, 'company'::text AS target_type, id AS target_id
       FROM crm_companies WHERE deleted_at IS NULL AND lifecycle_stage = 'customer'
     LIMIT ${limit}`,
  )
}
