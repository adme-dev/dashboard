/**
 * GET /api/customers/[contactId]/ad-spend
 *
 * Last 6 months of ad spend per platform for a single customer, joined via
 * agency_clients.xero_contact_id → media_spend.client_id.
 *
 * Returns { linked: false } when the Xero contact isn't mirrored into
 * agency_clients yet (no client_id to join on).
 */

import { defineEventHandler, getRouterParam, createError } from 'h3'
import { queryOne, queryRows } from '~~/server/utils/db'

interface ClientRow {
  id: string
  name: string
  media_commission_rate: string | number | null
}

interface MediaSpendRow {
  platform: string
  period: string  // YYYY-MM
  actual_spend: string | number
  budget_allocated: string | number
  commission_amount: string | number
}

function n(v: unknown): number {
  if (v == null) return 0
  const num = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(num) ? num : 0
}

// Generate the trailing 6 month-keys (oldest → newest), e.g. ['2025-12','2026-01',…]
function trailingMonths(count: number): string[] {
  const result: string[] = []
  const today = new Date()
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(today.getUTCFullYear(), today.getUTCMonth() - i, 1)
    result.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`)
  }
  return result
}

export default defineEventHandler(async (event) => {
  await requireAuth(event)

  const contactId = getRouterParam(event, 'contactId')
  if (!contactId) {
    throw createError({ statusCode: 400, statusMessage: 'contactId required' })
  }

  const client = await queryOne<ClientRow>(
    `SELECT id, name, media_commission_rate
       FROM agency_clients
       WHERE xero_contact_id = $1
       LIMIT 1`,
    [contactId],
  )

  if (!client) {
    return {
      linked: false,
      months: trailingMonths(6),
      platforms: [],
      summary: {
        thisMonthSpend: 0,
        last6mSpend: 0,
        last6mCommission: 0,
        platformCount: 0,
      },
    }
  }

  const months = trailingMonths(6)
  // trailingMonths(6) always returns 6 entries — the non-null assertions
  // are safe and avoid noUncheckedIndexedAccess errors.
  const monthFloor = months[0]!  // earliest YYYY-MM string in window
  const currentMonth = months[months.length - 1]!

  const rows = await queryRows<MediaSpendRow>(
    `SELECT platform, period, actual_spend, budget_allocated, commission_amount
       FROM media_spend
       WHERE client_id = $1
         AND period >= $2
       ORDER BY period ASC, platform ASC`,
    [client.id, monthFloor],
  )

  // Pivot into platform → month-bucket totals so the UI can render a
  // one-row-per-platform table without re-walking.
  const byPlatform = new Map<string, { byMonth: Map<string, number>; total: number; commission: number; budget: number }>()
  for (const r of rows) {
    const platform = r.platform
    const entry = byPlatform.get(platform) ?? { byMonth: new Map(), total: 0, commission: 0, budget: 0 }
    const spend = n(r.actual_spend)
    entry.byMonth.set(r.period, (entry.byMonth.get(r.period) ?? 0) + spend)
    entry.total += spend
    entry.commission += n(r.commission_amount)
    entry.budget += n(r.budget_allocated)
    byPlatform.set(platform, entry)
  }

  const platforms = Array.from(byPlatform.entries())
    .map(([platform, e]) => ({
      platform,
      total: Math.round(e.total * 100) / 100,
      commission: Math.round(e.commission * 100) / 100,
      budget: Math.round(e.budget * 100) / 100,
      thisMonth: Math.round((e.byMonth.get(currentMonth) ?? 0) * 100) / 100,
      buckets: months.map(m => ({
        month: m,
        spend: Math.round((e.byMonth.get(m) ?? 0) * 100) / 100,
      })),
    }))
    .sort((a, b) => b.total - a.total)

  let thisMonthSpend = 0
  let last6mSpend = 0
  let last6mCommission = 0
  for (const p of platforms) {
    thisMonthSpend += p.thisMonth
    last6mSpend += p.total
    last6mCommission += p.commission
  }

  return {
    linked: true,
    client: {
      id: client.id,
      name: client.name,
      defaultCommissionRate: client.media_commission_rate != null ? Number(client.media_commission_rate) : null,
    },
    months,
    platforms,
    summary: {
      thisMonthSpend: Math.round(thisMonthSpend * 100) / 100,
      last6mSpend: Math.round(last6mSpend * 100) / 100,
      last6mCommission: Math.round(last6mCommission * 100) / 100,
      platformCount: platforms.length,
    },
  }
})
