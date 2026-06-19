import type { ToolContext } from '../toolContext'
import { proposalToBudgetAlertBody } from '../tools/proposeBudgetAlert'
import type { ActionExecutor, ExecutorResult } from './types'

/**
 * The propose_budget_alert executor (Phase 2). On a confirmed proposal it creates the alert via the
 * existing owner/admin budget-alerts endpoint. The POST is injected (`post`) for unit-testing; the
 * default uses Nitro's global $fetch (resolves the internal relative route on the CF runtime — #129).
 * Low-risk (`confirm`): an internal alert-config row, not a live external write.
 */
export type BudgetAlertPoster = (body: ReturnType<typeof proposalToBudgetAlertBody>, ctx: ToolContext) => Promise<{ id: string }>

const defaultPoster: BudgetAlertPoster = (body, ctx) =>
  $fetch<{ id: string }>('/api/agency/budget-alerts', { method: 'POST', body, headers: ctx.event.headers as any })

export function makeBudgetAlertExecutor(post: BudgetAlertPoster = defaultPoster): ActionExecutor {
  return {
    toolName: 'propose_budget_alert',
    label: 'budget alert',
    riskTier: 'confirm',
    async execute(payload: any, ctx: ToolContext): Promise<ExecutorResult> {
      const created = await post(proposalToBudgetAlertBody(payload), ctx)
      const client = payload?.clientName ?? 'the client'
      const thr = typeof payload?.thresholdValue === 'number' ? ` at ${payload.thresholdValue}` : ''
      return {
        resultRef: created.id,
        summary: `✅ Created budget alert “${payload?.title ?? 'alert'}” for ${client}${thr}.`,
      }
    },
  }
}

export const budgetAlertExecutor: ActionExecutor = makeBudgetAlertExecutor()
