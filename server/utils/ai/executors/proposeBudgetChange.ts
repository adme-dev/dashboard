import type { ToolContext } from '../toolContext'
import { proposalToBudgetPlanBody } from '../tools/proposeBudgetChange'
import type { ActionExecutor, ExecutorResult } from './types'

/**
 * The propose_budget_change executor (Phase 2, high-risk). On a confirmed proposal it PLANS the budget
 * change into the existing spend-actions chain (`POST /api/agency/social/spend/{id}/actions/plan`) — it
 * does NOT execute a live platform write. The actual write stays behind that chain's separate
 * approve→execute step and its budget-write flag + guardrails (decideExecution). This keeps the live
 * write on the battle-tested, flag-gated path and out of the AI confirm click.
 *
 * The POST is injected (`post`) for unit-testing; the default uses Nitro's global $fetch.
 * riskTier 'rich_confirm' → the confirm endpoint requires an explicit acknowledgement (the rich card).
 */
export type BudgetPlanPoster = (mediaSpendId: string, body: ReturnType<typeof proposalToBudgetPlanBody>, ctx: ToolContext) => Promise<{ action?: { id?: string }, planned?: boolean, existing?: boolean }>

const internalFetch = (<T = unknown>(
  request: string,
  options: { method: string; body?: unknown; headers?: unknown }
) => (globalThis as any).$fetch(request, options) as Promise<T>) as <T = unknown>(
  request: string,
  options: { method: string; body?: unknown; headers?: unknown }
) => Promise<T>

const defaultPoster: BudgetPlanPoster = (mediaSpendId, body, ctx) =>
  internalFetch(`/api/agency/social/spend/${mediaSpendId}/actions/plan`, { method: 'POST', body, headers: ctx.event.headers as any })

export function makeBudgetChangeExecutor(post: BudgetPlanPoster = defaultPoster): ActionExecutor {
  return {
    toolName: 'propose_budget_change',
    label: 'budget change',
    riskTier: 'rich_confirm',
    requiredPermission: 'MEDIA_BUYING',
    executionClass: 'internal-http',
    async execute(payload: any, ctx: ToolContext): Promise<ExecutorResult> {
      const r = await post(payload?.mediaSpendId, proposalToBudgetPlanBody(payload), ctx)
      const pct = typeof payload?.pctChange === 'number' ? `${payload.pctChange >= 0 ? '+' : ''}${payload.pctChange}%` : ''
      const verb = r?.existing ? 'Found an existing planned' : 'Planned a'
      return {
        resultRef: r?.action?.id ?? '',
        summary: `✅ ${verb} budget change for ${payload?.campaignName ?? 'the campaign'}: `
          + `${payload?.currentDailyBudget}→${payload?.newDailyBudget}/day${pct ? ` (${pct})` : ''}. `
          + `It will apply after approval in the spend review — nothing has changed on the platform yet.`,
      }
    },
  }
}

export const budgetChangeExecutor: ActionExecutor = makeBudgetChangeExecutor()
