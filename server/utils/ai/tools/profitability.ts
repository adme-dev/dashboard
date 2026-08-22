import { z } from 'zod'
import type { H3Event } from 'h3'
import type { AiTool } from '../toolRegistry'
import { ok, fail, type ToolContext, type ToolResult } from '../toolContext'
import { fetchClientEconomics, fetchEconomicsAsOf, resolveByName, type ClientEconomicsRow, type EconomicsAsOf, type EconomicsPeriod } from './economics'

const params = z.object({
  clientName: z.string().optional(),
  period: z.enum(['mtd', 'ytd']).default('mtd'),
})
type Args = z.infer<typeof params>

export type ProfitabilityDeps = {
  fetchEconomics: (event: H3Event, period: EconomicsPeriod) => Promise<ClientEconomicsRow[]>
  fetchAsOf?: (event: any, options?: { now?: Date }) => Promise<EconomicsAsOf>
  now?: () => Date
}
const defaultDeps: ProfitabilityDeps = { fetchEconomics: fetchClientEconomics, fetchAsOf: fetchEconomicsAsOf }

const MARGIN_LIST_LIMIT = 5
const BASIS = {
  marginPct: 'delivery_margin = (revenue − passthrough − labor) / revenue, from Xero ACCREC invoices dated in-period, media_spend actual_spend, and time_entries hours × hourly_rate',
  sharePct: 'client revenue / total in-period revenue across all clients',
} as const

const round1 = (n: number) => Math.round(n * 10) / 10
const dollars = (cents: number) => Math.round(cents) / 100

type Computed = {
  client: string
  revenue: number
  passthrough: number
  agi: number
  laborCost: number
  deliveryCost: number
  deliveryMarginPct: number | null
}

function exactCents(value: number, label: string): number {
  if (!Number.isSafeInteger(value)) throw new Error(`${label} must be represented as integer cents`)
  return value
}

function addCents(left: number, right: number, label: string): number {
  const total = left + right
  if (!Number.isSafeInteger(total)) throw new Error(`${label} exceeds the safe integer range`)
  return total
}

function compute(r: ClientEconomicsRow): Computed {
  const revenueCents = exactCents(r.revenueCents, `${r.name} revenue`)
  const passthroughCents = exactCents(r.passthroughCents, `${r.name} pass-through`)
  const laborCents = exactCents(r.laborCents, `${r.name} labour`)
  const projectExpenseCents = exactCents(r.projectExpenseCents ?? 0, `${r.name} project expenses`)
  const xeroSupplierCostCents = exactCents(r.xeroSupplierCostCents ?? 0, `${r.name} Xero supplier cost`)
  const fallbackAgiCents = addCents(revenueCents, -passthroughCents, `${r.name} AGI`)
  const agiCents = exactCents(r.agiCents ?? fallbackAgiCents, `${r.name} AGI`)
  const fallbackDeliveryCostCents = addCents(
    addCents(laborCents, projectExpenseCents, `${r.name} delivery cost`),
    xeroSupplierCostCents,
    `${r.name} delivery cost`,
  )
  const deliveryCostCents = exactCents(r.deliveryCostCents ?? fallbackDeliveryCostCents, `${r.name} delivery cost`)
  return {
    client: r.name,
    revenue: dollars(revenueCents),
    passthrough: dollars(passthroughCents),
    agi: dollars(agiCents),
    laborCost: dollars(laborCents),
    deliveryCost: dollars(deliveryCostCents),
    deliveryMarginPct: agiCents > 0
      ? round1(((agiCents - deliveryCostCents) / agiCents) * 100)
      : null,
  }
}

export async function getClientProfitability(args: Args, ctx: ToolContext, deps: ProfitabilityDeps = defaultDeps): Promise<ToolResult> {
  try {
    const rows = await deps.fetchEconomics(ctx.event, args.period)
    const asOf = deps.fetchAsOf ? await deps.fetchAsOf(ctx.event, { now: deps.now?.() }).catch(() => null) : null
    if (rows.length === 0) return ok({ period: args.period, ...(asOf ? { asOf } : {}), note: 'No client financial data available — Xero may be disconnected or the invoice cache is empty.' })

    const totalRev = rows.reduce(
      (total, row) => addCents(total, exactCents(row.revenueCents, `${row.name} revenue`), 'Portfolio revenue'),
      0,
    )

    if (args.clientName) {
      const { match, candidates } = resolveByName(rows, args.clientName)
      if (!match) {
        if (candidates.length > 1) return ok({ disambiguation: candidates.map(c => c.name) })
        return ok({ note: `No client matching "${args.clientName}".` })
      }
      const c = compute(match)
      const sharePct = totalRev > 0 ? round1((match.revenueCents / totalRev) * 100) : 0
      return ok({ period: args.period, ...(asOf ? { asOf } : {}), ...c, sharePct, basis: BASIS })
    }

    const computed = rows.map(compute)
    const byRevDesc = [...rows].sort((a, b) => b.revenueCents - a.revenueCents)
    const shareOfTop = (n: number) =>
      totalRev > 0
        ? round1((byRevDesc.slice(0, n).reduce(
            (total, row) => addCents(total, row.revenueCents, 'Portfolio concentration revenue'),
            0,
          ) / totalRev) * 100)
        : 0

    // Only clients with financial activity this period are ranked (all-zero clients are excluded).
    const active = computed.filter(c => c.revenue !== 0 || c.deliveryCost !== 0 || c.passthrough !== 0)
    const withMargin = active.filter(c => c.deliveryMarginPct != null)
    // Loss-making clients (AGI <= 0 → margin undefined) are the WORST; order most-negative AGI first.
    const lossMaking = active
      .filter(c => c.deliveryMarginPct == null)
      .sort((a, b) => a.agi - b.agi || b.deliveryCost - a.deliveryCost || a.client.localeCompare(b.client))

    const topByMargin = [...withMargin].sort((a, b) => b.deliveryMarginPct! - a.deliveryMarginPct!).slice(0, MARGIN_LIST_LIMIT)
    const worstFirst = [...lossMaking, ...[...withMargin].sort((a, b) => a.deliveryMarginPct! - b.deliveryMarginPct!)]
    const bottomByMargin = worstFirst.slice(0, MARGIN_LIST_LIMIT)
    const shown = new Set<string>([...topByMargin, ...bottomByMargin].map(c => c.client))

    const project = (c: Computed) => ({
      client: c.client,
      revenue: c.revenue,
      agi: c.agi,
      deliveryCost: c.deliveryCost,
      marginPct: c.deliveryMarginPct,
    })
    return ok({
      period: args.period,
      ...(asOf ? { asOf } : {}),
      topByMargin: topByMargin.map(project),
      bottomByMargin: bottomByMargin.map(project),
      limit: MARGIN_LIST_LIMIT,
      agencyConcentration: { top5Pct: shareOfTop(5), top10Pct: shareOfTop(10), basis: 'share of total in-period revenue held by the top-N clients by revenue' },
      rankedClientCount: active.length,
      more: Math.max(0, active.length - shown.size),
      basis: BASIS,
    })
  } catch {
    return fail('Could not compute client profitability — the financial data may be unavailable.')
  }
}

export const profitabilityTool: AiTool<Args> = {
  name: 'get_client_profitability',
  description: 'Per-client profitability: Agency Gross Income (revenue minus pass-through media) and delivery margin % (AGI minus labor, project expenses, and allocated Xero supplier costs, over AGI). Name a client for a deep-dive, or omit clientName for a portfolio ranking (most/least profitable + revenue concentration). Use for "which clients make us money / is Acme profitable / who has the worst margin". Returns compact numbers only. Do NOT use for cash position (use get_finance_snapshot) or ad-spend pacing.',
  parameters: params,
  requiredPermission: 'FINANCE',
  returnsUntrusted: false,
  handler: (a, c) => getClientProfitability(a, c),
}
