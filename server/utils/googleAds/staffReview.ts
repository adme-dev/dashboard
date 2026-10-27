import { createError, type H3Event } from 'h3'
import { z } from 'zod'
import { queryOneFresh, queryRows, transaction } from '~~/server/utils/db'
import {
  assertMarketingCapabilityAtBoundary,
  requireIndependentMarketingReviewer
} from '~~/server/utils/ai/marketing/reviewAuthority'
import { assertGoogleAdsConnection } from '~~/server/utils/ai/marketing/googleAdsAccess'
import { getGoogleAdsActionPlan } from './actionStore'
import { executeSearchGoogleAdsControlAction } from './searchRuntime'
import { resolveMcpRuntimeConfig } from '~~/server/utils/ai/mcp/runtimeConfig'

const Request = z.strictObject({
  actionPlanId: z.string().uuid(),
  expectedRequestHash: z.string().regex(/^[a-f0-9]{64}$/)
})
async function load(event: H3Event, id: string, actorId: string) {
  const row = await queryOneFresh<{ client_id: string }>(
    'SELECT client_id FROM google_ads_action_plans WHERE id=$1 AND review_policy=\'delegated_marketing\'',
    [id]
  )
  if (!row)
    throw createError({
      statusCode: 404,
      statusMessage: 'Review plan not found'
    })
  const plan = await getGoogleAdsActionPlan(id, row.client_id, {
    queryOne: queryOneFresh
  })
  if (!plan)
    throw createError({
      statusCode: 404,
      statusMessage: 'Review plan not found'
    })
  await requireIndependentMarketingReviewer(event, {
    requesterId: plan.actorId,
    clientId: plan.clientId,
    reviewerId: actorId
  })
  const requester = await assertMarketingCapabilityAtBoundary(
    event,
    plan.actorId,
    plan.clientId,
    'ads_plan'
  )
  await assertGoogleAdsConnection(
    requester,
    plan.clientId,
    plan.connectionId,
    plan.customerId
  )
  return plan
}
export async function listGoogleAdsReviewPlans(
  event: H3Event,
  actorId: string,
  clientId?: string
) {
  const { resolveMcpStaffContext }
    = await import('~~/server/utils/ai/mcp/staffAuthority')
  const ctx = await resolveMcpStaffContext(event, actorId, [])
  if (!ctx.permissionGroups?.includes('ADMIN') || ctx.assistantReadOnly)
    throw createError({
      statusCode: 403,
      statusMessage: 'Reviewer authority required'
    })
  const rows = await queryRows<{ id: string, client_id: string }>(
    `SELECT p.id,p.client_id FROM google_ads_action_plans p JOIN agency_clients c ON c.id=p.client_id AND c.is_active=TRUE WHERE review_policy='delegated_marketing' AND actor_id<>$1 AND ($2::uuid IS NULL OR p.client_id=$2) AND ($3::uuid[] IS NULL OR p.client_id=ANY($3)) ORDER BY p.created_at DESC LIMIT 100`,
    [
      actorId,
      clientId ?? null,
      ctx.assistantScope?.clientAccessMode === 'all_active'
        ? null
        : (ctx.assistantScope?.assignedClientIds ?? [])
    ]
  )
  return Promise.all(
    rows.map(r =>
      getGoogleAdsActionPlan(r.id, r.client_id, { queryOne: queryOneFresh })
    )
  )
}
export async function reviewGoogleAdsPlan(
  event: H3Event,
  actorId: string,
  raw: unknown
) {
  const input = Request.extend({
    decision: z.enum(['approved', 'rejected']),
    reason: z.string().trim().max(1000).optional()
  }).parse(raw)
  const plan = await load(event, input.actionPlanId, actorId)
  if (plan.requestHash !== input.expectedRequestHash)
    throw createError({ statusCode: 409, statusMessage: 'Plan changed' })
  await transaction(async (db) => {
    const result = await db.query(
      `UPDATE google_ads_action_plans SET status=$3,reviewed_by=$4,reviewed_at=NOW(),rejection_reason=$5 WHERE id=$1 AND request_hash=$2 AND review_policy='delegated_marketing' AND status='pending_approval' AND expires_at>NOW() AND actor_id<>$4 RETURNING id`,
      [
        plan.id,
        input.expectedRequestHash,
        input.decision === 'approved' ? 'approved' : 'cancelled',
        actorId,
        input.reason ?? null
      ]
    )
    if (!result.rows.length)
      throw createError({
        statusCode: 409,
        statusMessage: 'Plan expired or already reviewed'
      })
    await db.query(
      `INSERT INTO google_ads_action_events(plan_id,client_id,actor_id,event_type,metadata) VALUES($1,$2,$3,$4,$5::jsonb)`,
      [
        plan.id,
        plan.clientId,
        actorId,
        input.decision,
        JSON.stringify({ requestHash: plan.requestHash })
      ]
    )
  })
  return getGoogleAdsActionPlan(plan.id, plan.clientId, {
    queryOne: queryOneFresh
  })
}
export async function executeReviewedGoogleAdsPlan(
  event: H3Event,
  actorId: string,
  raw: unknown
) {
  const input = Request.parse(raw),
    plan = await load(event, input.actionPlanId, actorId)
  if (
    plan.requestHash !== input.expectedRequestHash
    || !plan.reviewedBy
    || plan.reviewPolicy !== 'delegated_marketing'
  )
    throw createError({
      statusCode: 409,
      statusMessage: 'Exact approved review required'
    })
  await requireIndependentMarketingReviewer(event, {
    requesterId: plan.actorId,
    clientId: plan.clientId,
    reviewerId: plan.reviewedBy
  })
  if (plan.status !== 'approved' || Date.parse(plan.expiresAt) <= Date.now())
    throw createError({
      statusCode: 409,
      statusMessage: 'Plan is not executable; inspect existing result'
    })
  const flags = resolveMcpRuntimeConfig(event).suiteFlags
  const { resolveMcpStaffContext }
    = await import('~~/server/utils/ai/mcp/staffAuthority')
  const executor = await resolveMcpStaffContext(event, actorId, [])
  return executeSearchGoogleAdsControlAction(
    plan,
    {
      actorRole: executor.userRole,
      permissionGroups: executor.permissionGroups,
      hasWriteScope: true,
      reviewedPlanId: plan.id,
      executorId: actorId
    },
    {
      read: flags.googleAdsRead,
      write: flags.googleAdsWrite,
      automation: false,
      destructive: false
    }
  )
}
