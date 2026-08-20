import { randomUUID } from 'node:crypto'
import type { ToolContext } from '../toolContext'
import type { ActionExecutor, ExecutorResult } from './types'
import { fetchInternalExecution } from './internalExecutionFetch'

/**
 * Executors for the budget ALLOCATION tools. Both go through the existing audited
 * spend endpoints (each PATCH writes budget_audit_log and busts the period caches) —
 * never a direct DB write, never an ad-platform write. propose_budget_change and its
 * plan→approve→apply chain are a different number and are deliberately untouched.
 */

type SinglePayload = {
  mediaSpendId?: string
  campaignName?: string | null
  clientName?: string | null
  currentBudgetAllocated?: number | null
  proposedBudgetAllocated?: number
  rolling?: boolean | null
  commissionRate?: number | null
  note?: string | null
}

type BulkPayload = {
  allocations?: Array<{ mediaSpendId: string, proposedBudgetAllocated: number, campaignName?: string | null }>
  rowCount?: number
  totalProposedBudget?: number
  rolling?: boolean | null
  commissionRate?: number | null
  note?: string | null
}

export type SpendPatchPoster = (path: string, body: Record<string, unknown>, ctx: ToolContext) => Promise<unknown>

const defaultPoster: SpendPatchPoster = (path, body, ctx) =>
  fetchInternalExecution(path, { method: 'PATCH', body }, ctx)

export function makeSetCampaignBudgetExecutor(patch: SpendPatchPoster = defaultPoster): ActionExecutor {
  return {
    toolName: 'propose_set_campaign_budget',
    label: 'campaign budget allocation',
    riskTier: 'confirm',
    requiredPermission: 'MEDIA_BUYING',
    executionClass: 'internal-http',
    async execute(payload: SinglePayload, ctx: ToolContext): Promise<ExecutorResult> {
      if (!payload?.mediaSpendId || typeof payload.proposedBudgetAllocated !== 'number') {
        throw new Error('Budget allocation proposal payload is incomplete.')
      }
      await patch(`/api/agency/social/spend/${payload.mediaSpendId}`, {
        budgetAllocated: payload.proposedBudgetAllocated,
        ...(payload.rolling != null ? { rolling: payload.rolling } : {}),
        ...(payload.commissionRate != null ? { commissionRate: payload.commissionRate } : {}),
        note: payload.note || `MCP budget allocation (proposal-confirmed)`,
      }, ctx)
      const fromText = payload.currentBudgetAllocated != null ? `$${payload.currentBudgetAllocated}` : 'unset'
      return {
        resultRef: payload.mediaSpendId,
        summary: `✅ Set the monthly allocated budget for ${payload.campaignName ?? 'the campaign'}`
          + `${payload.clientName ? ` (${payload.clientName})` : ''}: ${fromText} → $${payload.proposedBudgetAllocated}. `
          + `Pacing will classify this campaign on the next read. Nothing changed on the ad platform.`,
      }
    },
  }
}

export function makeBulkSetCampaignBudgetsExecutor(patch: SpendPatchPoster = defaultPoster): ActionExecutor {
  return {
    toolName: 'propose_bulk_set_campaign_budgets',
    label: 'bulk campaign budget allocation',
    riskTier: 'rich_confirm',
    requiredPermission: 'MEDIA_BUYING',
    executionClass: 'internal-http',
    async execute(payload: BulkPayload, ctx: ToolContext): Promise<ExecutorResult> {
      const allocations = Array.isArray(payload?.allocations) ? payload.allocations : []
      if (allocations.length === 0) throw new Error('Bulk budget allocation proposal payload is incomplete.')
      // The battle-tested bulk endpoint takes one amount per call, so group by distinct
      // amount and issue one call per group — every audit row shares this correlation id
      // (in the note) so the batch can be reviewed or reversed as a unit.
      const correlationId = randomUUID()
      const byAmount = new Map<number, string[]>()
      for (const allocation of allocations) {
        const ids = byAmount.get(allocation.proposedBudgetAllocated) ?? []
        ids.push(allocation.mediaSpendId)
        byAmount.set(allocation.proposedBudgetAllocated, ids)
      }
      const note = `${payload.note || 'MCP bulk budget allocation'} [batch:${correlationId}]`
      for (const [budgetAllocated, spendIds] of byAmount) {
        await patch('/api/agency/social/spend/bulk-budget', {
          spendIds,
          budgetAllocated,
          allocationMode: 'per_record',
          ...(payload.rolling != null ? { rolling: payload.rolling } : {}),
          ...(payload.commissionRate != null ? { commissionRate: payload.commissionRate } : {}),
          note,
        }, ctx)
      }
      return {
        resultRef: correlationId,
        summary: `✅ Applied ${allocations.length} monthly budget allocations`
          + ` (total $${payload.totalProposedBudget ?? allocations.reduce((s, a) => s + a.proposedBudgetAllocated, 0)})`
          + ` across ${byAmount.size} amount group${byAmount.size === 1 ? '' : 's'}. Audit batch ${correlationId}. `
          + `Nothing changed on the ad platform.`,
      }
    },
  }
}

export const setCampaignBudgetExecutor: ActionExecutor = makeSetCampaignBudgetExecutor()
export const bulkSetCampaignBudgetsExecutor: ActionExecutor = makeBulkSetCampaignBudgetsExecutor()
