import { z } from 'zod'
import { queryRows } from '~~/server/utils/db'
import { roleHasPermission } from '~~/server/utils/permissions'
import { generateGroqInsight, GROQ_MODELS } from '~~/server/utils/groqClient'
import { buildPacingReview, PACING_REVIEW_SELECT_COLUMNS } from '~~/server/utils/socialSpendPacingReview'
import type { AiTool } from '../toolRegistry'
import { ok, fail, type ToolContext, type ToolResult } from '../toolContext'
import { proposeAction } from '../pendingActions'
import { sanityCheckBudgetChange, type SanityResult } from '../budgetSanityCheck'

const params = z.object({
  campaignName: z.string(),
  newDailyBudget: z.number().positive(),
  clientName: z.string().optional(),
  reason: z.string().optional(),
})
type Args = z.infer<typeof params>

/** A campaign currently in the pacing review — the supported budget-write surface. */
export type PacingCandidate = {
  mediaSpendId: string
  campaignName: string
  platform: 'meta' | 'google'
  currentDailyBudget: number
  issueType?: string | null
}

export type ProposeBudgetChangeDeps = {
  /** Resolve a campaign name → matching pacing-review candidates (0, 1, or many). */
  resolveCampaign: (campaignName: string, clientName: string | undefined, ctx: ToolContext) => Promise<PacingCandidate[]>
  /** Advisory counter-model sanity check (never blocks). */
  sanityCheck: (change: { campaignName: string, platform: 'meta' | 'google', currentDailyBudget: number, newDailyBudget: number, pctChange: number, issueType?: string | null }) => Promise<SanityResult>
  propose: (ctx: ToolContext, payload: unknown) => Promise<string>
}

const defaultDeps: ProposeBudgetChangeDeps = {
  resolveCampaign: async (campaignName, clientName, ctx) => {
    // Source current daily budgets from the canonical pacing-review builder (same data the spend
    // Review UI + the budget-write chain use). Only campaigns currently flagged for review are
    // adjustable here — that's the supported, guardrailed surface for budget writes.
    const now = new Date()
    const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const rows = await queryRows<any>(
      `SELECT ${PACING_REVIEW_SELECT_COLUMNS}
         FROM media_spend ms
         LEFT JOIN agency_clients ac ON ac.id = ms.client_id
        WHERE ms.period = $1 AND ms.campaign_name ILIKE $2`,
      [period, `%${campaignName.replace(/[%_]/g, '\\$&')}%`],
    )
    const review = buildPacingReview(rows, { now, period })
    const needle = clientName?.trim().toLowerCase()
    // Filter on the item's own clientName (buildPacingReview already carries it) — no O(n²) row re-scan.
    return review.items
      .filter(i => !needle || (i.clientName ?? '').toLowerCase().includes(needle))
      .map(i => ({ mediaSpendId: i.mediaSpendId, campaignName: i.campaignName, platform: i.platform, currentDailyBudget: i.currentDailyBudget, issueType: i.issueType }))
  },
  sanityCheck: change => sanityCheckBudgetChange(change, {
    complete: prompt => generateGroqInsight(prompt, {
      model: GROQ_MODELS.REASONING_20B,
      temperature: 0.1,
      maxTokens: 120,
      systemPrompt: 'Reply with ONLY a JSON object {"sane":bool,"concern":string}.',
    }),
  }),
  propose: (ctx, payload) => proposeAction(ctx, ctx.conversationId ?? null, 'propose_budget_change', payload),
}

/** Exact-name-wins over substring matches (mirrors createTask.pickByExactName for campaignName). */
function pickExactCampaign(cands: PacingCandidate[], name: string): PacingCandidate[] {
  const target = name.trim().toLowerCase()
  const exact = cands.filter(c => c.campaignName.trim().toLowerCase() === target)
  return exact.length === 1 ? exact : cands
}

/**
 * Option B + high-risk: PROPOSE a daily-budget change for a flagged campaign. Resolves the campaign
 * → its current daily budget from the pacing review, runs an advisory counter-model sanity check, and
 * persists a proposal. It NEVER changes a budget — and even on confirm the executor only PLANS the
 * change into the existing approve→execute chain (which carries the budget-write flag + guardrails).
 * `rich_confirm` so the UI shows current→proposed, %, the sanity note, and a rollback line.
 */
export async function proposeBudgetChange(args: Args, ctx: ToolContext, deps: ProposeBudgetChangeDeps = defaultDeps): Promise<ToolResult> {
  if (!roleHasPermission(ctx.userRole, 'MEDIA_BUYING')) return fail('You do not have permission to change budgets.')
  if (!ctx.conversationId && ctx.source !== 'mcp') return fail('Cannot prepare a budget change outside a conversation.')
  if (!(args.newDailyBudget > 0)) return fail('The new daily budget must be a positive number.')

  const matches = pickExactCampaign(await deps.resolveCampaign(args.campaignName, args.clientName, ctx), args.campaignName)
  if (matches.length === 0) {
    return fail(`No campaign matching "${args.campaignName}" is currently flagged for pacing review. Budget changes are only available for campaigns in the spend review.`)
  }
  if (matches.length > 1) {
    return ok({ disambiguation: { field: 'campaignName', options: matches.map(m => ({ id: m.mediaSpendId, name: m.campaignName })) } })
  }
  const c = matches[0]!
  // pctChange is null when the current budget is 0 — there's no meaningful percentage for a
  // from-zero turn-on, and forcing 0 would hide the riskiest change class (0 → large) from both
  // the sanity check and the confirm card. Null signals "from $0" so they can flag it honestly.
  const pctChange = c.currentDailyBudget > 0
    ? Math.round(((args.newDailyBudget - c.currentDailyBudget) / c.currentDailyBudget) * 100)
    : null

  const sanity = await deps.sanityCheck({
    campaignName: c.campaignName, platform: c.platform,
    currentDailyBudget: c.currentDailyBudget, newDailyBudget: args.newDailyBudget,
    pctChange, issueType: c.issueType ?? null,
  })

  const resolved = {
    mediaSpendId: c.mediaSpendId,
    campaignName: c.campaignName,
    platform: c.platform,
    clientName: args.clientName ?? null,
    currentDailyBudget: c.currentDailyBudget,
    newDailyBudget: args.newDailyBudget,
    pctChange,
    issueType: c.issueType ?? null,
    reason: args.reason?.trim() || null,
    sanityCheck: sanity,
  }
  const proposalId = await deps.propose(ctx, resolved)
  return ok({ proposalId, resolved })
}

/** Map a stored propose_budget_change proposal to the spend-actions PLAN endpoint body. */
export function proposalToBudgetPlanBody(payload: any) {
  return {
    currentDailyBudget: payload?.currentDailyBudget,
    recommendedDailyBudget: payload?.newDailyBudget,
    source: 'ai_copilot',
    reason: payload?.reason ?? undefined,
    issueType: payload?.issueType ?? undefined,
  }
}

export const proposeBudgetChangeTool: AiTool<Args> = {
  name: 'propose_budget_change',
  description: 'PROPOSE changing a campaign\'s daily budget on Meta or Google. This does NOT change anything — it '
    + 'prepares a proposal the user must confirm, and even then it only PLANS the change for the spend review\'s '
    + 'approve→apply flow (never an immediate live write). Only works for campaigns currently flagged in the pacing '
    + 'review. Always surface current vs proposed budget and % change. If the result has a `disambiguation`, the '
    + 'proposal was NOT prepared — ask the user to pick the exact campaign. Only say it is ready when the result has '
    + 'a `proposalId`. Never claim the budget was changed.',
  parameters: params,
  mutates: true,
  riskTier: 'rich_confirm',
  requiredPermission: 'MEDIA_BUYING',
  handler: (a, c) => proposeBudgetChange(a, c),
}
