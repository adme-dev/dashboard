import { z } from 'zod'
import type { H3Event } from 'h3'
import type { AiTool } from '../toolRegistry'
import { ok, fail, type ToolContext, type ToolResult } from '../toolContext'
import { fetchClientEconomics, resolveByName, type ClientEconomicsRow, type EconomicsPeriod } from './economics'

const params = z.object({
  clientName: z.string().optional(),
  period: z.enum(['mtd', 'ytd']).default('mtd'),
})
type Args = z.infer<typeof params>

export type ProfitabilityDeps = {
  fetchEconomics: (event: H3Event, period: EconomicsPeriod) => Promise<ClientEconomicsRow[]>
  fetchAsOf?: (event: H3Event, options?: { now?: Date }) => Promise<unknown>
  now?: () => Date
}
const defaultDeps: ProfitabilityDeps = { fetchEconomics: fetchClientEconomics }

const BASIS = {
  marginPct: 'delivery margin = (revenue − passthrough − delivery cost) / revenue, from reconciled client financial sources',
  sharePct: 'client revenue / total in-period revenue across all clients',
} as const

const round1 = (n: number) => Math.round(n * 10) / 10
const dollars = (cents: number) => Math.round(cents) / 100

type Computed = {
  client: string
  revenue: number | null
  passthrough: number | null
  agi: number | null
  laborCost: number
  deliveryCost: number | null
  deliveryMarginPct: number | null
  profitabilityAvailable: boolean
  unavailableSources: string[]
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
  const revenueAvailable = r.revenueAvailable ?? true
  const mediaAvailable = r.mediaAvailable ?? true
  const supplierTrackingAvailable = r.supplierTrackingAvailable ?? true
  const profitabilityAvailable = r.profitabilityAvailable
    ?? (revenueAvailable && mediaAvailable && supplierTrackingAvailable)
  const unavailableSources = [
    ...(!revenueAvailable ? ['revenue'] : []),
    ...(!mediaAvailable ? ['media'] : []),
    ...(!supplierTrackingAvailable ? ['supplier_tracking'] : []),
  ]
  return {
    client: r.name,
    revenue: revenueAvailable ? dollars(revenueCents) : null,
    passthrough: mediaAvailable ? dollars(passthroughCents) : null,
    agi: revenueAvailable && mediaAvailable ? dollars(agiCents) : null,
    laborCost: dollars(laborCents),
    deliveryCost: supplierTrackingAvailable ? dollars(deliveryCostCents) : null,
    deliveryMarginPct: profitabilityAvailable && agiCents > 0
      ? round1(((agiCents - deliveryCostCents) / agiCents) * 100)
      : null,
    profitabilityAvailable,
    unavailableSources: unavailableSources.length > 0 ? unavailableSources : profitabilityAvailable ? [] : ['financial_sources'],
  }
}

export async function getClientProfitability(args: Args, ctx: ToolContext, deps: ProfitabilityDeps = defaultDeps): Promise<ToolResult> {
  try {
    const rows = await deps.fetchEconomics(ctx.event, args.period)
    const asOf = deps.fetchAsOf ? await deps.fetchAsOf(ctx.event, { now: deps.now?.() }).catch(() => null) : null
    if (rows.length === 0) return ok({ period: args.period, ...(asOf ? { asOf } : {}), note: 'No client financial data available — Xero may be disconnected or the invoice cache is empty.' })

    const revenueRows = rows.filter(row => row.revenueAvailable ?? true)
    const totalRev = revenueRows.reduce(
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
      const sharePct = c.revenue !== null && totalRev > 0 ? round1((match.revenueCents / totalRev) * 100) : null
      return ok({ period: args.period, ...(asOf ? { asOf } : {}), ...c, sharePct, basis: BASIS })
    }

    const computed = rows.map(compute)
    const byRevDesc = [...revenueRows].sort((a, b) => b.revenueCents - a.revenueCents)
    const shareOfTop = (n: number) =>
      totalRev > 0
        ? round1((byRevDesc.slice(0, n).reduce(
            (total, row) => addCents(total, row.revenueCents, 'Portfolio concentration revenue'),
            0,
          ) / totalRev) * 100)
        : 0

    // Only clients with financial activity this period are ranked (all-zero clients are excluded).
    const active = computed.filter(c => (
      c.profitabilityAvailable
      && (c.revenue !== 0 || c.deliveryCost !== 0 || c.passthrough !== 0)
    ))
    const withMargin = active.filter(c => c.deliveryMarginPct != null)
    // Loss-making clients (AGI <= 0 → margin undefined) are the WORST; order most-negative AGI first.
    const lossMaking = active
      .filter(c => c.deliveryMarginPct == null)
      .sort((a, b) => (
        (a.agi ?? 0) - (b.agi ?? 0)
        || (b.deliveryCost ?? 0) - (a.deliveryCost ?? 0)
        || a.client.localeCompare(b.client)
      ))

    const topByMargin = [...withMargin].sort((a, b) => b.deliveryMarginPct! - a.deliveryMarginPct!).slice(0, 5)
    const worstFirst = [...lossMaking, ...[...withMargin].sort((a, b) => a.deliveryMarginPct! - b.deliveryMarginPct!)]
    const bottomByMargin = worstFirst.slice(0, 5)
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
      unavailable: computed
        .filter(client => !client.profitabilityAvailable)
        .map(client => ({ client: client.client, unavailableSources: client.unavailableSources })),
      agencyConcentration: { top5Pct: shareOfTop(5), top10Pct: shareOfTop(10) },
      limit: 5,
      rankedClientCount: active.length,
      basis: BASIS,
      more: Math.max(0, active.length - shown.size),
    })
  } catch {
    return fail('Could not compute client profitability — the financial data may be unavailable.')
  }
}

export const profitabilityTool: AiTool<Args> = {
  name: 'get_client_profitability',
  description: 'Per-client profitability: Agency Gross Income (revenue minus pass-through media) and delivery margin % (AGI minus labor, project expenses, and client-tracked Xero supplier costs, over AGI). Clients missing a required financial source are reported as unavailable and excluded from margin rankings. Name a client for a deep-dive, or omit clientName for a portfolio ranking (most/least profitable + revenue concentration). Use for "which clients make us money / is Acme profitable / who has the worst margin". Returns compact numbers only. Do NOT use for cash position (use get_finance_snapshot) or ad-spend pacing.',
  parameters: params,
  requiredPermission: 'FINANCE',
  returnsUntrusted: false,
  handler: (a, c) => getClientProfitability(a, c),
}
