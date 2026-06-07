import { z } from 'zod'
import type { H3Event } from 'h3'
import type { AiTool } from '../toolRegistry'
import { ok, fail, type ToolContext, type ToolResult } from '../toolContext'
import { fetchClientEconomics, resolveByName, type ClientEconomicsRow, type Period } from './economics'

const params = z.object({
  clientName: z.string().optional(),
  period: z.enum(['mtd', 'ytd']).default('mtd'),
})
type Args = z.infer<typeof params>

export type ProfitabilityDeps = {
  fetchEconomics: (event: H3Event, period: Period) => Promise<ClientEconomicsRow[]>
}
const defaultDeps: ProfitabilityDeps = { fetchEconomics: fetchClientEconomics }

const round1 = (n: number) => Math.round(n * 10) / 10

type Computed = { client: string, revenue: number, passthrough: number, agi: number, laborCost: number, deliveryMarginPct: number | null }

function compute(r: ClientEconomicsRow): Computed {
  const revenue = r.revenueCents / 100
  const passthrough = r.passthroughCents / 100
  const agi = revenue - passthrough
  const laborCost = r.laborCents / 100
  return {
    client: r.name,
    revenue: Math.round(revenue * 100) / 100,
    passthrough: Math.round(passthrough * 100) / 100,
    agi: Math.round(agi * 100) / 100,
    laborCost: Math.round(laborCost * 100) / 100,
    deliveryMarginPct: agi > 0 ? round1(((agi - laborCost) / agi) * 100) : null,
  }
}

export async function getClientProfitability(args: Args, ctx: ToolContext, deps: ProfitabilityDeps = defaultDeps): Promise<ToolResult> {
  try {
    const rows = await deps.fetchEconomics(ctx.event, args.period)
    if (rows.length === 0) return ok({ period: args.period, note: 'No client financial data available — Xero may be disconnected or the invoice cache is empty.' })

    const totalRev = rows.reduce((s, r) => s + r.revenueCents, 0)

    if (args.clientName) {
      const { match, candidates } = resolveByName(rows, args.clientName)
      if (!match) {
        if (candidates.length > 1) return ok({ disambiguation: candidates.map(c => c.name) })
        return ok({ note: `No client matching "${args.clientName}".` })
      }
      const c = compute(match)
      const sharePct = totalRev > 0 ? round1((match.revenueCents / totalRev) * 100) : 0
      return ok({ period: args.period, ...c, sharePct })
    }

    const computed = rows.map(compute)
    const byRevDesc = [...rows].sort((a, b) => b.revenueCents - a.revenueCents)
    const shareOfTop = (n: number) =>
      totalRev > 0 ? round1((byRevDesc.slice(0, n).reduce((s, r) => s + r.revenueCents, 0) / totalRev) * 100) : 0

    // Only clients with financial activity this period are ranked (all-zero clients are excluded).
    const active = computed.filter(c => c.revenue > 0 || c.laborCost > 0 || c.passthrough > 0)
    const withMargin = active.filter(c => c.deliveryMarginPct != null)
    // Loss-making clients (AGI <= 0 → margin undefined) are the WORST; order most-negative AGI first.
    const lossMaking = active.filter(c => c.deliveryMarginPct == null).sort((a, b) => a.agi - b.agi)

    const topByMargin = [...withMargin].sort((a, b) => b.deliveryMarginPct! - a.deliveryMarginPct!).slice(0, 5)
    const worstFirst = [...lossMaking, ...[...withMargin].sort((a, b) => a.deliveryMarginPct! - b.deliveryMarginPct!)]
    const bottomByMargin = worstFirst.slice(0, 5)
    const shown = new Set<string>([...topByMargin, ...bottomByMargin].map(c => c.client))

    const project = (c: Computed) => ({ client: c.client, revenue: c.revenue, agi: c.agi, marginPct: c.deliveryMarginPct })
    return ok({
      period: args.period,
      topByMargin: topByMargin.map(project),
      bottomByMargin: bottomByMargin.map(project),
      agencyConcentration: { top5Pct: shareOfTop(5), top10Pct: shareOfTop(10) },
      more: Math.max(0, active.length - shown.size),
    })
  } catch {
    return fail('Could not compute client profitability — the financial data may be unavailable.')
  }
}

export const profitabilityTool: AiTool<Args> = {
  name: 'get_client_profitability',
  description: 'Per-client profitability: Agency Gross Income (revenue minus pass-through media) and delivery margin % (AGI minus labor cost, over AGI). Name a client for a deep-dive, or omit clientName for a portfolio ranking (most/least profitable + revenue concentration). Use for "which clients make us money / is Acme profitable / who has the worst margin". Returns compact numbers only. Do NOT use for cash position (use get_finance_snapshot) or ad-spend pacing.',
  parameters: params,
  requiredPermission: 'FINANCE',
  returnsUntrusted: false,
  handler: (a, c) => getClientProfitability(a, c),
}
