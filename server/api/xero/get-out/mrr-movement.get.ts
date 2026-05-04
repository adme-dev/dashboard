/**
 * GET /api/xero/get-out/mrr-movement
 *
 * Decomposes the change in monthly recurring revenue between the last two
 * COMPLETED calendar months. The current month is excluded — partial-month
 * data biases the picture down because retainer billing happens at month-end.
 *
 * Per-contact classification (lastMonth = M-1, priorMonth = M-2):
 *   new         — invoiced in M-1 only (first appearance in last 4 months)
 *   expansion   — invoiced both, lastMonth > priorMonth × 1.10
 *   contraction — invoiced both, lastMonth < priorMonth × 0.90
 *   churned     — invoiced in M-2 (and earlier), nothing in M-1
 *   stable      — invoiced both, ratio ∈ [0.9, 1.1]
 *   one-off     — invoiced in M-2 only, no prior history (project)
 *
 * Net MRR movement = expansion + new − contraction − churned.
 */

import { defineEventHandler, createError } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'
import { getSelectedTenant } from '~~/server/utils/session'

interface MovementRow {
  contact_id: string
  name: string | null
  last_month_cents: string | number | null
  prior_month_cents: string | number | null
  two_months_back_cents: string | number | null
  three_months_back_cents: string | number | null
}

function n(v: unknown): number {
  if (v == null) return 0
  const num = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(num) ? num : 0
}

type Bucket = 'new' | 'expansion' | 'contraction' | 'churned' | 'stable' | 'one_off'

interface MovementContact {
  contactId: string
  name: string | null
  lastMonth: number
  priorMonth: number
  delta: number
  bucket: Bucket
}

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const tenantId = await getSelectedTenant(event)
  if (!tenantId) throw createError({ statusCode: 400, statusMessage: 'No organization selected' })

  // 4 completed months window per contact, joined to contact name.
  const rows = await queryRows<MovementRow>(
    `WITH monthly AS (
       SELECT
         i.contact_id,
         DATE_TRUNC('month', i.date)::date AS month,
         SUM(i.total_cents)::bigint AS month_cents
       FROM xero_invoices_cache i
       WHERE i.tenant_id = $1
         AND i.type = 'ACCREC'
         AND i.status NOT IN ('VOIDED','DRAFT','DELETED')
         AND i.date >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '4 months')::date
         AND i.date <  DATE_TRUNC('month', CURRENT_DATE)::date
       GROUP BY i.contact_id, DATE_TRUNC('month', i.date)
     )
     SELECT
       m.contact_id,
       c.name,
       SUM(CASE WHEN m.month = DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month')::date THEN m.month_cents END)::text AS last_month_cents,
       SUM(CASE WHEN m.month = DATE_TRUNC('month', CURRENT_DATE - INTERVAL '2 months')::date THEN m.month_cents END)::text AS prior_month_cents,
       SUM(CASE WHEN m.month = DATE_TRUNC('month', CURRENT_DATE - INTERVAL '3 months')::date THEN m.month_cents END)::text AS two_months_back_cents,
       SUM(CASE WHEN m.month = DATE_TRUNC('month', CURRENT_DATE - INTERVAL '4 months')::date THEN m.month_cents END)::text AS three_months_back_cents
     FROM monthly m
     LEFT JOIN xero_contacts_cache c
       ON c.tenant_id = $1 AND c.contact_id = m.contact_id
     GROUP BY m.contact_id, c.name`,
    [tenantId],
  )

  // Bucket each contact + accumulate totals (in cents → dollars at the end).
  const movements: MovementContact[] = []
  let newCents = 0
  let expansionCents = 0
  let contractionCents = 0
  let churnedCents = 0
  let stableCents = 0
  let oneOffCents = 0

  for (const r of rows) {
    const last = n(r.last_month_cents)
    const prior = n(r.prior_month_cents)
    const twoBack = n(r.two_months_back_cents)
    const threeBack = n(r.three_months_back_cents)
    const hadAnyPriorHistory = prior > 0 || twoBack > 0 || threeBack > 0

    let bucket: Bucket
    let contribution = 0
    if (last > 0 && !hadAnyPriorHistory) {
      bucket = 'new'
      contribution = last
      newCents += last
    } else if (last > 0 && prior > 0 && last > prior * 1.10) {
      bucket = 'expansion'
      contribution = last - prior
      expansionCents += contribution
    } else if (last > 0 && prior > 0 && last < prior * 0.90) {
      bucket = 'contraction'
      contribution = prior - last  // positive number = how much we lost
      contractionCents += contribution
    } else if (last === 0 && prior > 0 && (twoBack > 0 || threeBack > 0)) {
      // Prior month had invoicing AND at least one earlier month — genuine churn,
      // not just a one-off project that finished.
      bucket = 'churned'
      contribution = prior
      churnedCents += prior
    } else if (last === 0 && prior > 0) {
      bucket = 'one_off'
      contribution = prior
      oneOffCents += prior
    } else if (last > 0 && prior > 0) {
      bucket = 'stable'
      contribution = last
      stableCents += last
    } else {
      // last = 0, prior = 0 — shouldn't happen given the FROM filter, skip.
      continue
    }

    movements.push({
      contactId: r.contact_id,
      name: r.name,
      lastMonth: Math.round(last / 100 * 100) / 100,
      priorMonth: Math.round(prior / 100 * 100) / 100,
      delta: Math.round(contribution / 100 * 100) / 100,
      bucket,
    })
  }

  const movementCents = newCents + expansionCents - contractionCents - churnedCents
  const lastMonthRecurringCents = newCents + expansionCents + stableCents
  const priorMonthRecurringCents = lastMonthRecurringCents + churnedCents + contractionCents - newCents - expansionCents
  const movementPct = priorMonthRecurringCents > 0
    ? Math.round((movementCents / priorMonthRecurringCents) * 1000) / 10
    : 0

  // Pull date labels for UI
  const today = new Date()
  const lastMonthDate = new Date(today.getFullYear(), today.getMonth() - 1, 1)
  const priorMonthDate = new Date(today.getFullYear(), today.getMonth() - 2, 1)
  const monthLabel = (d: Date) => d.toLocaleString('en-AU', { month: 'long', year: 'numeric' })

  // Top 5 movements by absolute delta — what to investigate first
  const topMovers = [...movements]
    .filter(m => m.bucket === 'expansion' || m.bucket === 'contraction' || m.bucket === 'churned' || m.bucket === 'new')
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, 5)

  return {
    period: {
      lastMonth: monthLabel(lastMonthDate),
      priorMonth: monthLabel(priorMonthDate),
    },
    totals: {
      newMrr:         Math.round(newCents / 100 * 100) / 100,
      expansionMrr:   Math.round(expansionCents / 100 * 100) / 100,
      contractionMrr: Math.round(contractionCents / 100 * 100) / 100,
      churnedMrr:     Math.round(churnedCents / 100 * 100) / 100,
      stableMrr:      Math.round(stableCents / 100 * 100) / 100,
      oneOffRevenue:  Math.round(oneOffCents / 100 * 100) / 100,
      netMovement:    Math.round(movementCents / 100 * 100) / 100,
      movementPct,
      lastMonthTotal: Math.round(lastMonthRecurringCents / 100 * 100) / 100,
    },
    counts: {
      new:         movements.filter(m => m.bucket === 'new').length,
      expansion:   movements.filter(m => m.bucket === 'expansion').length,
      contraction: movements.filter(m => m.bucket === 'contraction').length,
      churned:     movements.filter(m => m.bucket === 'churned').length,
      stable:      movements.filter(m => m.bucket === 'stable').length,
      oneOff:      movements.filter(m => m.bucket === 'one_off').length,
    },
    topMovers,
  }
})
