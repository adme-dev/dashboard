import { requireRole } from '~~/server/utils/auth'
import { queryOne, execute } from '~~/server/utils/db'
import { getSelectedTenant } from '~~/server/utils/session'
import { getSocialBudgetControlConfig } from '~~/server/utils/socialBudgetControlConfig'
import { decideExecution } from '~~/server/utils/budgetExecution'
import { platformDailyMinimum } from '~~/server/utils/budgetGuardrails'
import { resolveMetaBudgetTarget, updateMetaDailyBudget } from '~~/server/utils/metaClient'
import { updateGoogleCampaignDailyBudget } from '~~/server/utils/googleAdsClient'
import { resolveGoogleWriteAuth } from '~~/server/utils/googleWriteAuth'
import { claimApprovedAction, releaseActionClaim } from '~~/server/utils/campaignActionClaim'
import { splitDailyBudget } from '~~/server/utils/budgetSplit'
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
    refresh_token: string | null
    token_expires_at: string | null
    current_daily: string
    recommended_daily: string
    budget_allocated: string
    actual_spend: string
    period: string | null
    applied_today: boolean
  }>(
    `SELECT cal.platform,
            ms.connection_id::text,
            ms.campaign_id,
            sc.account_id,
            sc.access_token,
            sc.refresh_token,
            sc.token_expires_at,
            COALESCE((cal.previous_value->>'dailyBudget')::numeric, 0)::text AS current_daily,
            COALESCE((cal.new_value->>'dailyBudget')::numeric, 0)::text       AS recommended_daily,
            COALESCE(ms.budget_allocated, 0)::text AS budget_allocated,
            COALESCE(ms.actual_spend, 0)::text     AS actual_spend,
            ms.period,
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

  // NOTE (Phase 1 limitation, accepted for the admin-manual flag-gated rollout):
  // - media_spend is not tenant-scoped, so the write-enable flag/caps come from the
  //   acting user's selected tenant while the action row is global. Single-tenant in prod.
  // Concurrency is now handled by the atomic claim below (IM-01, migration 179).
  const platform = row.platform === 'google_ads' ? 'google' : 'meta'
  const tenantId = await getSelectedTenant(event)
  const cfg = await getSocialBudgetControlConfig(tenantId || '')
  // Require BOTH the master switch and the per-platform flag — mirrors the UI's
  // "armed" gating (app/utils/socialSpendPacingTable.ts) so the master Off switch
  // is authoritative and cannot be bypassed by a stray per-platform flag.
  const platformFlag = platform === 'meta' ? cfg.metaBudgetWritesEnabled : cfg.googleBudgetWritesEnabled
  const flagEnabled = cfg.liveBudgetChangesEnabled && platformFlag

  // Hard fail-safe: when platform writes are disabled, never touch the platform API or
  // mutate action state — return before resolving Meta CBO/ABO targets.
  if (!flagEnabled) {
    return { status: 'blocked', reason: 'writes_disabled', clampReasons: [] }
  }

  // Atomic claim (IM-01): flip approved → executing so two simultaneous Apply
  // clicks on the same action can't both reach the platform. Only one concurrent
  // request wins the row-locked UPDATE; the loser aborts before any platform call.
  // Released back to 'approved' below if a guardrail blocks the write.
  const claimed = await claimApprovedAction({ queryOne }, actionId)
  if (!claimed) {
    return { status: 'blocked', reason: 'already_executing', clampReasons: [] }
  }

  const now = new Date()
  const monthDaysRemaining = Math.max(1, new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - now.getDate() + 1)

  // Bust the spend row's actual period (and the current month, if different) so the
  // cached summary the slideover reads from reflects the new budget immediately.
  const bustSpendCache = async () => {
    const nowPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const tenantSeg = tenantId || 'no-tenant'
    const periods = Array.from(new Set([row.period, nowPeriod].filter(Boolean) as string[]))
    for (const period of periods) {
      await kvDelete(event, `spend:summary:${tenantSeg}:${period}:all`)
      await kvDelete(event, `spend:summary:${tenantSeg}:${period}:${row.platform}`)
    }
  }

  // For Meta, resolve CBO/ABO BEFORE deciding (need optimization goal + manual gate).
  // This is the only async between the claim and the write try/catch — a throw here
  // (stale Meta token, network) must release the claim, or the row is stuck 'executing'
  // forever with no recovery path (IM-01 / C-1).
  let metaTarget: Awaited<ReturnType<typeof resolveMetaBudgetTarget>> | null = null
  let platformMinimum = 5
  if (platform === 'meta') {
    try {
      metaTarget = await resolveMetaBudgetTarget(`act_${row.account_id}`, row.campaign_id, row.access_token)
    } catch (err) {
      // releaseActionClaim only touches rows still in 'executing', so this is a no-op
      // if anything already moved the row to a terminal state.
      await releaseActionClaim({ execute }, actionId).catch(() => {})
      throw err
    }
    if (metaTarget.level === 'manual') {
      await execute(
        `UPDATE campaign_action_log SET action_status='skipped', metadata = COALESCE(metadata,'{}'::jsonb) || $2::jsonb WHERE id=$1`,
        [actionId, JSON.stringify({ reason: 'abo_multi_adset_manual', adSetCount: metaTarget.adSetCount })]
      )
      return { status: 'skipped', reason: 'abo_multi_adset_manual', adSetCount: metaTarget.adSetCount }
    }
    if (metaTarget.level === 'adset_split') {
      // Each ad set must clear its own platform minimum, so the campaign total
      // must clear (per-ad-set min × participant count) for a clean split.
      const perAdsetMin = Math.max(...metaTarget.splitAdSets!.map(a => platformDailyMinimum(a.optimizationGoal)))
      platformMinimum = perAdsetMin * metaTarget.splitAdSets!.length
    } else {
      platformMinimum = platformDailyMinimum(metaTarget.optimizationGoal)
    }
  }

  // For an ABO split the "current daily" is the live sum of the participating ad
  // sets, not the campaign-level value recorded when the action was planned.
  const currentDailyForDecision = metaTarget?.level === 'adset_split'
    ? metaTarget.splitAdSets!.reduce((s, a) => s + a.currentDailyMajor, 0)
    : Number(row.current_daily)

  const decision = decideExecution({
    platform, flagEnabled,
    currentDaily: currentDailyForDecision,
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
    // Guardrail block before any platform write — release the claim so the
    // approval can be retried (e.g. with override).
    await releaseActionClaim({ execute }, actionId)
    return { status: 'blocked', reason: decision.reason, clampReasons: decision.clampReasons }
  }

  // Apply to the platform with read-back verification.
  try {
    let readBack: number

    // Multi-ABO: split the clamped campaign total across the participating ad sets.
    if (platform === 'meta' && metaTarget!.level === 'adset_split') {
      const perAdsetMin = Math.max(...metaTarget!.splitAdSets!.map(a => platformDailyMinimum(a.optimizationGoal)))
      // The "current" basis for this split is the LIVE sum of the participating ad
      // sets (recorded in the audit alongside the planned campaign-level previous_value
      // so a clamp computed against the live sum is reconstructable).
      const currentDailyTotal = metaTarget!.splitAdSets!.reduce((s, a) => s + a.currentDailyMajor, 0)
      const split = splitDailyBudget(
        metaTarget!.splitAdSets!.map(a => ({ id: a.id, currentDailyMajor: a.currentDailyMajor })),
        decision.finalDaily,
        perAdsetMin,
      )
      if (!split.ok) {
        // Structurally impossible to split (a share would fall below the per-ad-set
        // minimum). Terminal 'skipped' with a clear reason — releasing to 'approved'
        // would falsely imply a retry could succeed (the recommendation + ad-set
        // weights are fixed on this action). Operator must adjust on-platform.
        await execute(
          `UPDATE campaign_action_log SET action_status='skipped', executed_at=NOW(), error_message=$2, metadata = COALESCE(metadata,'{}'::jsonb) || $3::jsonb WHERE id=$1`,
          [actionId, `ABO split not possible (${split.reason}) — adjust ad-set budgets manually`, JSON.stringify({ reason: split.reason, perAdsetMin, currentDailyTotal, finalDailyTotal: decision.finalDaily })],
        )
        return { status: 'skipped', reason: split.reason, clampReasons: decision.clampReasons }
      }

      // Defense-in-depth for live money: the split must sum to the guardrail-approved
      // total to the cent. splitDailyBudget guarantees this; fail closed if it ever doesn't.
      const splitSum = Math.round(split.splits.reduce((s, x) => s + x.newDailyMajor, 0) * 100) / 100
      if (Math.abs(splitSum - decision.finalDaily) >= 0.01) {
        await execute(
          `UPDATE campaign_action_log SET action_status='failed', executed_at=NOW(), error_message=$2 WHERE id=$1`,
          [actionId, `Split sum ${splitSum} != approved total ${decision.finalDaily}`],
        )
        return { status: 'failed', reason: 'split_sum_mismatch' }
      }

      // Pre-populate every ad set so the audit records the ones we never attempted
      // after a mid-loop failure (the campaign is then left in a mixed state).
      type SplitResult = { adSetId: string; requested: number; readBack: number | null; status: 'applied' | 'failed' | 'not_attempted'; error?: string }
      const splitResults: SplitResult[] = split.splits.map(s => ({ adSetId: s.id, requested: s.newDailyMajor, readBack: null, status: 'not_attempted' }))
      let allApplied = true
      for (let i = 0; i < split.splits.length; i++) {
        const s = split.splits[i]!
        try {
          const res = await updateMetaDailyBudget(s.id, s.newDailyMajor, row.access_token)
          const ok = Math.abs(res.readBackDailyMajor - s.newDailyMajor) < 0.01
          splitResults[i]!.readBack = res.readBackDailyMajor
          splitResults[i]!.status = ok ? 'applied' : 'failed'
          if (!ok) { allApplied = false; break }
        } catch (err: any) {
          splitResults[i]!.status = 'failed'
          splitResults[i]!.error = (err?.data?.error?.message || err?.message || 'write failed').slice(0, 300)
          allApplied = false
          break
        }
      }

      const appliedCount = splitResults.filter(r => r.status === 'applied').length
      const failedIds = splitResults.filter(r => r.status === 'failed').map(r => r.adSetId)
      const notAttempted = splitResults.filter(r => r.status === 'not_attempted').length
      await execute(
        `UPDATE campaign_action_log
           SET action_status = $2, executed_at = NOW(),
               new_value = COALESCE(new_value,'{}'::jsonb) || $3::jsonb,
               error_message = $4,
               metadata = COALESCE(metadata,'{}'::jsonb) || $5::jsonb
         WHERE id = $1`,
        [
          actionId,
          allApplied ? 'applied' : 'failed',
          JSON.stringify({ totalDailyBudget: decision.finalDaily, currentDailyTotal, splits: splitResults }),
          allApplied ? null : `ABO split incomplete: ${appliedCount} applied, ${failedIds.length} failed (${failedIds.join(',')}), ${notAttempted} not attempted — campaign left in mixed state`,
          JSON.stringify({ clamped: decision.clamped, clampReasons: decision.clampReasons, override, appliedBy: user.id }),
        ]
      )

      if (allApplied) await bustSpendCache()
      return allApplied
        ? { status: 'applied', appliedDailyBudget: decision.finalDaily, clamped: decision.clamped, clampReasons: decision.clampReasons, splitResults }
        : { status: 'failed', reason: 'split_partial', splitResults }
    }

    if (platform === 'meta') {
      const res = await updateMetaDailyBudget(metaTarget!.targetId!, decision.finalDaily, row.access_token)
      readBack = res.readBackDailyMajor
    } else {
      const config = useRuntimeConfig()
      // The stored access_token is almost always stale (Google tokens expire
      // hourly), and client accounts under a manager need the login-customer-id
      // header — resolve both exactly like the working spend-sync read path.
      const { refreshGoogleToken, listAccessibleCustomers } = await import('~~/server/utils/googleAdsClient')
      const { accessToken, loginCustomerId } = await resolveGoogleWriteAuth(
        {
          id: row.connection_id,
          account_id: row.account_id,
          access_token: row.access_token,
          refresh_token: row.refresh_token,
          token_expires_at: row.token_expires_at,
        },
        {
          googleClientId: config.googleClientId as string,
          googleClientSecret: config.googleClientSecret as string,
          googleDeveloperToken: config.googleDeveloperToken as string,
          googleAdsLoginCustomerId: (config.googleAdsLoginCustomerId as string) || '',
        },
        {
          refreshGoogleToken,
          listAccessibleCustomers,
          updateToken: async (cid, tok, exp) => {
            await execute(
              `UPDATE social_connections SET access_token = $1, token_expires_at = $2, updated_at = NOW() WHERE id = $3`,
              [tok, exp, cid],
            )
          },
        },
      )
      const res = await updateGoogleCampaignDailyBudget({
        customerId: row.account_id, campaignId: row.campaign_id, dailyMajor: decision.finalDaily,
        token: accessToken, developerToken: config.googleDeveloperToken as string,
        loginCustomerId,
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
      await bustSpendCache()
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
