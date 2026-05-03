/**
 * GET /api/xero/get-out/pipeline-coverage
 *
 * Open pipeline ÷ next-quarter target ratio. Industry rule of thumb:
 * should be 3-4× to reliably hit. <1× = trouble visible 60 days out.
 *
 * "Pipeline" = open quotes + repeating invoices that will fire in the
 * next 90 days. "Next-quarter target" = configured monthly Get Out × 3.
 */

import { defineEventHandler, createError } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { xeroFetch } from '~~/server/utils/xeroClient'
import { getActiveTokenForSession } from '~~/server/utils/tokenStore'
import { getSelectedTenant } from '~~/server/utils/session'
import { cachedFetch } from '~~/server/utils/kv'
import { queryOne } from '~~/server/utils/db'
import { loadGetOutConfig, summariseConfig } from '~~/server/utils/getOutConfig'

const QUOTE_PROBABILITY: Record<string, number> = {
  DRAFT: 0.20,
  SENT: 0.40,
  ACCEPTED: 0.80,
}

function n(v: unknown): number {
  if (v == null) return 0
  const num = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(num) ? num : 0
}

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const token = await getActiveTokenForSession(event)
  const tenantIdRaw = await getSelectedTenant(event)
  if (!tenantIdRaw) throw createError({ statusCode: 400, statusMessage: 'No organization selected' })
  if (!token) throw createError({ statusCode: 401, statusMessage: 'Not authenticated with Xero' })
  const tenantId = tenantIdRaw

  return cachedFetch(event, `xero-get-out:${tenantId}:pipeline-coverage`, 600, async () => {
    const today = new Date()
    const horizon = new Date(today.getTime() + 90 * 86400_000)
    const horizonStr = horizon.toISOString().slice(0, 10)
    const todayStr = today.toISOString().slice(0, 10)

    // Quotes — face value + probability-weighted
    let quotesFaceValue = 0
    let quotesWeighted = 0
    let quoteCount = 0
    try {
      const body = await xeroFetch<any>({
        accessToken: token.access_token!,
        tenantId,
        path: 'Quotes?order=Date DESC',
      })
      for (const q of (body?.quotes ?? [])) {
        const status = String(q.status ?? '').toUpperCase()
        const prob = QUOTE_PROBABILITY[status]
        if (!prob) continue
        const total = n(q.total)
        quotesFaceValue += total
        quotesWeighted += total * prob
        quoteCount++
      }
    } catch (err: any) {
      console.warn('[pipeline-coverage] quotes fetch failed:', err?.message)
    }

    // Repeating invoices firing in the next 90 days — count each scheduled
    // firing within the horizon, NOT just the first.
    let recurringContribution = 0
    let recurringScheduleCount = 0
    try {
      const body = await xeroFetch<any>({
        accessToken: token.access_token!,
        tenantId,
        path: 'RepeatingInvoices',
      })
      for (const r of (body?.repeatingInvoices ?? [])) {
        if (r.type !== 'ACCREC') continue
        if (String(r.status).toUpperCase() !== 'AUTHORISED') continue
        const total = n(r.total)
        if (!total) continue
        const period = Math.max(1, n(r.schedule?.period) || 1)
        const unit = String(r.schedule?.unit ?? 'MONTHLY').toUpperCase()
        // Estimate firings in 90 days
        let firingsInHorizon = 0
        if (unit === 'MONTHLY')      firingsInHorizon = Math.floor(3 / period)
        else if (unit === 'WEEKLY')  firingsInHorizon = Math.floor(13 / period)
        else if (unit === 'YEARLY')  firingsInHorizon = period <= 1 ? 0 : 0  // rare to fire within 90d
        recurringContribution += total * firingsInHorizon
        if (firingsInHorizon > 0) recurringScheduleCount++
      }
    } catch (err: any) {
      console.warn('[pipeline-coverage] repeating fetch failed:', err?.message)
    }

    // Inferred MRR — picks up retainer relationships that bill monthly
    // through manually re-issued invoices instead of Xero RepeatingInvoices.
    // Counts high+medium+low confidence × 3 months as the 90-day contribution.
    // Weighting: high=1.0, medium=0.85, low=0.6 (low confidence still has signal
    // — it just shouldn't count fully against a weighted forecast).
    let inferredMrrTotal = 0
    let inferredHighMrr = 0
    let inferredMediumMrr = 0
    let inferredLowMrr = 0
    let inferredScheduleCount = 0
    let inferredContribution = 0
    let inferredWeightedContribution = 0
    try {
      const row = await queryOne<{
        high_cents: string | null
        medium_cents: string | null
        low_cents: string | null
        contact_count: string | null
      }>(
        `SELECT
           COALESCE(SUM(CASE WHEN inferred_mrr_confidence='high'   THEN inferred_mrr_cents END), 0)::text AS high_cents,
           COALESCE(SUM(CASE WHEN inferred_mrr_confidence='medium' THEN inferred_mrr_cents END), 0)::text AS medium_cents,
           COALESCE(SUM(CASE WHEN inferred_mrr_confidence='low'    THEN inferred_mrr_cents END), 0)::text AS low_cents,
           COUNT(*) FILTER (WHERE inferred_mrr_cents > 0)::text AS contact_count
         FROM xero_customer_rollups
         WHERE tenant_id = $1
           AND NOT has_active_repeating`,
        // NOT has_active_repeating prevents double-counting contacts that
        // already showed up in the Xero RepeatingInvoices loop above.
        [tenantId],
      )
      inferredHighMrr   = n(row?.high_cents) / 100
      inferredMediumMrr = n(row?.medium_cents) / 100
      inferredLowMrr    = n(row?.low_cents) / 100
      inferredMrrTotal  = inferredHighMrr + inferredMediumMrr + inferredLowMrr
      inferredScheduleCount = Number(row?.contact_count ?? 0)
      // 90-day = 3 monthly firings per contact (face contribution).
      inferredContribution = inferredMrrTotal * 3
      // Weighted: high stays at 1.0, medium/low are downweighted.
      inferredWeightedContribution = (inferredHighMrr * 1.0 + inferredMediumMrr * 0.85 + inferredLowMrr * 0.6) * 3
    } catch (err: any) {
      console.warn('[pipeline-coverage] inferred MRR query failed:', err?.message)
    }

    const config = await loadGetOutConfig(tenantId)
    const monthlyTarget = summariseConfig(config).totalCents / 100
    const quarterlyTarget = monthlyTarget * 3

    const totalPipeline = quotesFaceValue + recurringContribution + inferredContribution
    const weightedPipeline = quotesWeighted + recurringContribution + inferredWeightedContribution  // recurring is contracted, weight 1.0
    const coverageFace = quarterlyTarget > 0
      ? Math.round((totalPipeline / quarterlyTarget) * 100) / 100
      : null
    const coverageWeighted = quarterlyTarget > 0
      ? Math.round((weightedPipeline / quarterlyTarget) * 100) / 100
      : null

    // Health bands (industry rule of thumb on weighted coverage)
    let band: 'critical' | 'low' | 'healthy' | 'strong' | 'unknown' = 'unknown'
    if (coverageWeighted != null) {
      if (coverageWeighted < 1) band = 'critical'
      else if (coverageWeighted < 2) band = 'low'
      else if (coverageWeighted < 3) band = 'healthy'
      else band = 'strong'
    }

    return {
      horizon: { from: todayStr, to: horizonStr, days: 90 },
      quarterlyTarget: Math.round(quarterlyTarget * 100) / 100,
      pipeline: {
        quotesFaceValue: Math.round(quotesFaceValue * 100) / 100,
        quotesWeighted: Math.round(quotesWeighted * 100) / 100,
        quoteCount,
        recurringContribution: Math.round(recurringContribution * 100) / 100,
        recurringScheduleCount,
        // Inferred MRR — retainer-style billing without a Xero schedule.
        inferredMonthlyMrr: Math.round(inferredMrrTotal * 100) / 100,
        inferredHighMrr: Math.round(inferredHighMrr * 100) / 100,
        inferredMediumMrr: Math.round(inferredMediumMrr * 100) / 100,
        inferredLowMrr: Math.round(inferredLowMrr * 100) / 100,
        inferredScheduleCount,
        inferredContribution: Math.round(inferredContribution * 100) / 100,
        totalFace: Math.round(totalPipeline * 100) / 100,
        totalWeighted: Math.round(weightedPipeline * 100) / 100,
      },
      coverage: { face: coverageFace, weighted: coverageWeighted, band },
    }
  })
})
