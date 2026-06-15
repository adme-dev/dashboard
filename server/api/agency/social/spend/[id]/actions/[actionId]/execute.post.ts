import { requireRole } from '~~/server/utils/auth'
import { queryOne, execute } from '~~/server/utils/db'
import { getSelectedTenant } from '~~/server/utils/session'
import { getSocialBudgetControlConfig } from '~~/server/utils/socialBudgetControlConfig'
import { decideExecution } from '~~/server/utils/budgetExecution'
import { platformDailyMinimum } from '~~/server/utils/budgetGuardrails'
import { resolveMetaBudgetTarget, updateMetaDailyBudget } from '~~/server/utils/metaClient'
import { updateGoogleCampaignDailyBudget } from '~~/server/utils/googleAdsClient'
import { kvDelete } from '~~/server/utils/kv'

export default eventHandler(async (event) => {
  const user = await requireRole(event, ['owner', 'admin'])
  const id = getRouterParam(event, 'id')
  const actionId = getRouterParam(event, 'actionId')
  if (!id || !actionId) throw createError({ statusCode: 400, statusMessage: 'id and actionId required' })

  const body = await readBody(event).catch(() => ({})) as { override?: boolean }
  const override = body?.override === true

  // Load the approved action joined to its media_spend row.
  const row = await queryOne<{
    platform: 'meta' | 'google_ads'
    connection_id: string
    campaign_id: string
    account_id: string
    access_token: string
    current_daily: string
    recommended_daily: string
    budget_allocated: string
    actual_spend: string
    applied_today: boolean
  }>(
    `SELECT cal.platform,
            ms.connection_id::text,
            ms.campaign_id,
            sc.account_id,
            sc.access_token,
            COALESCE((cal.previous_value->>'dailyBudget')::numeric, 0)::text AS current_daily,
            COALESCE((cal.new_value->>'dailyBudget')::numeric, 0)::text       AS recommended_daily,
            COALESCE(ms.budget_allocated, 0)::text AS budget_allocated,
            COALESCE(ms.actual_spend, 0)::text     AS actual_spend,
            EXISTS (
              SELECT 1 FROM campaign_action_log x
              WHERE x.media_spend_id = cal.media_spend_id
                AND x.action_status = 'applied'
                AND x.executed_at::date = NOW()::date
            ) AS applied_today
     FROM campaign_action_log cal
     JOIN media_spend ms ON ms.id = cal.media_spend_id
     JOIN social_connections sc ON sc.id = ms.connection_id
     WHERE cal.id = $2 AND cal.media_spend_id = $1 AND cal.action_status = 'approved'`,
    [id, actionId]
  )
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Approved action not found' })

  const platform = row.platform === 'google_ads' ? 'google' : 'meta'
  const tenantId = await getSelectedTenant(event)
  const cfg = await getSocialBudgetControlConfig(tenantId || '')
  const flagEnabled = platform === 'meta' ? cfg.metaBudgetWritesEnabled : cfg.googleBudgetWritesEnabled

  const now = new Date()
  const monthDaysRemaining = Math.max(1, new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - now.getDate() + 1)

  // For Meta, resolve CBO/ABO BEFORE deciding (need optimization goal + manual gate).
  let metaTarget: Awaited<ReturnType<typeof resolveMetaBudgetTarget>> | null = null
  let platformMinimum = 5
  if (platform === 'meta') {
    metaTarget = await resolveMetaBudgetTarget(`act_${row.account_id}`, row.campaign_id, row.access_token)
    if (metaTarget.level === 'manual') {
      await execute(
        `UPDATE campaign_action_log SET action_status='skipped', metadata = COALESCE(metadata,'{}'::jsonb) || $2::jsonb WHERE id=$1`,
        [actionId, JSON.stringify({ reason: 'abo_multi_adset_manual', adSetCount: metaTarget.adSetCount })]
      )
      return { status: 'skipped', reason: 'abo_multi_adset_manual', adSetCount: metaTarget.adSetCount }
    }
    platformMinimum = platformDailyMinimum(metaTarget.optimizationGoal)
  }

  const decision = decideExecution({
    platform, flagEnabled,
    currentDaily: Number(row.current_daily),
    recommendedDaily: Number(row.recommended_daily),
    platformMinimum,
    maxMultiple: cfg.maxMultiple,
    monthlyBudget: Number(row.budget_allocated),
    mtdSpend: Number(row.actual_spend),
    monthDaysRemaining,
    monthlyMarginPct: cfg.monthlyMarginPct,
    alreadyAppliedToday: row.applied_today,
    override,
  })

  if (!decision.proceed) {
    return { status: 'blocked', reason: decision.reason, clampReasons: decision.clampReasons }
  }

  // Apply to the platform with read-back verification.
  try {
    let readBack: number
    if (platform === 'meta') {
      const res = await updateMetaDailyBudget(metaTarget!.targetId!, decision.finalDaily, row.access_token)
      readBack = res.readBackDailyMajor
    } else {
      const config = useRuntimeConfig()
      const res = await updateGoogleCampaignDailyBudget({
        customerId: row.account_id, campaignId: row.campaign_id, dailyMajor: decision.finalDaily,
        token: row.access_token, developerToken: config.googleDeveloperToken as string,
        loginCustomerId: (config.googleAdsLoginCustomerId as string) || undefined,
      })
      readBack = res.readBackDailyMajor
    }

    const verified = Math.abs(readBack - decision.finalDaily) < 0.01
    await execute(
      `UPDATE campaign_action_log
         SET action_status = $2, executed_at = NOW(),
             new_value = COALESCE(new_value,'{}'::jsonb) || $3::jsonb,
             error_message = $4,
             metadata = COALESCE(metadata,'{}'::jsonb) || $5::jsonb
       WHERE id = $1`,
      [
        actionId,
        verified ? 'applied' : 'failed',
        JSON.stringify({ appliedDailyBudget: decision.finalDaily, readBackDailyBudget: readBack }),
        verified ? null : `Read-back mismatch: expected ${decision.finalDaily}, got ${readBack}`,
        JSON.stringify({ clamped: decision.clamped, clampReasons: decision.clampReasons, override, appliedBy: user.id }),
      ]
    )

    if (verified) {
      const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
      const tenantSeg = tenantId || 'no-tenant'
      await kvDelete(event, `spend:summary:${tenantSeg}:${period}:all`)
      await kvDelete(event, `spend:summary:${tenantSeg}:${period}:${row.platform}`)
    }
    return verified
      ? { status: 'applied', appliedDailyBudget: decision.finalDaily, clamped: decision.clamped, clampReasons: decision.clampReasons }
      : { status: 'failed', reason: 'read_back_mismatch', readBack }
  } catch (err: any) {
    await execute(
      `UPDATE campaign_action_log SET action_status='failed', executed_at=NOW(), error_message=$2 WHERE id=$1`,
      [actionId, (err?.data?.error?.message || err?.message || 'Platform write failed').slice(0, 1000)]
    )
    return { status: 'failed', reason: 'platform_error', message: err?.message || 'Platform write failed' }
  }
})
