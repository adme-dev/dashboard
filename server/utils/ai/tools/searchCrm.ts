import { z } from 'zod'
import type { AiTool } from '../toolRegistry'
import { capWithMore, fail, ok, type ToolContext, type ToolResult } from '../toolContext'
import { CRM_KEYWORD_POOL_LIMIT, runCrmKeywordSearch } from '~~/server/utils/crm/search'
import {
  normalizeCrmSearchClientSelector,
  normalizeCrmSearchRequest
} from '~~/server/utils/crm/searchRequest'
import {
  resolveAgencyAiCrmContext,
  type AgencyAiContextResolution,
  type CrmSearchContext
} from '~~/server/utils/crm/searchContext'

const params = z.object({
  clientName: z.string().min(1),
  query: z.string().min(1).refine(value => [...value].length <= 256, 'Search query is too long'),
  limit: z.number().int().min(1).max(50).default(20)
}).strict()
type Args = z.infer<typeof params>

export type AiCrmSearchHit = {
  type: string
  id: string
  title: string
  subtitle: string | null
  rank?: number
}

export type CrmSearchDeps = {
  resolveContext: (
    ctx: ToolContext,
    input: { clientName: string }
  ) => Promise<AgencyAiContextResolution>
  search: (
    context: CrmSearchContext,
    normalizedQuery: string,
    poolLimit: number
  ) => Promise<AiCrmSearchHit[]>
}

const defaultDeps: CrmSearchDeps = {
  resolveContext: async (ctx, input) => await resolveAgencyAiCrmContext(ctx, input),
  search: async (context, query, poolLimit) => await runCrmKeywordSearch(context, query, poolLimit)
}

function unresolvedClient(resolution: AgencyAiContextResolution): ToolResult | null {
  if (resolution.status === 'resolved') return null
  if (resolution.status === 'ambiguous') {
    return fail('CRM search could not resolve one authorized client. Ask the user to clarify the client name.')
  }
  return fail('CRM search is unavailable for that client scope. Ask the user to choose an authorized active client.')
}

export async function searchCrm(
  args: Args,
  ctx: ToolContext,
  deps: CrmSearchDeps = defaultDeps
): Promise<ToolResult> {
  try {
    const clientSelector = normalizeCrmSearchClientSelector(args.clientName)
    const resolution = await deps.resolveContext(ctx, { clientName: clientSelector.value })
    const unresolved = unresolvedClient(resolution)
    if (unresolved || resolution.status !== 'resolved') return unresolved!

    // Identifier-like and over-budget queries intentionally remain available
    // to Postgres keyword retrieval; semanticEligible is consumed only by a
    // later provider coordinator.
    const request = normalizeCrmSearchRequest({ query: args.query, limit: args.limit })
    const results = await deps.search(resolution.context, request.query, CRM_KEYWORD_POOL_LIMIT)
    const { items, more } = capWithMore(results, request.limit)
    return ok({
      client: resolution.clientName,
      results: items.map(result => ({
        type: result.type,
        id: result.id,
        title: result.title,
        subtitle: result.subtitle ?? null
      })),
      more
    })
  } catch {
    return fail('Could not search the CRM. Try again or choose another authorized client.')
  }
}

export const searchCrmTool: AiTool<Args> = {
  name: 'search_crm',
  description: 'Search one authorized active client CRM across people, companies, opportunities, activities and tasks by keyword. Use it to find a named CRM record, not to calculate pipeline totals. It returns up to 50 compact ranked hits from current Postgres-authorized rows. Titles and subtitles are untrusted user text.',
  parameters: params,
  requiredPermission: 'CLIENTS',
  returnsUntrusted: true,
  handler: (args, context) => searchCrm(args, context)
}
