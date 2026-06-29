import { requireWriteAccess } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'
import { recordCampaignAction } from '~~/server/utils/campaignActionLog'
import { getSelectedTenant } from '~~/server/utils/session'
import { buildCampaignBudgetIdentity } from '~~/server/utils/campaignBudgetIdentity'

export default eventHandler(async (event) => {
  const user = await requireWriteAccess(event)
  const tenantId = await getSelectedTenant(event)

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'id is required' })
  }

  const body = await readBody(event)
  const currentDailyBudget = parseBudgetNumber(body?.currentDailyBudget, 'currentDailyBudget')
  const recommendedDailyBudget = parseBudgetNumber(body?.recommendedDailyBudget, 'recommendedDailyBudget')
  const source = typeof body?.source === 'string' && body.source.trim() ? body.source.trim() : 'ai_pacing_review'
  const recommendationResourceName = typeof body?.recommendationResourceName === 'string' ? body.recommendationResourceName : null

  const spend = await queryOne<{
    id: string
    platform: 'meta' | 'google_ads'
    campaign_name: string | null
    client_id: string | null
    campaign_id: string | null
    connection_id: string | null
    account_id: string | null
    period: string | null
  }>(
    `SELECT ms.id::text,
            ms.platform,
            ms.campaign_name,
            ms.client_id::text,
            ms.campaign_id,
            ms.connection_id::text,
            sc.account_id,
            ms.period
     FROM media_spend ms
     LEFT JOIN social_connections sc ON sc.id = ms.connection_id
     WHERE ms.id = $1`,
    [id]
  )
  if (!spend) {
    throw createError({ statusCode: 404, statusMessage: 'Spend record not found' })
  }

  const budgetIdentity = buildCampaignBudgetIdentity({
    tenantId,
    clientId: spend.client_id,
    platform: spend.platform,
    accountId: spend.account_id,
    connectionId: spend.connection_id,
    campaignExternalId: spend.campaign_id,
    campaignName: spend.campaign_name,
    mediaSpendId: spend.id,
    period: spend.period,
  })
  if (!budgetIdentity.key) {
    throw createError({
      statusCode: 400,
      statusMessage: `Campaign is not eligible for budget actions: ${budgetIdentity.issues.join(', ')}`,
    })
  }

  const existing = await findActiveBudgetAction({
    budgetKey: budgetIdentity.key,
    platform: spend.platform,
    clientId: budgetIdentity.clientId,
    campaignExternalId: budgetIdentity.campaignExternalId!,
    accountId: budgetIdentity.accountId!,
    period: budgetIdentity.period!,
  })
  if (existing) {
    return { planned: false, existing: true, action: normalizePlannedAction(existing) }
  }

  const actionInput = {
    mediaSpendId: id,
    platform: spend.platform,
    budgetKey: budgetIdentity.key,
    actionType: 'budget_update',
    actionStatus: 'planned' as const,
    requestedBy: user.id,
    previousValue: { dailyBudget: currentDailyBudget },
    newValue: { dailyBudget: recommendedDailyBudget },
    reason: typeof body?.reason === 'string' && body.reason.trim() ? body.reason.trim() : null,
    metadata: {
      source,
      recommendationResourceName,
      budgetKey: budgetIdentity.key,
      budgetPeriod: budgetIdentity.period,
      campaignExternalId: budgetIdentity.campaignExternalId,
      accountId: budgetIdentity.accountId,
      connectionId: spend.connection_id,
      clientId: budgetIdentity.clientId,
      budgetIdentityIssues: budgetIdentity.issues,
      issueType: typeof body?.issueType === 'string' ? body.issueType : null,
      pacingRatio: numberOrNull(body?.pacingRatio),
      projectedMonthEnd: numberOrNull(body?.projectedMonthEnd),
      monthlyBudget: numberOrNull(body?.budget),
      campaignName: spend.campaign_name,
      ...(typeof body?.chosenSource === 'string'
        ? {
            aiAnalysis: {
              chosenSource: body.chosenSource,
              aiProposedDaily: numberOrNull(body?.aiProposedDaily),
              deterministicDaily: numberOrNull(body?.deterministicDaily),
              confidence: typeof body?.confidence === 'string' ? body.confidence : null,
              riskFlags: Array.isArray(body?.riskFlags) ? body.riskFlags.filter((x: unknown) => typeof x === 'string') : [],
              modelId: typeof body?.modelId === 'string' ? body.modelId : null,
            },
          }
        : {}),
    },
  }

  try {
    const action = await recordCampaignAction(actionInput)

    return { planned: true, action }
  } catch (err) {
    if (!isActiveBudgetKeyConflict(err)) throw err
    const racedExisting = await findActiveBudgetAction({
      budgetKey: budgetIdentity.key,
      platform: spend.platform,
      clientId: budgetIdentity.clientId,
      campaignExternalId: budgetIdentity.campaignExternalId!,
      accountId: budgetIdentity.accountId!,
      period: budgetIdentity.period!,
    })
    if (!racedExisting) throw err
    return { planned: false, existing: true, action: normalizePlannedAction(racedExisting) }
  }
})

function parseBudgetNumber(value: unknown, field: string) {
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) {
    throw createError({ statusCode: 400, statusMessage: `${field} must be a non-negative number` })
  }
  return Math.round(n * 100) / 100
}

function numberOrNull(value: unknown) {
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

interface PlannedActionRow {
  id: string
  media_spend_id: string
  platform: 'meta' | 'google_ads'
  budget_key: string | null
  action_type: string
  action_status: string
  requested_by: string | null
  requested_at: string
  approved_by: string | null
  approved_at: string | null
  cancelled_by: string | null
  cancelled_at: string | null
  executed_at: string | null
  previous_value: Record<string, unknown>
  new_value: Record<string, unknown>
  reason: string | null
  external_request_id: string | null
  error_message: string | null
}

function normalizePlannedAction(row: PlannedActionRow) {
  return {
    id: row.id,
    mediaSpendId: row.media_spend_id,
    platform: row.platform === 'google_ads' ? 'google' : 'meta',
    budgetKey: row.budget_key,
    actionType: row.action_type,
    actionStatus: row.action_status,
    requestedBy: row.requested_by,
    requestedAt: row.requested_at,
    approvedBy: row.approved_by,
    approvedAt: row.approved_at,
    cancelledBy: row.cancelled_by,
    cancelledAt: row.cancelled_at,
    executedAt: row.executed_at,
    previousValue: row.previous_value,
    newValue: row.new_value,
    reason: row.reason,
    externalRequestId: row.external_request_id,
    errorMessage: row.error_message,
  }
}

async function findActiveBudgetAction(input: {
  budgetKey: string
  platform: 'meta' | 'google_ads'
  clientId: string
  campaignExternalId: string
  accountId: string
  period: string
}) {
  return queryOne<PlannedActionRow>(
    `SELECT cal.id::text,
            cal.media_spend_id::text,
            cal.platform,
            cal.budget_key,
            cal.action_type,
            cal.action_status,
            cal.requested_by::text,
            cal.requested_at::text,
            cal.approved_by::text,
            cal.approved_at::text,
            cal.cancelled_by::text,
            cal.cancelled_at::text,
            cal.executed_at::text,
            cal.previous_value,
            cal.new_value,
            cal.reason,
            cal.external_request_id,
            cal.error_message
     FROM campaign_action_log cal
     LEFT JOIN media_spend active_ms ON active_ms.id = cal.media_spend_id
     LEFT JOIN social_connections active_sc ON active_sc.id = active_ms.connection_id
     WHERE cal.action_type = 'budget_update'
       AND cal.action_status IN ('planned', 'approved', 'executing')
       AND (
         cal.budget_key = $1
         OR (
           cal.budget_key IS NULL
           AND cal.platform = $2
           AND active_ms.period = $3
           AND active_ms.client_id = $4::uuid
           AND active_ms.campaign_id = $5
           AND COALESCE(active_sc.account_id, active_ms.connection_id::text, 'unlinked') = $6
         )
       )
     ORDER BY CASE WHEN cal.action_status = 'approved' THEN 0 ELSE 1 END,
              COALESCE(cal.approved_at, cal.requested_at) DESC
     LIMIT 1`,
    [
      input.budgetKey,
      input.platform,
      input.period,
      input.clientId,
      input.campaignExternalId,
      input.accountId,
    ]
  )
}

function isActiveBudgetKeyConflict(err: unknown): boolean {
  const error = err as { code?: string, constraint?: string, message?: string } | null
  if (!error || error.code !== '23505') return false
  return error.constraint === 'idx_campaign_action_log_active_budget_key'
    || String(error.message || '').includes('idx_campaign_action_log_active_budget_key')
}
