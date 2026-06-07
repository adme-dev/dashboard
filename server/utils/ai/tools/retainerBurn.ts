import { z } from 'zod'
import type { H3Event } from 'h3'
import type { AiTool } from '../toolRegistry'
import { ok, fail, type ToolContext, type ToolResult } from '../toolContext'
import { fetchClientEconomics, fetchRetainerCaps, resolveByName, type ClientEconomicsRow, type RetainerRow } from './economics'

const params = z.object({
  clientName: z.string().optional(),
  period: z.enum(['mtd']).default('mtd'),
})
type Args = z.infer<typeof params>

export type RetainerBurnDeps = {
  fetchRetainers: () => Promise<RetainerRow[]>
  fetchEconomics: (event: H3Event, period: 'mtd') => Promise<ClientEconomicsRow[]>
  /** Fraction of the current month elapsed (0..1) — injected for deterministic projection. */
  elapsedFraction: () => number
}

function monthElapsedFraction(now: Date = new Date()): number {
  const y = now.getUTCFullYear(); const m = now.getUTCMonth()
  const daysInMonth = new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
  return Math.min(1, Math.max(0.01, now.getUTCDate() / daysInMonth))
}

const defaultDeps: RetainerBurnDeps = {
  fetchRetainers: fetchRetainerCaps,
  fetchEconomics: (event, period) => fetchClientEconomics(event, period),
  elapsedFraction: () => monthElapsedFraction(),
}

const round = (n: number) => Math.round(n * 100) / 100
type Pace = 'under' | 'on' | 'over'

function paceOf(burnPct: number, elapsedPct: number): Pace {
  if (burnPct >= elapsedPct + 10) return 'over'
  if (burnPct <= elapsedPct - 10) return 'under'
  return 'on'
}

export async function monitorRetainerBurn(args: Args, ctx: ToolContext, deps: RetainerBurnDeps = defaultDeps): Promise<ToolResult> {
  try {
    const [retainers, econ] = await Promise.all([deps.fetchRetainers(), deps.fetchEconomics(ctx.event, 'mtd')])
    if (retainers.length === 0) return ok({ note: 'No clients on a retainer/hybrid plan with a cap on record.' })

    const consumedByClient = new Map(econ.map(e => [e.clientId, { consumed: e.laborCents / 100, hours: e.hours }]))
    const elapsed = deps.elapsedFraction()
    const elapsedPct = round(elapsed * 100)

    const rows = retainers.map((r) => {
      const c = consumedByClient.get(r.clientId) ?? { consumed: 0, hours: 0 }
      const burnPct = r.capDollars > 0 ? round((c.consumed / r.capDollars) * 100) : 0
      return {
        client: r.name,
        retainerCap: r.capDollars,
        consumed: round(c.consumed),
        burnPct,
        pace: paceOf(burnPct, elapsedPct),
        projectedEndOfPeriod: round(c.consumed / elapsed),
        hoursLogged: round(c.hours),
      }
    })

    if (args.clientName) {
      const { match, candidates } = resolveByName(retainers, args.clientName)
      if (!match) {
        if (candidates.length > 1) return ok({ disambiguation: candidates.map(c => c.name) })
        return ok({ note: `No active retainer on record for "${args.clientName}".` })
      }
      return ok(rows.find(x => x.client === match.name))
    }

    const atRisk = rows.filter(x => x.pace === 'over').sort((a, b) => b.burnPct - a.burnPct)
    return ok({
      period: 'mtd',
      elapsedPct,
      summary: { count: rows.length, overCount: atRisk.length },
      atRisk: atRisk.slice(0, 10).map(({ client, burnPct, pace }) => ({ client, burnPct, pace })),
      more: Math.max(0, atRisk.length - 10),
    })
  } catch {
    return fail('Could not compute retainer burn — retainer or time-tracking data may be unavailable.')
  }
}

export const retainerBurnTool: AiTool<Args> = {
  name: 'monitor_retainer_burn',
  description: 'How fast clients are consuming their monthly retainer: labor logged this month vs the retainer cap, with pace (under/on/over vs how far through the month we are) and a projected end-of-month spend. Name a client for a deep-dive, or omit clientName for the over-pacing watchlist. Use for "is Acme burning its retainer too fast / which retainers are over budget". Returns compact numbers only.',
  parameters: params,
  requiredPermission: 'FINANCE',
  returnsUntrusted: false,
  handler: (a, c) => monitorRetainerBurn(a, c),
}
