/**
 * GET /api/customers/collections
 *
 * Cross-customer collections queue: every customer with overdue $, joined
 * with their last collections action and credit-hold status. Sorted by
 * payment_priority DESC then oldest_overdue_days DESC then overdue $ DESC.
 *
 * Powers the /customers/collections page — "what to chase today".
 */

import { defineEventHandler, getQuery, createError } from 'h3'
import { queryRows } from '~~/server/utils/db'
import { getSelectedTenant } from '~~/server/utils/session'

interface QueueRow {
  contact_id: string
  name: string
  email: string | null
  phone: string | null
  currency: string
  payment_terms_days: number | null

  outstanding_cents: string | number
  overdue_cents: string | number
  oldest_overdue_days: number
  aging_buckets: Record<string, number>
  dso_days: string | null
  paid_late_pct: string | null

  credit_hold: boolean | null
  hold_reason: string | null
  payment_priority: number | null
  account_manager_name: string | null

  last_action: string | null
  last_action_at: string | null
  last_action_by: string | null

  tags: Array<{ id: string; label: string; color: string }> | null

  churn_risk_score: number | null
  churn_risk_band: string | null
}

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const tenantId = await getSelectedTenant(event)
  if (!tenantId) {
    throw createError({ statusCode: 400, statusMessage: 'No Xero organization selected' })
  }

  const query = getQuery(event)
  const minOverdueDollars = Math.max(0, Number(query.minOverdue) || 0)
  // ?staleDays=N → only show customers we haven't touched in N days
  const staleDays = Number(query.staleDays) || 0

  const rows = await queryRows<QueueRow>(
    `WITH last_action AS (
       SELECT DISTINCT ON (contact_id)
         contact_id, action, created_at, created_by
       FROM customer_collections_log
       WHERE tenant_id = $1
       ORDER BY contact_id, created_at DESC
     ),
     contact_tags AS (
       SELECT a.contact_id,
              jsonb_agg(jsonb_build_object('id', t.id, 'label', t.label, 'color', t.color)
                        ORDER BY t.label) AS tags
         FROM customer_tag_assignments a
         JOIN customer_tags t ON t.id = a.tag_id AND t.tenant_id = a.tenant_id
         WHERE a.tenant_id = $1
         GROUP BY a.contact_id
     )
     SELECT
       cc.contact_id, cc.name, cc.email, cc.phone,
       COALESCE(r.currency_code, cc.default_currency, 'AUD') AS currency,
       cc.payment_terms_days,
       r.outstanding_cents, r.overdue_cents, r.oldest_overdue_days, r.aging_buckets,
       r.dso_days, r.paid_late_pct,
       cf.credit_hold, cf.hold_reason, cf.payment_priority,
       am.name AS account_manager_name,
       la.action     AS last_action,
       la.created_at AS last_action_at,
       tm.name       AS last_action_by,
       ct.tags,
       ci.churn_risk_score, ci.churn_risk_band
     FROM xero_contacts_cache cc
     JOIN xero_customer_rollups r
            ON r.tenant_id = cc.tenant_id AND r.contact_id = cc.contact_id
     LEFT JOIN customer_insights ci
            ON ci.tenant_id = cc.tenant_id AND ci.contact_id = cc.contact_id
     LEFT JOIN customer_finance cf
            ON cf.tenant_id = cc.tenant_id AND cf.contact_id = cc.contact_id
     LEFT JOIN team_members am ON am.id = cf.account_manager_id
     LEFT JOIN last_action la ON la.contact_id = cc.contact_id
     LEFT JOIN team_members tm ON tm.id = la.created_by
     LEFT JOIN contact_tags ct ON ct.contact_id = cc.contact_id
     WHERE cc.tenant_id = $1
       AND r.overdue_cents >= ($2::bigint)
       AND ($3 = 0 OR (la.created_at IS NULL OR la.created_at < NOW() - ($3 || ' days')::interval))
     ORDER BY
       COALESCE(cf.payment_priority, 0) DESC,
       r.oldest_overdue_days DESC,
       r.overdue_cents DESC`,
    [tenantId, Math.round(minOverdueDollars * 100), staleDays],
  )

  const customers = rows.map((r) => {
    const overdueCents = Number(r.overdue_cents) || 0
    const outstandingCents = Number(r.outstanding_cents) || 0
    const buckets = r.aging_buckets || {}
    return {
      id: r.contact_id,
      name: r.name,
      email: r.email,
      phone: r.phone,
      currency: r.currency,
      paymentTermsDays: r.payment_terms_days,
      outstanding: outstandingCents / 100,
      overdue: overdueCents / 100,
      oldestOverdueDays: r.oldest_overdue_days,
      agingBuckets: {
        current: Number(buckets.current ?? 0) / 100,
        '1-30':  Number(buckets['1-30']  ?? 0) / 100,
        '31-60': Number(buckets['31-60'] ?? 0) / 100,
        '61-90': Number(buckets['61-90'] ?? 0) / 100,
        '90+':   Number(buckets['90+']   ?? 0) / 100,
      },
      dsoDays: r.dso_days != null ? Number(r.dso_days) : null,
      paidLatePct: r.paid_late_pct != null ? Number(r.paid_late_pct) : null,
      creditHold: Boolean(r.credit_hold),
      holdReason: r.hold_reason,
      paymentPriority: r.payment_priority ?? 0,
      accountManager: r.account_manager_name,
      lastAction: r.last_action,
      lastActionAt: r.last_action_at,
      lastActionBy: r.last_action_by,
      tags: r.tags ?? [],
      churnRiskScore: r.churn_risk_score ?? 0,
      churnRiskBand: (r.churn_risk_band ?? 'low') as 'low' | 'moderate' | 'high' | 'critical',
    }
  })

  // Top-line metrics: how big is the queue + how stale is it
  const totalOverdue = customers.reduce((s, c) => s + c.overdue, 0)
  const oldestDays = customers.reduce((m, c) => Math.max(m, c.oldestOverdueDays), 0)
  const onHold = customers.filter(c => c.creditHold).length
  const untouched7d = customers.filter(c =>
    !c.lastActionAt || (Date.now() - new Date(c.lastActionAt).getTime()) > 7 * 86400_000,
  ).length

  return {
    customers,
    metrics: {
      total: customers.length,
      totalOverdue: Math.round(totalOverdue * 100) / 100,
      oldestDays,
      onHold,
      untouched7d,
    },
  }
})
