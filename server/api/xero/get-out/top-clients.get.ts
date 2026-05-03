/**
 * GET /api/xero/get-out/top-clients
 *
 * Top N clients by YTD revenue + concentration risk. The lead question on
 * a CFO dashboard is "if my biggest client churned tomorrow, how exposed am I?"
 * — concentration_pct already lives in xero_customer_rollups, computed during
 * sync. We surface the top 10 + a few aggregate signals.
 */

import { defineEventHandler, createError } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { queryRows, queryOne } from '~~/server/utils/db'
import { getSelectedTenant } from '~~/server/utils/session'

interface ClientRow {
  contact_id: string
  name: string | null
  ytd_revenue_cents: string
  ltv_cents: string
  concentration_pct: string
  has_active_repeating: boolean
  inferred_mrr_cents: string
  inferred_mrr_confidence: 'none' | 'low' | 'medium' | 'high'
  recurring_basis: string
  last_invoice_date: string | null
}

function n(v: unknown): number {
  if (v == null) return 0
  const num = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(num) ? num : 0
}

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const tenantId = await getSelectedTenant(event)
  if (!tenantId) throw createError({ statusCode: 400, statusMessage: 'No organization selected' })

  const limit = 10

  const top = await queryRows<ClientRow>(
    `SELECT r.contact_id,
            c.name,
            r.ytd_revenue_cents::text   AS ytd_revenue_cents,
            r.ltv_cents::text            AS ltv_cents,
            r.concentration_pct::text    AS concentration_pct,
            r.has_active_repeating,
            COALESCE(r.inferred_mrr_cents, 0)::text AS inferred_mrr_cents,
            r.inferred_mrr_confidence,
            r.recurring_basis,
            r.last_invoice_date::text   AS last_invoice_date
       FROM xero_customer_rollups r
       JOIN xero_contacts_cache c
         ON c.tenant_id = r.tenant_id AND c.contact_id = r.contact_id
       WHERE r.tenant_id = $1
         AND r.ytd_revenue_cents > 0
       ORDER BY r.ytd_revenue_cents DESC
       LIMIT $2`,
    [tenantId, limit],
  )

  const totals = await queryOne<{
    total_clients: string
    total_ytd_cents: string
    top_5_share: string | null
    top_10_share: string | null
  }>(
    `WITH ranked AS (
       SELECT ytd_revenue_cents,
              ROW_NUMBER() OVER (ORDER BY ytd_revenue_cents DESC) AS rn,
              SUM(ytd_revenue_cents) OVER ()::numeric AS tot
         FROM xero_customer_rollups
         WHERE tenant_id = $1 AND ytd_revenue_cents > 0
     )
     SELECT
       COUNT(*)::text AS total_clients,
       COALESCE(MAX(tot), 0)::text AS total_ytd_cents,
       CASE WHEN MAX(tot) > 0
            THEN ROUND(100 * SUM(ytd_revenue_cents) FILTER (WHERE rn <= 5)::numeric  / MAX(tot), 1)::text
            ELSE NULL END AS top_5_share,
       CASE WHEN MAX(tot) > 0
            THEN ROUND(100 * SUM(ytd_revenue_cents) FILTER (WHERE rn <= 10)::numeric / MAX(tot), 1)::text
            ELSE NULL END AS top_10_share
       FROM ranked`,
    [tenantId],
  )

  const totalYtd = n(totals?.total_ytd_cents) / 100
  const top5Share = totals?.top_5_share != null ? Number(totals.top_5_share) : null
  const top10Share = totals?.top_10_share != null ? Number(totals.top_10_share) : null

  // Concentration risk: top-1 share is the headline number.
  const top1Share = top[0] ? Number(top[0].concentration_pct) : 0
  let concentrationBand: 'healthy' | 'elevated' | 'risky' | 'critical' = 'healthy'
  if (top1Share >= 40) concentrationBand = 'critical'
  else if (top1Share >= 25) concentrationBand = 'risky'
  else if (top1Share >= 15) concentrationBand = 'elevated'

  return {
    totalClients: Number(totals?.total_clients ?? 0),
    totalYtd: Math.round(totalYtd * 100) / 100,
    top5SharePct: top5Share,
    top10SharePct: top10Share,
    top1SharePct: Math.round(top1Share * 100) / 100,
    concentrationBand,
    clients: top.map(c => ({
      contactId: c.contact_id,
      name: c.name,
      ytdRevenue: Math.round(n(c.ytd_revenue_cents) / 100 * 100) / 100,
      ltv:        Math.round(n(c.ltv_cents) / 100 * 100) / 100,
      concentrationPct: Math.round(Number(c.concentration_pct) * 100) / 100,
      isRecurring: c.has_active_repeating || ['inferred_high','inferred_medium'].includes(c.recurring_basis),
      recurringBasis: c.recurring_basis,
      inferredMrr: Math.round(n(c.inferred_mrr_cents) / 100 * 100) / 100,
      inferredMrrConfidence: c.inferred_mrr_confidence,
      lastInvoiceDate: c.last_invoice_date,
    })),
  }
})
