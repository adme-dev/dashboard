/**
 * GET /api/xero/get-out/clients
 *
 * Top-N contributors to this month's invoicing — joins
 *   xero_invoices_cache (this-month sum per contact)
 * to xero_contacts_cache (name, email, currency)
 * and customer_insights (churn risk, forecast)
 * so each row carries enough context to drill in or chase.
 *
 * Pure cache read — sub-100ms.
 */

import { defineEventHandler, getQuery, createError } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'
import { getSelectedTenant } from '~~/server/utils/session'

interface Row {
  contact_id: string
  name: string
  email: string | null
  currency: string
  this_month_cents: string | number
  this_month_count: number
  prior_month_cents: string | number
  outstanding_cents: string | number | null
  overdue_cents: string | number | null
  churn_risk_score: number | null
  churn_risk_band: string | null
}

function n(v: unknown): number {
  if (v == null) return 0
  const num = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(num) ? num : 0
}

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const tenantId = await getSelectedTenant(event)
  if (!tenantId) {
    throw createError({ statusCode: 400, statusMessage: 'No organization selected' })
  }

  const query = getQuery(event)
  const limit = Math.min(50, Math.max(1, Number(query.limit) || 10))

  const today = new Date()
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10)
  const priorMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1).toISOString().slice(0, 10)
  const priorMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0).toISOString().slice(0, 10)

  // Single query — aggregates this-month + prior-month per contact, joins
  // contact + insight info. Only includes contacts that invoiced this month.
  const rows = await queryRows<Row>(
    `WITH this_month AS (
       SELECT contact_id,
              SUM(total_cents) AS cents,
              COUNT(*)::int    AS cnt
         FROM xero_invoices_cache
         WHERE tenant_id = $1
           AND type = 'ACCREC'
           AND status NOT IN ('VOIDED','DRAFT','DELETED')
           AND date >= $2::date
         GROUP BY contact_id
     ),
     prior_month AS (
       SELECT contact_id, SUM(total_cents) AS cents
         FROM xero_invoices_cache
         WHERE tenant_id = $1
           AND type = 'ACCREC'
           AND status NOT IN ('VOIDED','DRAFT','DELETED')
           AND date BETWEEN $3::date AND $4::date
         GROUP BY contact_id
     )
     SELECT
       tm.contact_id,
       cc.name,
       cc.email,
       COALESCE(r.currency_code, cc.default_currency, 'AUD') AS currency,
       tm.cents::text AS this_month_cents,
       tm.cnt         AS this_month_count,
       COALESCE(pm.cents, 0)::text AS prior_month_cents,
       r.outstanding_cents,
       r.overdue_cents,
       ci.churn_risk_score,
       ci.churn_risk_band
     FROM this_month tm
     JOIN xero_contacts_cache cc
       ON cc.tenant_id = $1 AND cc.contact_id = tm.contact_id
     LEFT JOIN xero_customer_rollups r
       ON r.tenant_id = $1 AND r.contact_id = tm.contact_id
     LEFT JOIN customer_insights ci
       ON ci.tenant_id = $1 AND ci.contact_id = tm.contact_id
     LEFT JOIN prior_month pm
       ON pm.contact_id = tm.contact_id
     ORDER BY tm.cents DESC
     LIMIT $5`,
    [tenantId, monthStart, priorMonthStart, priorMonthEnd, limit],
  )

  const totalThisMonth = rows.reduce((s, r) => s + n(r.this_month_cents), 0) / 100

  const clients = rows.map((r) => {
    const thisMonth = n(r.this_month_cents) / 100
    const priorMonth = n(r.prior_month_cents) / 100
    return {
      id: r.contact_id,
      name: r.name,
      email: r.email,
      currency: r.currency,
      thisMonth: Math.round(thisMonth * 100) / 100,
      thisMonthCount: r.this_month_count,
      priorMonth: Math.round(priorMonth * 100) / 100,
      // % change vs same period last month — null for net-new contacts
      vsPriorPct: priorMonth > 0
        ? Math.round(((thisMonth - priorMonth) / priorMonth) * 1000) / 10
        : null,
      outstanding: r.outstanding_cents != null ? Number(r.outstanding_cents) / 100 : 0,
      overdue: r.overdue_cents != null ? Number(r.overdue_cents) / 100 : 0,
      churnRiskScore: r.churn_risk_score ?? 0,
      churnRiskBand: (r.churn_risk_band ?? 'low') as 'low' | 'moderate' | 'high' | 'critical',
      sharePct: totalThisMonth > 0
        ? Math.round((thisMonth / totalThisMonth) * 1000) / 10
        : 0,
    }
  })

  return {
    clients,
    totalThisMonth: Math.round(totalThisMonth * 100) / 100,
    contributorCount: clients.length,
  }
})
