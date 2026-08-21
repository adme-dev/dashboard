import { fail, ok, type ToolContext, type ToolResult } from '../toolContext'
import { inspectGodModeActions, type GodModeActionFilter } from './capabilities'
import { paginateWithCursor } from './responseContract'

export type ActionLogArgs = {
  clientId?: string
  clientName?: string
  actorId?: string
  actorEmail?: string
  toolName?: string
  startDate?: string
  endDate?: string
  outcome?: 'succeeded' | 'failed' | 'ambiguous'
  cursor?: string
  limit?: number
}

export type ActionLogDeps = {
  inspect: (ctx: ToolContext, filter: GodModeActionFilter) => Promise<any[]>
}

/** Source-side cap; one extra row is fetched so truncation is declared, never silent (P-03). */
export const ACTION_LOG_FETCH_CAP = 1000

const defaultDeps: ActionLogDeps = { inspect: inspectGodModeActions }

export async function getActionLog(args: ActionLogArgs, ctx: ToolContext, deps: ActionLogDeps = defaultDeps): Promise<ToolResult> {
  try {
    const rows = (await deps.inspect(ctx, {
      clientId: args.clientId,
      clientName: args.clientName,
      actorId: args.actorId,
      actorEmail: args.actorEmail,
      toolName: args.toolName,
      since: args.startDate,
      endDate: args.endDate,
      outcome: args.outcome,
      limit: ACTION_LOG_FETCH_CAP + 1,
    })).map(row => ({ ...row, toolName: row.toolName || row.tool }))
    const truncatedAtSource = rows.length > ACTION_LOG_FETCH_CAP
    const bounded = truncatedAtSource ? rows.slice(0, ACTION_LOG_FETCH_CAP) : rows
    const page = paginateWithCursor(bounded, args.cursor, args.limit, { truncatedAtSource })
    return ok({
      immutable: true,
      source: 'god_mode_audit_events',
      actions: page.items,
      total: page.total,
      appliedLimit: args.limit ?? 20,
      nextCursor: page.nextCursor,
      more: page.more,
      truncatedAtSource: page.truncatedAtSource,
      sourceCap: ACTION_LOG_FETCH_CAP,
    })
  } catch {
    return fail('Could not load the MCP action log.')
  }
}
