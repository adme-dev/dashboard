import { z } from 'zod'
import { queryRows } from '~~/server/utils/db'
import { roleHasPermission } from '~~/server/utils/permissions'
import type { AiTool } from '../toolRegistry'
import { ok, fail, escapeLike, type ToolContext, type ToolResult } from '../toolContext'
import { proposeAction } from '../pendingActions'
import { pickByExactName, type NamedRef } from './createTask'

const ALERT_TYPES = ['budget_threshold', 'burn_rate', 'projected_overrun', 'time_exceeded', 'expense_exceeded'] as const
const SEVERITIES = ['info', 'warning', 'critical', 'danger'] as const

const params = z.object({
  clientName: z.string(),
  title: z.string(),
  alertType: z.enum(ALERT_TYPES).default('budget_threshold'),
  severity: z.enum(SEVERITIES).default('warning'),
  message: z.string().optional(),
  thresholdValue: z.number().optional(),   // e.g. 90 (% consumed) for a budget_threshold alert
})
type Args = z.infer<typeof params>

export type BudgetAlertDeps = {
  findClients: (name: string, ctx: ToolContext) => Promise<NamedRef[]>
  propose: (ctx: ToolContext, payload: unknown) => Promise<string>
}

const defaultDeps: BudgetAlertDeps = {
  findClients: async (name) =>
    queryRows<NamedRef>(
      `SELECT id, name FROM agency_clients
        WHERE name ILIKE $1 AND is_active = true
        ORDER BY (lower(name) = lower($2)) DESC, name
        LIMIT 6`,
      [`%${escapeLike(name)}%`, name],
    ),
  propose: (ctx, payload) => proposeAction(ctx, ctx.conversationId ?? null, 'propose_budget_alert', payload),
}

/**
 * Option B: PROPOSE a budget alert only — resolve the client, check write access, persist a pending
 * row. NEVER creates the alert; the confirm endpoint does (via the budgetAlert executor) on a human
 * click. ADMIN-gated to match the owner/admin-only `POST /api/agency/budget-alerts` endpoint (so a
 * proposal can always be confirmed by the proposer — no propose-then-403). Low-risk (`confirm`).
 */
export async function proposeBudgetAlert(args: Args, ctx: ToolContext, deps: BudgetAlertDeps = defaultDeps): Promise<ToolResult> {
  // The endpoint is requireRole(['owner','admin']); mirror it here so we never prepare a proposal the
  // proposer can't confirm. (Belt-and-suspenders: the registry already filters by requiredPermission.)
  if (!roleHasPermission(ctx.userRole, 'ADMIN')) return fail('You do not have permission to create budget alerts.')
  if (!ctx.conversationId && ctx.source !== 'mcp') return fail('Cannot prepare a budget alert outside a conversation.')
  const title = args.title?.trim()
  if (!title) return fail('A budget alert needs a title.')

  const matches = pickByExactName(await deps.findClients(args.clientName, ctx), args.clientName)
  if (matches.length === 0) return fail(`No client matching "${args.clientName}".`)
  if (matches.length > 1) return ok({ disambiguation: { field: 'clientName', options: matches } })
  const client = matches[0]!

  const resolved = {
    clientId: client.id,
    clientName: client.name,
    alertType: args.alertType ?? 'budget_threshold',
    severity: args.severity ?? 'warning',
    title,
    message: args.message?.trim() || null,
    thresholdValue: typeof args.thresholdValue === 'number' ? args.thresholdValue : null,
  }
  const proposalId = await deps.propose(ctx, resolved)
  return ok({ proposalId, resolved })
}

/** Map a stored propose_budget_alert proposal to the /api/agency/budget-alerts body. */
export function proposalToBudgetAlertBody(payload: any) {
  return {
    alertType: payload?.alertType ?? 'budget_threshold',
    severity: payload?.severity ?? 'warning',
    title: payload?.title,
    message: payload?.message ?? undefined,
    clientId: payload?.clientId,
    thresholdValue: payload?.thresholdValue ?? undefined,
  }
}

export const budgetAlertTool: AiTool<Args> = {
  name: 'propose_budget_alert',
  description: 'PROPOSE creating a budget alert for a client (e.g. notify when spend crosses a threshold). '
    + 'This does NOT create anything — it prepares a proposal the user must confirm with a button. '
    + 'Requires a client name (resolved to one client) and a title; optionally alertType, severity, a message, '
    + 'and a thresholdValue (e.g. 90 for 90% consumed). If the result has a `disambiguation`, the proposal was '
    + 'NOT prepared — ask the user to pick the exact client. Only say it is ready when the result has a `proposalId`. '
    + 'Never claim the alert was created.',
  parameters: params,
  mutates: true,
  requiredPermission: 'ADMIN',
  handler: (a, c) => proposeBudgetAlert(a, c),
}
