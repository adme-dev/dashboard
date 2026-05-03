/**
 * GET /api/xero/get-out/cash-runway
 *
 * Single source of truth for "are we going to run out of money?"
 *
 *   currentCash    — live bank balance from Xero BankSummary
 *   monthlyBurn    — operating commitment from getOutConfig (wages + ops + extras)
 *   netMonthlyBurn — burn minus expected monthly inflow (inferred MRR
 *                    high+medium weighted, mirrors cashflow-13w projection)
 *   runwayMonths   — currentCash / netMonthlyBurn  (capped at 99)
 */

import { defineEventHandler, createError } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'
import { getActiveTokenForSession } from '~~/server/utils/tokenStore'
import { getSelectedTenant } from '~~/server/utils/session'
import { extractCurrentCash, fetchBankSummary } from '~~/server/utils/xeroDataFetcher'
import { loadGetOutConfig, summariseConfig } from '~~/server/utils/getOutConfig'

function n(v: unknown): number {
  if (v == null) return 0
  const num = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(num) ? num : 0
}

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const token = await getActiveTokenForSession(event)
  const tenantId = await getSelectedTenant(event)
  if (!tenantId) throw createError({ statusCode: 400, statusMessage: 'No organization selected' })
  if (!token) throw createError({ statusCode: 401, statusMessage: 'Not authenticated with Xero' })

  // Live bank balance.
  let currentCash = 0
  try {
    const bank = await fetchBankSummary(token.access_token!, tenantId)
    currentCash = extractCurrentCash(bank)
  } catch (err: any) {
    console.warn('[cash-runway] bank summary failed:', err?.message)
  }

  // Monthly burn from configured Get Out. Defaults preserve the historical
  // hardcoded values when nothing's in agency_settings.
  const config = await loadGetOutConfig(tenantId)
  const monthlyBurn = summariseConfig(config).totalCents / 100

  // Expected monthly inflow from inferred MRR (high + medium weighted).
  const inferredRow = await queryOne<{ projected_monthly_cents: string }>(
    `SELECT COALESCE(SUM(CASE inferred_mrr_confidence
       WHEN 'high'   THEN inferred_mrr_cents
       WHEN 'medium' THEN (inferred_mrr_cents * 0.85)::bigint
       ELSE 0 END), 0)::text AS projected_monthly_cents
       FROM xero_customer_rollups
       WHERE tenant_id = $1
         AND NOT has_active_repeating`,
    [tenantId],
  )
  const monthlyInflow = n(inferredRow?.projected_monthly_cents) / 100

  const netMonthlyBurn = monthlyBurn - monthlyInflow
  // Runway is only meaningful when we're net-burning. If inflow ≥ burn, we
  // have effectively unlimited runway from these numbers — surface as 99.
  let runwayMonths: number
  if (netMonthlyBurn <= 0) {
    runwayMonths = 99
  } else if (currentCash <= 0) {
    runwayMonths = 0
  } else {
    runwayMonths = Math.round((currentCash / netMonthlyBurn) * 10) / 10
    if (runwayMonths > 99) runwayMonths = 99
  }

  let band: 'critical' | 'low' | 'healthy' | 'strong'
  if (currentCash < 0)             band = 'critical'
  else if (runwayMonths < 1.5)     band = 'critical'
  else if (runwayMonths < 3)       band = 'low'
  else if (runwayMonths < 6)       band = 'healthy'
  else                             band = 'strong'

  return {
    currentCash:     Math.round(currentCash * 100) / 100,
    monthlyBurn:     Math.round(monthlyBurn * 100) / 100,
    monthlyInflow:   Math.round(monthlyInflow * 100) / 100,
    netMonthlyBurn:  Math.round(netMonthlyBurn * 100) / 100,
    runwayMonths,
    band,
  }
})
