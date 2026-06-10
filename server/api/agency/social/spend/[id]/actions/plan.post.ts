import { requireWriteAccess } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'
import { recordCampaignAction } from '~~/server/utils/campaignActionLog'

export default eventHandler(async (event) => {
  const user = await requireWriteAccess(event)

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'id is required' })
  }

  const body = await readBody(event)
  const currentDailyBudget = parseBudgetNumber(body?.currentDailyBudget, 'currentDailyBudget')
  const recommendedDailyBudget = parseBudgetNumber(body?.recommendedDailyBudget, 'recommendedDailyBudget')

  const spend = await queryOne<{
    id: string
    platform: 'meta' | 'google_ads'
    campaign_name: string | null
  }>(
    `SELECT id::text, platform, campaign_name
     FROM media_spend
     WHERE id = $1`,
    [id]
  )
  if (!spend) {
    throw createError({ statusCode: 404, statusMessage: 'Spend record not found' })
  }

  const existing = await queryOne<PlannedActionRow>(
    `SELECT id::text,
            media_spend_id::text,
            platform,
            action_type,
            action_status,
            requested_by::text,
            requested_at::text,
            approved_by::text,
            approved_at::text,
            previous_value,
            new_value,
            reason
     FROM campaign_action_log
     WHERE media_spend_id = $1
       AND action_type = 'budget_update'
       AND (
         action_status = 'planned'
         OR action_status = 'approved'
       )
       AND metadata->>'source' = 'ai_pacing_review'
       AND (new_value->>'dailyBudget')::numeric = $2
     ORDER BY requested_at DESC
     LIMIT 1`,
    [id, recommendedDailyBudget]
  )
  if (existing) {
    return { planned: false, existing: true, action: normalizePlannedAction(existing) }
  }

  const action = await recordCampaignAction({
    mediaSpendId: id,
    platform: spend.platform,
    actionType: 'budget_update',
    actionStatus: 'planned',
    requestedBy: user.id,
    previousValue: { dailyBudget: currentDailyBudget },
    newValue: { dailyBudget: recommendedDailyBudget },
    reason: typeof body?.reason === 'string' && body.reason.trim() ? body.reason.trim() : null,
    metadata: {
      source: 'ai_pacing_review',
      issueType: typeof body?.issueType === 'string' ? body.issueType : null,
      pacingRatio: numberOrNull(body?.pacingRatio),
      projectedMonthEnd: numberOrNull(body?.projectedMonthEnd),
      monthlyBudget: numberOrNull(body?.budget),
      campaignName: spend.campaign_name,
    },
  })

  return { planned: true, action }
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
  action_type: string
  action_status: string
  requested_by: string | null
  requested_at: string
  approved_by: string | null
  approved_at: string | null
  previous_value: Record<string, unknown>
  new_value: Record<string, unknown>
  reason: string | null
}

function normalizePlannedAction(row: PlannedActionRow) {
  return {
    id: row.id,
    mediaSpendId: row.media_spend_id,
    platform: row.platform === 'google_ads' ? 'google' : 'meta',
    actionType: row.action_type,
    actionStatus: row.action_status,
    requestedBy: row.requested_by,
    requestedAt: row.requested_at,
    approvedBy: row.approved_by,
    approvedAt: row.approved_at,
    previousValue: row.previous_value,
    newValue: row.new_value,
    reason: row.reason,
  }
}
