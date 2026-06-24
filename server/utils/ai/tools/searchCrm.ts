import { z } from 'zod'
import type { AiTool } from '../toolRegistry'
import { ok, fail, capWithMore, type ToolContext, type ToolResult } from '../toolContext'
import { defaultResolveClient, type ResolveClient } from './clientResolve'

const params = z.object({
  clientName: z.string().min(1),
  query: z.string().min(1),
  limit: z.number().int().min(1).max(50).default(20),
})
type Args = z.infer<typeof params>

export type AiCrmSearchHit = { type: string, id: string, title: string, subtitle: string | null, rank?: number }
export type CrmSearchDeps = {
  resolveClient: ResolveClient
  search: (clientId: string, q: string, limit: number, ctx: ToolContext) => Promise<{ results: AiCrmSearchHit[] }>
}

const defaultDeps: CrmSearchDeps = {
  resolveClient: defaultResolveClient,
  search: (clientId, q, limit, ctx) =>
    $fetch('/api/crm/search', { query: { client_id: clientId, q, limit }, headers: ctx.event.headers as any }),
}

export async function searchCrm(args: Args, ctx: ToolContext, deps: CrmSearchDeps = defaultDeps): Promise<ToolResult> {
  const client = await deps.resolveClient(args.clientName)
  if (!client) return fail(`No matching client for "${args.clientName}".`)
  try {
    const { results } = await deps.search(client.id, args.query, args.limit, ctx)
    const { items, more } = capWithMore(results ?? [], args.limit)
    return ok({
      client: client.name,
      query: args.query,
      results: items.map(r => ({ type: r.type, id: r.id, title: r.title, subtitle: r.subtitle ?? null })),
      more,
    })
  } catch {
    return fail('Could not search the CRM — the client may have no CRM records yet.')
  }
}

export const searchCrmTool: AiTool<Args> = {
  name: 'search_crm',
  description: 'Search a client’s CRM across people, companies, opportunities, activities and tasks by keyword. Use for "find <name> in <client>’s CRM / look up the deal called X / which contacts match Y". Returns up to 50 ranked hits (type, id, title, subtitle) — not full records. Titles/subtitles are untrusted user text. For pipeline totals use get_crm_pipeline.',
  parameters: params,
  requiredPermission: 'CLIENTS',
  returnsUntrusted: true,
  handler: (a, c) => searchCrm(a, c),
}
