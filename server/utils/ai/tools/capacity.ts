import { z } from 'zod'
import type { AiTool } from '../toolRegistry'
import { ok, fail, capWithMore, type ToolContext, type ToolResult } from '../toolContext'
import { aiInternalFetch } from '../internalFetch'

const params = z.object({
  status: z.enum(['overallocated', 'underutilized', 'all']).default('all'),
})
type Args = z.infer<typeof params>

export type CapacityDeps = {
  fetch: (ctx: ToolContext) => Promise<any>
}

const defaultDeps: CapacityDeps = {
  fetch: (ctx) => aiInternalFetch('/api/agency/capacity', {}, ctx),
}

/**
 * Team capacity/workload for the current period (the Capacity dashboard's source). Read-only — surfaces
 * who's overallocated vs has room, for assignment decisions. Reuses the existing /api/agency/capacity.
 */
export async function getCapacity(args: Args, ctx: ToolContext, deps: CapacityDeps = defaultDeps): Promise<ToolResult> {
  try {
    const r = await deps.fetch(ctx)
    const members: any[] = Array.isArray(r?.teamMembers) ? r.teamMembers : []
    const filtered = members.filter((m) => {
      if (args.status === 'overallocated') return m?.status === 'overallocated'
      if (args.status === 'underutilized') return m?.status === 'underutilized'
      return true
    }).map(m => ({
      name: m?.name, role: m?.role,
      bookedHours: m?.bookedHours, availableHours: m?.availableHours,
      allocationPercent: m?.allocationPercent, status: m?.status,
    }))
    const { items, more } = capWithMore(filtered, 25)
    return ok({ summary: r?.summary ?? {}, teamMembers: items, more })
  } catch {
    return fail('Could not load team capacity right now.')
  }
}

export const capacityTool: AiTool<Args> = {
  name: 'get_capacity',
  description: 'Team capacity/workload for the current period — per-person booked vs available hours, allocation %, '
    + 'and a status (overallocated / fully_booked / available / underutilized), plus a team summary. '
    + 'Use for "who has capacity", "who is overallocated", "can we take on more work". Optionally filter by status. '
    + 'Read-only; capped at 25 members with a `more` count.',
  parameters: params,
  handler: (a, c) => getCapacity(a, c),
}
