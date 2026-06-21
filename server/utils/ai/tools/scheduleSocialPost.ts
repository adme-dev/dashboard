import { z } from 'zod'
import { queryRows } from '~~/server/utils/db'
import { isReadOnlyRole } from '~~/server/utils/permissions'
import type { AiTool } from '../toolRegistry'
import { ok, fail, escapeLike, type ToolContext, type ToolResult } from '../toolContext'
import { proposeAction } from '../pendingActions'
import { pickByExactName, type NamedRef } from './createTask'

const params = z.object({
  clientName: z.string(),
  content: z.string(),
  platforms: z.array(z.string()).optional(),   // e.g. ['facebook','instagram']; the publishing endpoint stores as-is
  scheduledAt: z.string().optional(),          // ISO datetime; present → status 'scheduled', absent → 'draft'
  linkUrl: z.string().optional(),
  firstComment: z.string().optional(),
})
type Args = z.infer<typeof params>

export type ScheduleSocialPostDeps = {
  /** Fuzzy client resolution against agency_clients (ILIKE, %/_ escaped). May return 0, 1, or many. */
  findClients: (name: string, ctx: ToolContext) => Promise<NamedRef[]>
  /** Persist the proposal; returns the proposal id. */
  propose: (ctx: ToolContext, payload: unknown) => Promise<string>
}

const defaultDeps: ScheduleSocialPostDeps = {
  findClients: async (name) =>
    queryRows<NamedRef>(
      `SELECT id, name FROM agency_clients
        WHERE name ILIKE $1 AND is_active = true
        ORDER BY (lower(name) = lower($2)) DESC, name
        LIMIT 6`,
      [`%${escapeLike(name)}%`, name],
    ),
  propose: (ctx, payload) => proposeAction(ctx, ctx.conversationId!, 'propose_schedule_post', payload),
}

/**
 * Option B: PROPOSE a social post (draft or scheduled) only — resolve the client name → id, check
 * write access, persist a pending row, and return the proposal for the confirmation card. This NEVER
 * creates the post; the confirm endpoint does (via the scheduleSocialPost executor) on a human click.
 * Low-risk (`confirm`) — it writes an internal draft/scheduled row, not a live platform publish.
 */
export async function proposeScheduleSocialPost(args: Args, ctx: ToolContext, deps: ScheduleSocialPostDeps = defaultDeps): Promise<ToolResult> {
  if (isReadOnlyRole(ctx.userRole)) return fail('You do not have permission to schedule posts.')
  if (!ctx.conversationId) return fail('Cannot prepare a post outside a conversation.')
  const content = args.content?.trim()
  if (!content) return fail('A post needs some content.')

  const matches = pickByExactName(await deps.findClients(args.clientName, ctx), args.clientName)
  if (matches.length === 0) return fail(`No client matching "${args.clientName}".`)
  if (matches.length > 1) return ok({ disambiguation: { field: 'clientName', options: matches } })
  const client = matches[0]!

  const resolved = {
    clientId: client.id,
    clientName: client.name,
    content,
    platforms: args.platforms ?? [],
    scheduledAt: args.scheduledAt ?? null,
    status: args.scheduledAt ? 'scheduled' : 'draft',
    linkUrl: args.linkUrl?.trim() || null,
    firstComment: args.firstComment?.trim() || null,
  }
  const proposalId = await deps.propose(ctx, resolved)
  return ok({ proposalId, resolved })
}

/** Map a stored propose_schedule_post proposal to the /api/agency/social/publishing/posts body. */
export function proposalToSocialPostBody(payload: any) {
  return {
    clientId: payload?.clientId,
    content: payload?.content,
    platforms: payload?.platforms ?? [],
    scheduledAt: payload?.scheduledAt ?? undefined,
    status: payload?.status ?? 'draft',
    linkUrl: payload?.linkUrl ?? undefined,
    firstComment: payload?.firstComment ?? undefined,
  }
}

export const scheduleSocialPostTool: AiTool<Args> = {
  name: 'propose_schedule_post',
  description: 'PROPOSE creating a social post — a draft, or scheduled when a scheduledAt (ISO datetime) is given. '
    + 'This does NOT publish or create anything — it prepares a proposal the user must confirm with a button. '
    + 'Requires a client name (resolved to one client) and post content; optionally platforms, a link, and a first comment. '
    + 'If the result has a `disambiguation`, the proposal was NOT prepared — ask the user to pick the exact client. '
    + 'Only say a post is ready when the result has a `proposalId`. Never claim the post was created or published.',
  parameters: params,
  mutates: true,
  requiredPermission: 'CREATIVE',
  handler: (a, c) => proposeScheduleSocialPost(a, c),
}
