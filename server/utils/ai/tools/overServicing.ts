import { z } from 'zod'
import type { H3Event } from 'h3'
import type { AiTool } from '../toolRegistry'
import { ok, fail, type ToolContext, type ToolResult } from '../toolContext'
import {
  fetchClientEconomics, fetchRetainerCaps, fetchClientProjectLabor, resolveByName,
  type ClientEconomicsRow, type RetainerRow, type ProjectLaborRow, type Period,
} from './economics'

const params = z.object({
  clientName: z.string().optional(),
  thresholdPct: z.number().min(1).max(500).default(100),
})
type Args = z.infer<typeof params>

export type OverServicingDeps = {
  fetchRetainers: () => Promise<RetainerRow[]>
  fetchEconomics: (event: H3Event, period: Period) => Promise<ClientEconomicsRow[]>
  fetchProjectLabor: (clientId: string, period: Period) => Promise<ProjectLaborRow[]>
}
const defaultDeps: OverServicingDeps = {
  fetchRetainers: fetchRetainerCaps,
  fetchEconomics: fetchClientEconomics,
  fetchProjectLabor: fetchClientProjectLabor,
}

const round = (n: number) => Math.round(n * 100) / 100

export async function flagOverServicing(rawArgs: Args, ctx: ToolContext, deps: OverServicingDeps = defaultDeps): Promise<ToolResult> {
  try {
    const args = params.parse(rawArgs)
    const [retainers, econ] = await Promise.all([deps.fetchRetainers(), deps.fetchEconomics(ctx.event, 'mtd')])
    if (retainers.length === 0) return ok({ note: 'No clients with a scope baseline (retainer cap) on record.' })

    const deliveredByClient = new Map(econ.map(e => [e.clientId, e.laborCents / 100]))
    const computed = retainers.map((r) => {
      const delivered = deliveredByClient.get(r.clientId) ?? 0
      const utilizationPct = r.capDollars > 0 ? (delivered / r.capDollars) * 100 : 0
      return {
        clientId: r.clientId,
        client: r.name,
        scopeValue: r.capDollars,
        deliveredValue: round(delivered),
        utilizationPct: round(utilizationPct),
        overByPct: round(utilizationPct - 100),
        overByAmount: round(delivered - r.capDollars),
      }
    })

    if (args.clientName) {
      const { match, candidates } = resolveByName(retainers, args.clientName)
      if (!match) {
        if (candidates.length > 1) return ok({ disambiguation: candidates.map(c => c.name) })
        return ok({ note: `No scope baseline on record for "${args.clientName}".` })
      }
      const c = computed.find(x => x.clientId === match.clientId)!
      const topProjects = await deps.fetchProjectLabor(match.clientId, 'mtd')
      const { clientId, ...rest } = c
      return ok({ ...rest, topProjects: topProjects.slice(0, 5) })
    }

    const flagged = computed
      .filter(c => c.utilizationPct >= args.thresholdPct)
      .sort((a, b) => b.overByPct - a.overByPct)
    return ok({
      threshold: args.thresholdPct,
      flagged: flagged.slice(0, 10).map(({ client, overByPct, deliveredValue, scopeValue }) => ({ client, overByPct, deliveredValue, scopeValue })),
      more: Math.max(0, flagged.length - 10),
    })
  } catch {
    return fail('Could not assess over-servicing — time-tracking or retainer data may be unavailable.')
  }
}

export const overServicingTool: AiTool<Args> = {
  name: 'flag_over_servicing',
  description: 'Where the agency is delivering more labor than a client\'s retainer covers: labor value logged this month vs the retainer cap (the scope baseline). Name a client for a deep-dive (scope vs delivered + top projects), or omit clientName for the over-serviced watchlist (thresholdPct defaults to 100% of scope). Use for "where are we over-servicing / is Globex over scope". Returns compact numbers only.',
  parameters: params,
  requiredPermission: 'FINANCE',
  returnsUntrusted: false,
  handler: (a, c) => flagOverServicing(a, c),
}
