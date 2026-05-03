/**
 * GET /api/xero/get-out/ar-aging
 *
 * Tenant-wide AR aging summary (current / 1-30 / 31-60 / 61-90 / 90+),
 * total outstanding, total overdue, oldest-overdue days, and the top 5
 * accounts by overdue amount. Pulls from xero_customer_rollups so the
 * read is one query — no live Xero call.
 */

import { defineEventHandler, createError } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { queryRows, queryOne } from '~~/server/utils/db'
import { getSelectedTenant } from '~~/server/utils/session'

interface AgingRow {
  current_cents: string | null
  d30_cents: string | null
  d60_cents: string | null
  d90_cents: string | null
  d90plus_cents: string | null
  outstanding_cents: string | null
  overdue_cents: string | null
  oldest_overdue_days: number | null
}

interface OverdueContact {
  contact_id: string
  name: string | null
  overdue_cents: string | null
  oldest_overdue_days: number | null
  outstanding_cents: string | null
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

  // Aging buckets are stored as JSONB { current, '1-30', '31-60', '61-90', '90+' }
  // — sum each bucket across all customers.
  const total = await queryOne<AgingRow>(
    `SELECT
       COALESCE(SUM((aging_buckets->>'current')::bigint), 0)::text   AS current_cents,
       COALESCE(SUM((aging_buckets->>'1-30')::bigint),    0)::text   AS d30_cents,
       COALESCE(SUM((aging_buckets->>'31-60')::bigint),   0)::text   AS d60_cents,
       COALESCE(SUM((aging_buckets->>'61-90')::bigint),   0)::text   AS d90_cents,
       COALESCE(SUM((aging_buckets->>'90+')::bigint),     0)::text   AS d90plus_cents,
       COALESCE(SUM(outstanding_cents), 0)::text                     AS outstanding_cents,
       COALESCE(SUM(overdue_cents), 0)::text                         AS overdue_cents,
       COALESCE(MAX(oldest_overdue_days), 0)::int                    AS oldest_overdue_days
     FROM xero_customer_rollups
     WHERE tenant_id = $1`,
    [tenantId],
  )

  const topOverdue = await queryRows<OverdueContact>(
    `SELECT r.contact_id, c.name,
            r.overdue_cents::text     AS overdue_cents,
            r.oldest_overdue_days,
            r.outstanding_cents::text AS outstanding_cents
       FROM xero_customer_rollups r
       JOIN xero_contacts_cache c
         ON c.tenant_id = r.tenant_id AND c.contact_id = r.contact_id
       WHERE r.tenant_id = $1
         AND r.overdue_cents > 0
       ORDER BY r.overdue_cents DESC
       LIMIT 5`,
    [tenantId],
  )

  const buckets = {
    current: n(total?.current_cents) / 100,
    '1-30':  n(total?.d30_cents) / 100,
    '31-60': n(total?.d60_cents) / 100,
    '61-90': n(total?.d90_cents) / 100,
    '90+':   n(total?.d90plus_cents) / 100,
  }
  const totalOutstanding = n(total?.outstanding_cents) / 100
  const totalOverdue = n(total?.overdue_cents) / 100
  const overduePct = totalOutstanding > 0
    ? Math.round((totalOverdue / totalOutstanding) * 1000) / 10
    : 0

  // Health bands — overdue % of total outstanding is the headline number.
  // Industry rule of thumb: >25% overdue is concerning, >40% is bad.
  let band: 'healthy' | 'watch' | 'concerning' | 'bad' = 'healthy'
  if (overduePct >= 40) band = 'bad'
  else if (overduePct >= 25) band = 'concerning'
  else if (overduePct >= 10) band = 'watch'

  return {
    buckets: {
      current: Math.round(buckets.current * 100) / 100,
      '1-30':  Math.round(buckets['1-30'] * 100) / 100,
      '31-60': Math.round(buckets['31-60'] * 100) / 100,
      '61-90': Math.round(buckets['61-90'] * 100) / 100,
      '90+':   Math.round(buckets['90+'] * 100) / 100,
    },
    totalOutstanding: Math.round(totalOutstanding * 100) / 100,
    totalOverdue: Math.round(totalOverdue * 100) / 100,
    overduePct,
    oldestOverdueDays: total?.oldest_overdue_days ?? 0,
    band,
    topOverdue: topOverdue.map(c => ({
      contactId: c.contact_id,
      name: c.name,
      overdue: Math.round(n(c.overdue_cents) / 100 * 100) / 100,
      outstanding: Math.round(n(c.outstanding_cents) / 100 * 100) / 100,
      oldestOverdueDays: c.oldest_overdue_days ?? 0,
    })),
  }
})
