import type { ToolContext } from '../toolContext'
import { proposalToBudgetAlertBody } from '../tools/proposeBudgetAlert'
import type { ActionExecutor, ExecutorResult } from './types'

/**
 * The propose_budget_alert executor (Phase 2). On a confirmed proposal it creates the alert via the
 * existing owner/admin budget-alerts endpoint. The POST is injected (`post`) for unit-testing; the
 * default uses Nitro's global $fetch (resolves the internal relative route on the CF runtime — #129).
 * Low-risk (`confirm`): an internal alert-config row, not a live external write.
 */
// The endpoint responds { success, alert: { id, ... } } — the id is nested under `alert`.
export type BudgetAlertPoster = (body: ReturnType<typeof proposalToBudgetAlertBody>, ctx: ToolContext) => Promise<{ alert?: { id?: string }, id?: string }>

const internalFetch = (<T = unknown>(
  request: string,
  options: { method: string; body?: unknown; headers?: unknown }
) => (globalThis as any).$fetch(request, options) as Promise<T>) as <T = unknown>(
  request: string,
  options: { method: string; body?: unknown; headers?: unknown }
) => Promise<T>

const defaultPoster: BudgetAlertPoster = (body, ctx) =>
  internalFetch('/api/agency/budget-alerts', { method: 'POST', body, headers: ctx.event.headers as any })

export function makeBudgetAlertExecutor(post: BudgetAlertPoster = defaultPoster): ActionExecutor {
  return {
    toolName: 'propose_budget_alert',
    label: 'budget alert',
    riskTier: 'confirm',
    requiredPermission: 'ADMIN',
    executionClass: 'internal-http',
    async execute(payload: any, ctx: ToolContext): Promise<ExecutorResult> {
      const created = await post(proposalToBudgetAlertBody(payload), ctx)
      const id = created?.alert?.id ?? created?.id
      if (!id) throw new Error('budget-alert create returned no id')
      const client = payload?.clientName ?? 'the client'
      const thr = typeof payload?.thresholdValue === 'number' ? ` at ${payload.thresholdValue}` : ''
      return {
        resultRef: id,
        summary: `✅ Created budget alert “${payload?.title ?? 'alert'}” for ${client}${thr}.`,
      }
    },
  }
}

export const budgetAlertExecutor: ActionExecutor = makeBudgetAlertExecutor()
