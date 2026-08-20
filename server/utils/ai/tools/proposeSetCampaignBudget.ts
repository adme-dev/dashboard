import { z } from 'zod'
import { queryRows } from '~~/server/utils/db'
import { roleHasPermission } from '~~/server/utils/permissions'
import { computeCampaignBudgetPacing } from '~~/server/utils/budgetPacing'
import type { AiTool } from '../toolRegistry'
import { ok, fail, type ToolContext, type ToolResult } from '../toolContext'
import { proposeAction } from '../pendingActions'

/**
 * Budget ALLOCATION tools (distinct from propose_budget_change, which plans a campaign's
 * live daily budget on the ad platform and must not be touched). These set the OTHER
 * number called "budget": media_spend.budget_allocated — the monthly client allocation
 * every pacing calculation divides by. 45 of 58 client-platform rows have none, which
 * excludes them from pacing entirely (no_budget → never flagged → no tool can act);
 * the only exit was the spend UI. These propose-only tools remove that closed loop.
 *
 * On confirm the executors call the existing audited PATCH endpoints
 * (/api/agency/social/spend/[id] and /bulk-budget) — never a direct DB write and
 * never an ad-platform write.
 */

const singleParams = z.object({
  mediaSpendId: z.string().uuid(),
  budgetAllocated: z.number().min(0),
  rolling: z.boolean().optional(),
  commissionRate: z.number().min(0).max(100).optional(),
  note: z.string().max(500).optional(),
})
type SingleArgs = z.infer<typeof singleParams>

const bulkParams = z.object({
  allocations: z.array(z.object({
    mediaSpendId: z.string().uuid(),
    budgetAllocated: z.number().min(0),
  })).min(1).max(100),
  rolling: z.boolean().optional(),
  commissionRate: z.number().min(0).max(100).optional(),
  note: z.string().max(500).optional(),
})
type BulkArgs = z.infer<typeof bulkParams>

export interface AllocationTargetRow {
  id: string
  period: string
  platform: string
  client_id: string | null
  client_name: string | null
  campaign_id: string | null
  campaign_name: string | null
  budget_allocated: string | null
  end_date: string | null
  mtd_spend: string | null
}

export type SetCampaignBudgetDeps = {
  loadTargets: (mediaSpendIds: string[]) => Promise<AllocationTargetRow[]>
  propose: (ctx: ToolContext, toolName: string, payload: unknown) => Promise<string>
}

const defaultDeps: SetCampaignBudgetDeps = {
  loadTargets: async (mediaSpendIds) => queryRows<AllocationTargetRow>(
    `SELECT ms.id::text, ms.period, ms.platform, ms.client_id::text, ac.name AS client_name,
            ms.campaign_id, ms.campaign_name, ms.budget_allocated::text, ms.end_date::text,
            (SELECT SUM(ds.spend) FROM daily_spend ds WHERE ds.media_spend_id = ms.id
              AND ds.spend_date >= date_trunc('month', now())::date)::text AS mtd_spend
       FROM media_spend ms
       LEFT JOIN agency_clients ac ON ac.id = ms.client_id
      WHERE ms.id = ANY($1::uuid[])`,
    [mediaSpendIds]
  ),
  propose: (ctx, toolName, payload) => proposeAction(ctx, ctx.conversationId ?? null, toolName, payload),
}

function shapeAllocationRow(row: AllocationTargetRow, proposedBudget: number) {
  const currentBudget = row.budget_allocated == null ? null : Number(row.budget_allocated)
  const mtdSpend = Number(row.mtd_spend ?? 0)
  // Implied pacing must come from the one existing implementation — the same one
  // get_adspend_pacing and check_pacing read — never a reimplementation here.
  const pacing = computeCampaignBudgetPacing({
    period: row.period,
    monthlyBudget: proposedBudget,
    mtdSpend,
    endDate: row.end_date,
  })
  return {
    mediaSpendId: row.id,
    clientName: row.client_name,
    campaignName: row.campaign_name,
    campaignId: row.campaign_id,
    platform: row.platform,
    period: row.period,
    currentBudgetAllocated: currentBudget != null && currentBudget > 0 ? currentBudget : null,
    proposedBudgetAllocated: proposedBudget,
    mtdSpend,
    impliedPacingStatus: pacing.pacingStatus,
  }
}

export async function proposeSetCampaignBudget(
  args: SingleArgs, ctx: ToolContext, deps: SetCampaignBudgetDeps = defaultDeps
): Promise<ToolResult> {
  if (!roleHasPermission(ctx.userRole, 'MEDIA_BUYING')) return fail('You do not have permission to set budgets.')
  if (!ctx.conversationId && ctx.source !== 'mcp') return fail('Cannot prepare a budget allocation outside a conversation.')

  const [row] = await deps.loadTargets([args.mediaSpendId])
  if (!row) return fail('No campaign spend row matches that mediaSpendId.', 'not_found')

  const shaped = shapeAllocationRow(row, args.budgetAllocated)
  const resolved = {
    kind: 'campaign_budget_allocation' as const,
    ...shaped,
    rolling: args.rolling ?? null,
    commissionRate: args.commissionRate ?? null,
    note: args.note?.trim() || null,
  }
  const proposalId = await deps.propose(ctx, 'propose_set_campaign_budget', resolved)
  return ok({ proposalId, ...resolved })
}

export async function proposeBulkSetCampaignBudgets(
  args: BulkArgs, ctx: ToolContext, deps: SetCampaignBudgetDeps = defaultDeps
): Promise<ToolResult> {
  if (!roleHasPermission(ctx.userRole, 'MEDIA_BUYING')) return fail('You do not have permission to set budgets.')
  if (!ctx.conversationId && ctx.source !== 'mcp') return fail('Cannot prepare a budget allocation outside a conversation.')

  const requestedIds = args.allocations.map(a => a.mediaSpendId)
  const duplicateIds = requestedIds.filter((id, index) => requestedIds.indexOf(id) !== index)
  if (duplicateIds.length > 0) {
    return fail('Duplicate mediaSpendIds in the allocation list.', 'bad_args', { duplicateIds: [...new Set(duplicateIds)] })
  }

  const rows = await deps.loadTargets(requestedIds)
  const found = new Map(rows.map(row => [row.id, row]))
  // All-or-nothing: any unresolvable row refuses the entire proposal, naming the offenders.
  const missingIds = requestedIds.filter(id => !found.has(id))
  if (missingIds.length > 0) {
    return fail('Some mediaSpendIds do not resolve to campaign spend rows; nothing was proposed.', 'not_found', { missingIds })
  }

  // Full, untruncated per-row table — a bulk proposal a reviewer cannot fully read is a rubber stamp.
  const allocations = args.allocations.map(a => shapeAllocationRow(found.get(a.mediaSpendId)!, a.budgetAllocated))
  const overwriting = allocations.filter(a => a.currentBudgetAllocated != null)
  const resolved = {
    kind: 'bulk_campaign_budget_allocation' as const,
    rowCount: allocations.length,
    totalProposedBudget: Math.round(allocations.reduce((sum, a) => sum + a.proposedBudgetAllocated, 0) * 100) / 100,
    rowsOverwritingExisting: overwriting.length,
    overwritingMediaSpendIds: overwriting.map(a => a.mediaSpendId),
    allocations,
    rolling: args.rolling ?? null,
    commissionRate: args.commissionRate ?? null,
    note: args.note?.trim() || null,
  }
  const proposalId = await deps.propose(ctx, 'propose_bulk_set_campaign_budgets', resolved)
  return ok({ proposalId, ...resolved })
}

export const proposeSetCampaignBudgetTool: AiTool<SingleArgs> = {
  name: 'propose_set_campaign_budget',
  description: 'PROPOSE setting a campaign\'s MONTHLY ALLOCATED budget (media_spend.budget_allocated — the pacing '
    + 'denominator), NOT its live platform daily budget (that is propose_budget_change). Returns a proposal showing '
    + 'client, campaign, current vs proposed allocation, MTD spend and the pacing status the campaign would '
    + 'immediately classify as; call confirm_action(proposalId) to apply. An existing allocation is overwritten — '
    + 'currentBudgetAllocated in the proposal shows what. Never changes anything on the ad platform.',
  parameters: singleParams,
  mutates: true,
  riskTier: 'confirm',
  requiredPermission: 'MEDIA_BUYING',
  handler: (a, c) => proposeSetCampaignBudget(a, c),
}

export const proposeBulkSetCampaignBudgetsTool: AiTool<BulkArgs> = {
  name: 'propose_bulk_set_campaign_budgets',
  description: 'PROPOSE setting MONTHLY ALLOCATED budgets (media_spend.budget_allocated) for up to 100 campaigns in '
    + 'one reviewable proposal, with per-row amounts. Returns the FULL per-row table (client, campaign, current vs '
    + 'proposed, MTD spend, implied pacing status), totals, and which rows overwrite an existing allocation. '
    + 'All-or-nothing: any unresolvable row refuses the whole proposal. Requires confirm_action with ack:true. '
    + 'Never changes anything on the ad platform.',
  parameters: bulkParams,
  mutates: true,
  riskTier: 'rich_confirm',
  requiredPermission: 'MEDIA_BUYING',
  handler: (a, c) => proposeBulkSetCampaignBudgets(a, c),
}
