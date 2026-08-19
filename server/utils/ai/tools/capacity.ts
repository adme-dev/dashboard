import { z } from 'zod'
import type { AiTool } from '../toolRegistry'
import { ok, fail, type ToolContext, type ToolResult } from '../toolContext'
import { aiInternalFetch } from '../internalFetch'
import { buildDataHealth, paginateWithCursor } from './responseContract'

const params = z.object({
  status: z.enum(['overallocated', 'underutilized', 'all']).default('all'),
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(50).default(25),
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
    const page = paginateWithCursor(filtered, args.cursor, args.limit)
    const evidence = {
      bookedHours: Number(r?.summary?.totalBooked ?? 0),
      loggedHours: Number(r?.summary?.totalLogged ?? 0),
      projectsWithAllocations: Array.isArray(r?.projectAllocations) ? r.projectAllocations.length : 0,
    }
    const withData = members.filter(m => Number(m?.bookedHours ?? 0) > 0 || Number(m?.loggedHours ?? 0) > 0).length
    const health = buildDataHealth({
      configured: evidence.bookedHours > 0 || evidence.loggedHours > 0 || withData > 0,
      expected: members.length,
      withData,
    })
    return ok({
      period: r?.period ?? null,
      ...health,
      configurationEvidence: evidence,
      summary: r?.summary ?? {},
      teamMembers: page.items,
      total: page.total,
      appliedLimit: args.limit ?? 25,
      nextCursor: page.nextCursor,
      more: page.more,
    })
  } catch {
    return fail('Could not load team capacity right now.')
  }
}

export const capacityTool: AiTool<Args> = {
  name: 'get_capacity',
  description: 'Team capacity/workload for the current period — per-person booked vs available hours, allocation %, '
    + 'and a status (overallocated / fully_booked / available / underutilized), plus a team summary. '
    + 'Use for "who has capacity", "who is overallocated", "can we take on more work". Optionally filter by status. '
    + 'Returns explicit configuration evidence so an all-zero unconfigured source is never presented as a genuinely idle team. Supports cursor pagination.',
  parameters: params,
  handler: (a, c) => getCapacity(a, c),
}
