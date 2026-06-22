import { z } from 'zod'
import { roleHasPermission } from '~~/server/utils/permissions'
import { filterToolsForUser, type AiTool } from '~~/server/utils/ai/toolRegistry'
import type { ToolContext } from '~~/server/utils/ai/toolContext'
import type { ActionExecutor } from '~~/server/utils/ai/executors/types'
import type { McpToolManifest } from './project'

// ---------------------------------------------------------------------------
// Shared confirm plumbing (used by both 2c and D4 branches)
// ---------------------------------------------------------------------------

export const MCP_CONFIRM_TOOL = 'confirm_action'
const ConfirmParams = z.object({ proposalId: z.string().min(8), ack: z.boolean().optional() })

/** MCP-facing propose tool name for a registry action (avoids double 'propose_' prefixing). */
export function mcpProposeName(action: string): string {
  return action.startsWith('propose_') ? action : `propose_${action}`
}

// ---------------------------------------------------------------------------
// Phase D4 — financial action set
// ---------------------------------------------------------------------------

/**
 * MCP Phase D4 — financial action set. Parallel branch to the 2c safe-action path; gated
 * independently by `financialEnabled`. Money-movers (budget_change, eom_generate, expense_approval)
 * require explicit ack:true AT THE MCP BOUNDARY regardless of the executor's riskTier — this is the
 * key hardening: expense_approval's executor is only 'confirm' tier but MCP must still gate on ack.
 */
export const MCP_FINANCIAL_ACTIONS = [
  'propose_budget_change',
  'propose_eom_generate',
  'propose_expense_approval',
  'propose_quote',
  'propose_expense_classify',
  'propose_budget_alert',
] as const

/** Money-movers that require ack:true at the MCP boundary (independent of executor riskTier). */
export const MCP_FINANCIAL_RICH_CONFIRM = [
  'propose_budget_change',
  'propose_eom_generate',
  'propose_expense_approval',
] as const

export function isFinancialAction(name: string): boolean {
  return (MCP_FINANCIAL_ACTIONS as readonly string[]).includes(name)
}

/** The financial tools a role may call, as MCP manifests — empty unless the financial flag is on. */
export function projectFinancialTools(registryTools: AiTool<unknown>[], role: string, enabled: boolean): McpToolManifest[] {
  if (!enabled) return []
  const allowed = filterToolsForUser(registryTools, role)
  const picks = MCP_FINANCIAL_ACTIONS
    .map(a => allowed.find(t => t.name === a))
    .filter((t): t is AiTool<unknown> => !!t && !!t.mutates)
  if (!picks.length) return []
  const proposeManifests = picks.map(t => ({
    name: mcpProposeName(t.name),
    description: `Propose (does NOT execute yet): ${t.description} Returns a proposalId — call ${MCP_CONFIRM_TOOL} to execute.`,
    inputSchema: z.toJSONSchema(t.parameters) as Record<string, unknown>
  }))
  return [
    ...proposeManifests,
    {
      name: MCP_CONFIRM_TOOL,
      description: 'Execute a previously proposed write action by its proposalId. Some actions require ack:true.',
      inputSchema: z.toJSONSchema(ConfirmParams) as Record<string, unknown>
    }
  ]
}

// ---------------------------------------------------------------------------
// Phase 2c — non-financial safe-action set
// ---------------------------------------------------------------------------

/**
 * MCP Server Phase 2c — confirm-tier WRITE tools over MCP (spec: ai-copilot-mcp-server-phase2 §5).
 *
 * Two-step, host-agnostic: `propose_<action>` runs the SAME registry propose-handler the in-app agent
 * uses (resolution included; persists an ai_pending_actions row with conversation_id NULL + source
 * 'mcp') and returns a proposalId; `confirm_action(proposalId, ack?)` atomically claims the row and
 * dispatches to the existing executor. Dormant behind MCP_WRITE_TOOLS_ENABLED.
 *
 * SAFE SET = non-financial, confirm-tier only. Financial writes (quote, budget_*, eom_generate,
 * expense_*) are EXCLUDED here — held for decision D4 — even where they are technically 'confirm' tier,
 * because they move money / affect invoicing. The exclusion is enforced at projection AND confirm.
 */
export const MCP_WRITE_SAFE_ACTIONS = [
  'create_task',
  'assign_task',
  'propose_status_change',
  'propose_brief_convert',
  'propose_opportunity',
  'log_crm_activity',
  'propose_proof_status',
  'propose_team_memory',
  'propose_knowledge_article',
  'propose_schedule_post'
] as const

function isSafeAction(name: string): boolean {
  return (MCP_WRITE_SAFE_ACTIONS as readonly string[]).includes(name)
}

/** Reverse: which registry action a propose_<name> MCP tool targets (only within the safe set). */
export function resolveProposeAction(proposeName: string): string | null {
  for (const a of MCP_WRITE_SAFE_ACTIONS) if (mcpProposeName(a) === proposeName) return a
  return null
}

/** The write tools a role may call, as MCP manifests — empty unless the group flag is on. */
export function projectWriteTools(registryTools: AiTool<unknown>[], role: string, enabled: boolean): McpToolManifest[] {
  if (!enabled) return []
  const allowed = filterToolsForUser(registryTools, role)
  const picks = MCP_WRITE_SAFE_ACTIONS
    .map(a => allowed.find(t => t.name === a))
    .filter((t): t is AiTool<unknown> => !!t && !!t.mutates)
  if (!picks.length) return []
  const proposeManifests = picks.map(t => ({
    name: mcpProposeName(t.name),
    description: `Propose (does NOT execute yet): ${t.description} Returns a proposalId — call ${MCP_CONFIRM_TOOL} to execute.`,
    inputSchema: z.toJSONSchema(t.parameters) as Record<string, unknown>
  }))
  return [
    ...proposeManifests,
    {
      name: MCP_CONFIRM_TOOL,
      description: 'Execute a previously proposed write action by its proposalId. Some actions require ack:true.',
      inputSchema: z.toJSONSchema(ConfirmParams) as Record<string, unknown>
    }
  ]
}

// ---------------------------------------------------------------------------
// Shared confirm-action dispatch
// ---------------------------------------------------------------------------

export type WriteConfirmOutcome
  = | { ok: true, data: unknown }
    | { ok: false, error: string, code: 'disabled' | 'bad_args' | 'expired' | 'forbidden' | 'not_found' | 'confirm_required' | 'handler_error' | 'cap_exceeded' }

/** The single row the atomic claim returns (UPDATE … SET status='executed' … RETURNING). */
export interface ClaimedProposal { tool_name: string, resolved_payload: unknown }

export interface ConfirmDeps {
  /** confirm_action is available when ANY confirm-tier group is on (2c writes OR 2b video gen). */
  enabled: boolean
  /** Gates the 2c safe-action dispatch specifically. Defaults to `enabled` (preserves prior behaviour). */
  writeEnabled?: boolean
  /** Gates the D4 financial dispatch independently. Off by default (parallel to writeEnabled). */
  financialEnabled?: boolean
  /** Atomic, MCP+user-scoped claim: UPDATE … WHERE id AND user_id AND status='proposed' AND source='mcp' AND not expired RETURNING tool_name, resolved_payload. Returns null if nothing claimable. */
  claim: (proposalId: string, userId: string) => Promise<ClaimedProposal | null>
  getExecutor: (toolName: string) => ActionExecutor | null
  /** Optional (2b): handle video confirm-tier tool_names; return null to fall through to the next path. */
  videoDispatch?: (row: ClaimedProposal, ctx: ToolContext) => Promise<WriteConfirmOutcome | null>
  /** Optional (2b): handle banner confirm-tier tool_names; return null to fall through to the next path. */
  bannerDispatch?: (row: ClaimedProposal, ctx: ToolContext) => Promise<WriteConfirmOutcome | null>
  /** Optional: restore a just-claimed row to 'proposed' when a PRE-execution gate rejects (ack/permission),
   *  so the proposal isn't burned and the user can retry (e.g. with ack:true). Never called after execution. */
  revertClaim?: (proposalId: string, userId: string) => Promise<void>
}

/**
 * Execute a confirmed MCP write proposal. Defense-in-depth, never throws:
 *  - flag off → disabled · bad args → bad_args · nothing claimable → expired (atomic, single-use)
 *  - 2b video/banner: own dispatch branch (returns its own outcome)
 *  - D4 financial branch: financialEnabled gate → ack gate (money-movers) → permission → dispatch
 *    Returns BEFORE the 2c path — financial actions NEVER fall through to the 2c safe-action check.
 *  - 2c safe-action path: writeEnabled gate → isSafeAction → executor checks → dispatch
 */
export async function executeWriteConfirm(args: unknown, ctx: ToolContext, deps: ConfirmDeps): Promise<WriteConfirmOutcome> {
  if (!deps.enabled) return { ok: false, error: 'Write tools are not enabled over MCP.', code: 'disabled' }

  const parsed = ConfirmParams.safeParse(args)
  if (!parsed.success) return { ok: false, error: 'Invalid arguments.', code: 'bad_args' }

  const row = await deps.claim(parsed.data.proposalId, ctx.userId)
  if (!row) return { ok: false, error: 'Proposal not found, already used, expired, or not yours.', code: 'expired' }

  // A pre-execution gate rejected AFTER we atomically claimed the row (which set it to 'executed').
  // Restore it to 'proposed' so the proposal isn't burned and the caller can retry (e.g. with ack:true).
  // Only used for gates that run BEFORE ex.execute — never after a (partial) execution.
  const rejectAndRevert = async (o: WriteConfirmOutcome): Promise<WriteConfirmOutcome> => {
    await deps.revertClaim?.(parsed.data.proposalId, ctx.userId).catch(() => {})
    return o
  }

  // 2b: video confirm-tier actions get their own dispatch (returns jobId / projectId / cap_exceeded).
  // It returns null for non-video tool_names, so the financial/2c paths below handle those.
  if (deps.videoDispatch) {
    const vo = await deps.videoDispatch(row, ctx)
    if (vo) return vo
  }

  // 2b: banner confirm-tier actions get their own dispatch (returns jobIds).
  // Returns null for non-banner tool_names, so the financial/2c paths below handle those.
  if (deps.bannerDispatch) {
    const bo = await deps.bannerDispatch(row, ctx)
    if (bo) return bo
  }

  // D4: financial branch — checked BEFORE the 2c safe-action path. A financial action must NEVER
  // fall through to the 2c path (even if writeEnabled is on); this ensures hard isolation.
  if (isFinancialAction(row.tool_name)) {
    if (!deps.financialEnabled) return { ok: false, error: 'This action is not available over MCP.', code: 'forbidden' }
    const ex = deps.getExecutor(row.tool_name)
    if (!ex) return { ok: false, error: 'No executor registered for this action.', code: 'not_found' }
    // MCP-boundary ack gate for money-movers (independent of executor riskTier).
    if ((MCP_FINANCIAL_RICH_CONFIRM as readonly string[]).includes(row.tool_name) && !parsed.data.ack) {
      return rejectAndRevert({ ok: false, error: 'This action requires explicit ack:true.', code: 'confirm_required' })
    }
    // Also honour executor-level rich_confirm (covers any executor that opted in to the tier).
    if (ex.riskTier === 'rich_confirm' && !parsed.data.ack) {
      return rejectAndRevert({ ok: false, error: 'This action requires explicit ack:true.', code: 'confirm_required' })
    }
    if (ex.requiredPermission && !roleHasPermission(ctx.userRole, ex.requiredPermission)) {
      return rejectAndRevert({ ok: false, error: 'Not permitted.', code: 'forbidden' })
    }
    try {
      const res = await ex.execute(row.resolved_payload, ctx)
      return { ok: true, data: { resultRef: res.resultRef, summary: res.summary } }
    } catch {
      return { ok: false, error: 'Execution failed.', code: 'handler_error' }
    }
  }

  // 2c: safe-action path — gated by the WRITE group specifically (a 2b-only deployment leaves it off).
  const writeEnabled = deps.writeEnabled ?? deps.enabled
  if (!writeEnabled) return { ok: false, error: 'This action is not available over MCP.', code: 'forbidden' }

  if (!isSafeAction(row.tool_name)) return { ok: false, error: 'This action is not available over MCP.', code: 'forbidden' }

  const ex = deps.getExecutor(row.tool_name)
  if (!ex) return { ok: false, error: 'No executor registered for this action.', code: 'not_found' }
  if (ex.riskTier === 'rich_confirm' && !parsed.data.ack) {
    return rejectAndRevert({ ok: false, error: 'This action requires explicit ack:true.', code: 'confirm_required' })
  }
  if (ex.requiredPermission && !roleHasPermission(ctx.userRole, ex.requiredPermission)) {
    return rejectAndRevert({ ok: false, error: 'Not permitted.', code: 'forbidden' })
  }

  try {
    const res = await ex.execute(row.resolved_payload, ctx)
    return { ok: true, data: { resultRef: res.resultRef, summary: res.summary } }
  } catch {
    return { ok: false, error: 'Execution failed.', code: 'handler_error' }
  }
}
