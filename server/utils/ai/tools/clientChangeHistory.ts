import { z } from 'zod'
import type { AiTool } from '../toolRegistry'
import { fail, ok, type ToolContext, type ToolResult } from '../toolContext'
import { resolveMarketingReadScope, type MarketingReadScope } from '../marketing/readScope'
import { clientChangeHistoryEnabled } from '~~/server/utils/changeHistory/config'
import { readScopedClientChangeHistory, resolveScopedClientByName } from '~~/server/utils/changeHistory/access'
import {
  CHANGE_HISTORY_MAX_LIMIT,
  CHANGE_HISTORY_ORIGINS,
  ChangeHistoryInputError,
  type ClientChangeEntry,
  type ClientChangeHistoryQuery
} from '~~/server/utils/changeHistory/clientTimeline'

export const CLIENT_CHANGE_HISTORY_TOOL = 'get_client_change_history'

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
const params = z.object({
  clientId: z.string().uuid().optional(),
  clientName: z.string().trim().min(2).max(200).optional(),
  connectionId: z.string().uuid().optional(),
  startDate: isoDate.optional(),
  endDate: isoDate.optional(),
  sources: z.array(z.enum(CHANGE_HISTORY_ORIGINS)).min(1).max(CHANGE_HISTORY_ORIGINS.length).optional(),
  cursor: z.string().max(400).optional(),
  limit: z.number().int().min(1).max(CHANGE_HISTORY_MAX_LIMIT).default(25)
}).superRefine((value, issue) => {
  if (!value.clientId && !value.clientName) issue.addIssue({ code: 'custom', message: 'Provide clientId or clientName.' })
  if (value.startDate && value.endDate && value.startDate > value.endDate) issue.addIssue({ code: 'custom', message: 'startDate must be on or before endDate.' })
})
type Args = z.infer<typeof params>

export interface ClientChangeHistoryToolDeps {
  enabled: (ctx: ToolContext) => boolean
  scope: (ctx: ToolContext) => Promise<MarketingReadScope>
  resolveName: (scope: MarketingReadScope, name: string) => Promise<{ id: string, name: string } | null>
  read: typeof readScopedClientChangeHistory
}

const defaultDeps: ClientChangeHistoryToolDeps = {
  enabled: () => clientChangeHistoryEnabled(),
  scope: resolveMarketingReadScope,
  resolveName: resolveScopedClientByName,
  read: readScopedClientChangeHistory
}

/** MCP output carries actor/approver ids and display names only — never contact details. */
function forModel(entry: ClientChangeEntry) {
  return {
    id: entry.id,
    at: entry.at,
    source: entry.origin,
    channel: entry.source,
    account: entry.account,
    actor: entry.actor,
    actionFamily: entry.actionFamily,
    toolName: entry.toolName,
    risk: entry.risk,
    status: entry.status,
    rawStatus: entry.rawStatus,
    summary: entry.summary,
    before: entry.before,
    after: entry.after,
    approver: entry.approver,
    providerRequestId: entry.providerRequestId,
    triggerRef: entry.triggerRef,
    rollbackRef: entry.rollbackRef,
    resultRef: entry.resultRef,
    verification: entry.verification,
    updatedAt: entry.updatedAt
  }
}

export async function getClientChangeHistoryTool(args: Args, ctx: ToolContext, deps: ClientChangeHistoryToolDeps = defaultDeps): Promise<ToolResult> {
  if (!deps.enabled(ctx)) {
    return fail('The client change history is not enabled yet.', 'CHANGE_HISTORY_DISABLED')
  }
  try {
    const scope = await deps.scope(ctx)
    let clientId = args.clientId?.toLowerCase()
    if (!clientId && args.clientName) {
      const match = await deps.resolveName(scope, args.clientName)
      if (!match) return fail('No client you can access matched that name.', 'CLIENT_NOT_FOUND')
      clientId = match.id
    }
    const query: ClientChangeHistoryQuery = {
      clientId: clientId!,
      connectionId: args.connectionId ?? null,
      startDate: args.startDate ?? null,
      endDate: args.endDate ?? null,
      cursor: args.cursor ?? null,
      limit: args.limit,
      ...(args.sources ? { origins: args.sources } : {})
    }
    const page = await deps.read(scope, query)
    return ok({
      immutable: true,
      client: page.client,
      sources: page.origins,
      order: 'newest_first',
      entries: page.entries.map(forModel),
      appliedLimit: page.appliedLimit,
      nextCursor: page.nextCursor,
      more: page.more
    })
  } catch (error) {
    if (error instanceof ChangeHistoryInputError) return fail(error.message, 'CHANGE_HISTORY_BAD_INPUT')
    const status = (error as { statusCode?: number }).statusCode
    if (status === 404) return fail('No client you can access matched that request.', 'CLIENT_NOT_FOUND')
    if (status === 403) return fail('Your account cannot read this client\'s change history.', 'CHANGE_HISTORY_FORBIDDEN')
    if (status === 409) return fail((error as { statusMessage?: string }).statusMessage ?? 'Ambiguous client name.', 'CLIENT_AMBIGUOUS')
    return fail('Could not load the client change history.', 'CHANGE_HISTORY_FAILED')
  }
}

export const clientChangeHistoryTool: AiTool<Args> = {
  name: CLIENT_CHANGE_HISTORY_TOOL,
  description: 'Read one client\'s change history log (audit timeline): every recorded change to its ad accounts and budgets, newest first. '
    + 'Each entry says when, who asked (team member name), the channel (mcp/chat/ui/automation/migration), action family and risk, status '
    + '(proposed/approved/rejected/expired/executed/verified/failed), before/after, approver, Google request id, triggering alert/rule and rollback reference where recorded. '
    + 'Use it to answer "what changed", "who changed the budget" or "show the change log" for a client you cover; filter by connectionId (one ad account), startDate/endDate and sources, and page with cursor. '
    + 'Read-only: it never changes anything. For live campaign metrics use get_campaign_breakdown; for the God Mode MCP ledger use get_action_log.',
  parameters: params,
  requiredPermission: 'MEDIA_BUYING',
  returnsUntrusted: true,
  handler: (args, ctx) => getClientChangeHistoryTool(args, ctx)
}
