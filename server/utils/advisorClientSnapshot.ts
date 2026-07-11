/**
 * Build a Financial Advisor snapshot scoped to a single agency client.
 *
 * Until per-client Xero OAuth is wired up (Phase 5b), we reconstruct a
 * client view from the agency's own Xero data using tracking categories
 * + contact filters. This is inherently approximate — the snapshot only
 * contains what the agency's books can tell us about that client.
 *
 * Returns null when the client can't be found or has no P&L signal, so
 * the calling endpoint can fall back to agency-wide advice gracefully.
 */

import type { H3Event } from 'h3'
import { queryOne } from './db'

type ClientPnlResponse = {
  options?: Array<{ name: string; revenue: number; directCosts: number; grossProfit: number; operatingExpenses: number; netProfit: number; netMargin: number }>
  availableCategories?: Array<{ id: string; name: string }>
  category?: { id: string; name: string }
}

type AgingResponse = {
  totalOutstanding?: number
  topContacts?: Array<{ name: string; amount: number; count: number; oldestDays: number }>
}

type RecurringResponse = {
  summary?: { mrr?: number }
  items?: Array<{ contact: string; contactId?: string; gross: number; status: string }>
}

function round2(n: unknown): number | null {
  if (typeof n !== 'number' || !Number.isFinite(n)) return null
  return Math.round(n * 100) / 100
}

function normalise(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '')
}

async function fetchInternal<T>(event: H3Event, path: string, query?: Record<string, any>): Promise<T | null> {
  try {
    const eventFetch = (event as any).$fetch as <R = unknown>(request: string, options?: {
      headers?: HeadersInit
      query?: Record<string, unknown>
    }) => Promise<R>
    return await eventFetch<T>(path, {
      headers: { cookie: (event.node.req.headers.cookie as string) ?? '' },
      query,
    })
  } catch {
    return null
  }
}

export async function buildClientSnapshot(
  event: H3Event,
  clientId: string,
  toDate: string
): Promise<{
  client: { id: string; name: string; xeroContactId: string | null }
  pnl: { revenueYtd: number | null; netProfitYtd: number | null; netMarginYtd: number | null } | null
  aging: { outstanding: number | null; oldestDays: number | null; count: number | null } | null
  recurring: { mrr: number | null } | null
  asOf: string
} | null> {
  const client = await queryOne<{ id: string; name: string; xero_contact_id: string | null }>(
    `SELECT id, name, xero_contact_id FROM agency_clients WHERE id = $1 AND is_active = true`,
    [clientId]
  )
  if (!client) return null

  const [pnl, aging, recurring] = await Promise.all([
    fetchInternal<ClientPnlResponse>(event, '/api/xero/reports/client-pnl', { toDate }),
    fetchInternal<AgingResponse>(event, '/api/xero/reports/aging'),
    fetchInternal<RecurringResponse>(event, '/api/xero/repeating-invoices'),
  ])

  // ── P&L slice by tracking option matching the client name ──
  let clientPnl: { revenueYtd: number | null; netProfitYtd: number | null; netMarginYtd: number | null } | null = null
  if (pnl?.options && pnl.options.length) {
    const target = normalise(client.name)
    // Match full name first, then any option whose name includes the client name.
    const match = pnl.options.find((o) => normalise(o.name) === target)
      ?? pnl.options.find((o) => normalise(o.name).includes(target))
    if (match) {
      clientPnl = {
        revenueYtd: round2(match.revenue),
        netProfitYtd: round2(match.netProfit),
        netMarginYtd: round2(match.netMargin ? match.netMargin * 100 : null),
      }
    }
  }

  // ── A/R slice — match topContacts rows to this client's name/id ──
  let clientAging: { outstanding: number | null; oldestDays: number | null; count: number | null } | null = null
  if (aging?.topContacts?.length) {
    const target = normalise(client.name)
    const matches = aging.topContacts.filter((c) => normalise(c.name).includes(target))
    if (matches.length) {
      clientAging = {
        outstanding: round2(matches.reduce((s, c) => s + (c.amount || 0), 0)),
        oldestDays: Math.max(...matches.map((c) => c.oldestDays || 0)) || null,
        count: matches.reduce((s, c) => s + (c.count || 0), 0),
      }
    }
  }

  // ── Recurring slice — MRR attributable to this client's contact ──
  let clientRecurring: { mrr: number | null } | null = null
  if (recurring?.items?.length) {
    const target = normalise(client.name)
    const xeroId = client.xero_contact_id
    const rows = recurring.items.filter((r) => {
      if (xeroId && r.contactId && r.contactId === xeroId) return true
      return r.contact && normalise(r.contact).includes(target)
    })
    if (rows.length) {
      // AUTHORISED = recurring invoice actively running.
      const activeMrr = rows.filter((r) => r.status === 'AUTHORISED').reduce((s, r) => s + (r.gross || 0), 0)
      clientRecurring = { mrr: round2(activeMrr) }
    }
  }

  // If we couldn't populate anything the advisor would be useless — bail so
  // the caller falls back to an agency-wide read.
  if (!clientPnl && !clientAging && !clientRecurring) {
    return null
  }

  return {
    client: { id: client.id, name: client.name, xeroContactId: client.xero_contact_id },
    pnl: clientPnl,
    aging: clientAging,
    recurring: clientRecurring,
    asOf: toDate,
  }
}
