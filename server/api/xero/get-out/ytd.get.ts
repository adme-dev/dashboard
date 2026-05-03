/**
 * GET /api/xero/get-out/ytd
 *
 * Year-to-date invoiced vs annual revenue goal. Annual goal is stored
 * in agency_settings under 'annual_revenue_goal'. If no goal is set,
 * extrapolates from current Get Out monthly target × 12 as a fallback
 * so the page can still surface progress.
 */

import { defineEventHandler, createError } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'
import { getSelectedTenant } from '~~/server/utils/session'
import { loadGetOutConfig, summariseConfig } from '~~/server/utils/getOutConfig'

interface AnnualGoalConfig { goalCents?: number }

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const tenantId = await getSelectedTenant(event)
  if (!tenantId) throw createError({ statusCode: 400, statusMessage: 'No organization selected' })

  const today = new Date()
  const yearStart = `${today.getFullYear()}-01-01`
  const yearEnd = `${today.getFullYear()}-12-31`
  const todayStr = today.toISOString().slice(0, 10)

  // Days through the year so we can compute "expected by today"
  const yearStartTs = new Date(yearStart).getTime()
  const yearEndTs = new Date(yearEnd).getTime()
  const todayTs = today.getTime()
  const daysIn = Math.max(0, Math.floor((todayTs - yearStartTs) / 86400_000) + 1)
  const totalDays = Math.floor((yearEndTs - yearStartTs) / 86400_000) + 1
  const expectedPctOfYear = daysIn / totalDays

  const goalRow = await queryOne<{ value: AnnualGoalConfig }>(
    `SELECT value FROM agency_settings WHERE tenant_id = $1 AND key = 'annual_revenue_goal'`,
    [tenantId],
  )
  let annualGoal = goalRow?.value?.goalCents ? goalRow.value.goalCents / 100 : null
  let goalSource: 'configured' | 'derived' = 'configured'
  if (annualGoal == null || annualGoal <= 0) {
    // Fall back to extrapolated Get Out target × 12
    const cfg = await loadGetOutConfig(tenantId)
    annualGoal = (summariseConfig(cfg).totalCents / 100) * 12
    goalSource = 'derived'
  }

  const ytd = await queryOne<{ invoiced_cents: string }>(
    `SELECT COALESCE(SUM(total_cents), 0)::text AS invoiced_cents
       FROM xero_invoices_cache
       WHERE tenant_id = $1
         AND type = 'ACCREC'
         AND status NOT IN ('VOIDED','DRAFT','DELETED')
         AND date BETWEEN $2::date AND $3::date`,
    [tenantId, yearStart, todayStr],
  )

  const ytdInvoiced = Number(ytd?.invoiced_cents ?? 0) / 100
  const ytdPctOfGoal = annualGoal > 0 ? Math.round((ytdInvoiced / annualGoal) * 1000) / 10 : 0
  const expectedByNow = annualGoal * expectedPctOfYear
  const aheadBehind = ytdInvoiced - expectedByNow
  const onPace = ytdInvoiced >= expectedByNow
  const projectedAnnual = daysIn > 0 ? (ytdInvoiced / daysIn) * totalDays : 0

  // Stale goal heuristic: a goal that's more than 1.5× under (or over) the
  // current pace by month 4 is almost certainly stale. Surface the projection
  // so the operator can re-baseline rather than chase a fictional number.
  const goalLooksStale = (
    daysIn >= 60
    && expectedByNow > 0
    && (ytdInvoiced / expectedByNow > 1.5 || ytdInvoiced / expectedByNow < 0.5)
  )

  return {
    annualGoal: Math.round(annualGoal * 100) / 100,
    goalSource,
    ytdInvoiced: Math.round(ytdInvoiced * 100) / 100,
    ytdPctOfGoal,
    expectedByNow: Math.round(expectedByNow * 100) / 100,
    aheadBehind: Math.round(aheadBehind * 100) / 100,
    onPace,
    projectedAnnual: Math.round(projectedAnnual * 100) / 100,
    daysIn,
    totalDays,
    goalLooksStale,
  }
})
