// server/utils/crm/scoreSignals.ts
// Gathers scoring inputs for a person/company from the DB and persists a recomputed
// score (+ history row). Pure math lives in scoring.ts; this is the I/O layer.
import { queryOne, transaction } from '~~/server/utils/db'
import { scoreTarget, type ScoreSignals, type ScoreResult } from './scoring'
import { requireCrmRecordAccess, type TransactionClient } from '~~/server/utils/crm/recordAccess'
import {
  resolveTrustedCrmSystemContext,
  type CrmRecordAccessContext
} from '~~/server/utils/crm/searchContext'

export type ScoreTargetType = 'person' | 'company'

export async function gatherSignals(
  clientId: string,
  targetType: ScoreTargetType,
  targetId: string,
): Promise<ScoreSignals | null> {
  if (targetType === 'person') {
    const p = await queryOne<{ email: string | null, phone: string | null, mobile: string | null, company_id: string | null, job_title: string | null }>(
      `SELECT email, phone, mobile, company_id, job_title FROM crm_people
        WHERE id = $1 AND client_id = $2 AND deleted_at IS NULL`,
      [targetId, clientId],
    )
    if (!p) return null
    const act = await queryOne<{ cnt: string, last_at: string | null }>(
      `SELECT COUNT(*)::text AS cnt, MAX(COALESCE(scheduled_at, created_at))::text AS last_at
         FROM crm_activities WHERE client_id = $1 AND target_type = 'person' AND target_id = $2 AND deleted_at IS NULL`,
      [clientId, targetId],
    )
    const opp = await queryOne<{ cnt: string }>(
      `SELECT COUNT(*)::text AS cnt FROM crm_opportunities
        WHERE client_id = $1 AND person_id = $2 AND status = 'open' AND deleted_at IS NULL`,
      [clientId, targetId],
    )
    return {
      activityCount: Number(act?.cnt ?? 0),
      openOpportunities: Number(opp?.cnt ?? 0),
      lastActivityAt: act?.last_at ?? null,
      hasEmail: !!p.email,
      hasPhone: !!(p.phone || p.mobile),
      companyLinked: !!p.company_id,
      hasJobTitle: !!p.job_title,
    }
  }
  // company
  const c = await queryOne<{ phone: string | null, domain: string | null }>(
    `SELECT phone, domain FROM crm_companies WHERE id = $1 AND client_id = $2 AND deleted_at IS NULL`,
    [targetId, clientId],
  )
  if (!c) return null
  const act = await queryOne<{ cnt: string, last_at: string | null }>(
    `SELECT COUNT(*)::text AS cnt, MAX(COALESCE(scheduled_at, created_at))::text AS last_at
       FROM crm_activities WHERE client_id = $1 AND target_type = 'company' AND target_id = $2 AND deleted_at IS NULL`,
    [clientId, targetId],
  )
  const opp = await queryOne<{ cnt: string }>(
    `SELECT COUNT(*)::text AS cnt FROM crm_opportunities
      WHERE client_id = $1 AND company_id = $2 AND status = 'open' AND deleted_at IS NULL`,
    [clientId, targetId],
  )
  return {
    activityCount: Number(act?.cnt ?? 0),
    openOpportunities: Number(opp?.cnt ?? 0),
    lastActivityAt: act?.last_at ?? null,
    hasEmail: false,
    hasPhone: !!c.phone,
    companyLinked: true,
    hasJobTitle: !!c.domain, // a known web domain is a weak fit signal for a company
  }
}

// Fire-and-forget guarded recompute for use in request handlers: no-ops for
// non-scorable targets (e.g. 'opportunity') and swallows errors so a scoring
// failure never breaks the parent mutation.
export async function recomputeIfScorable(
  clientId: string,
  targetType: string,
  targetId: string | null | undefined,
  reason: string,
  context?: CrmRecordAccessContext
): Promise<void> {
  if ((targetType !== 'person' && targetType !== 'company') || !targetId) return
  try {
    await recomputeScore({ clientId, targetType, targetId, reason, context })
  } catch (e) {
    console.error('[crm] score recompute failed', e)
  }
}

// Recompute + persist the 'lead' score for a target. Returns the result, or null if
// the target no longer exists. Callers should treat failures as non-fatal.
export async function recomputeScore(opts: {
  clientId: string
  targetType: ScoreTargetType
  targetId: string
  reason: string
  now?: Date
  context?: CrmRecordAccessContext
}): Promise<ScoreResult | null> {
  const context = opts.context ?? await resolveTrustedCrmSystemContext({
    clientId: opts.clientId,
    purpose: 'crm_score_compute'
  })
  await requireCrmRecordAccess(context, { type: opts.targetType, id: opts.targetId })
  const now = opts.now ?? new Date()
  const signals = await gatherSignals(opts.clientId, opts.targetType, opts.targetId)
  if (!signals) return null
  const r = scoreTarget(signals, now)

  await transaction(async (database: TransactionClient) => {
    await requireCrmRecordAccess(context, { type: opts.targetType, id: opts.targetId }, database)
    await database.query(
      `INSERT INTO crm_scores
       (client_id, target_type, target_id, score_type, total_score, grade,
        engagement_score, intent_score, fit_score, recency_score, computed_at, updated_at)
     VALUES ($1,$2,$3,'lead',$4,$5,$6,$7,$8,$9,NOW(),NOW())
     ON CONFLICT (client_id, target_type, target_id, score_type) DO UPDATE SET
       total_score = EXCLUDED.total_score, grade = EXCLUDED.grade,
       engagement_score = EXCLUDED.engagement_score, intent_score = EXCLUDED.intent_score,
       fit_score = EXCLUDED.fit_score, recency_score = EXCLUDED.recency_score,
       computed_at = NOW(), updated_at = NOW()`,
      [context.clientId, opts.targetType, opts.targetId, r.total, r.grade, r.engagement, r.intent, r.fit, r.recency]
    )
    await database.query(
      `INSERT INTO crm_score_history (client_id, target_type, target_id, score_type, total_score, grade, reason)
       VALUES ($1,$2,$3,'lead',$4,$5,$6)`,
      [context.clientId, opts.targetType, opts.targetId, r.total, r.grade, opts.reason]
    )
  })
  return r
}
