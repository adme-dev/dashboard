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
