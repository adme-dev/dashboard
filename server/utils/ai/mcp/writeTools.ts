import { z } from 'zod'
import { roleHasPermission } from '~~/server/utils/permissions'
import { filterToolsForUser, type AiTool } from '~~/server/utils/ai/toolRegistry'
import type { ToolContext, ToolResult } from '~~/server/utils/ai/toolContext'
import type { ActionExecutor } from '~~/server/utils/ai/executors/types'
import type { McpExecutionDescriptor, McpProjectionContext, McpToolManifest } from './project'
import type { TrustedSupplementalExecutionServices } from '~~/server/utils/ai/godModeExecution'

// ---------------------------------------------------------------------------
// Shared confirm plumbing (used by both 2c and D4 branches)
// ---------------------------------------------------------------------------

export const MCP_CONFIRM_TOOL = 'confirm_action'
export const ConfirmParams = z.object({ proposalId: z.string().min(8), ack: z.boolean().optional() })
export const MCP_WRITE_CONFIRM_DESCRIPTION =
  'Execute a previously proposed write action by its proposalId. Some actions require ack:true.'
export const MCP_VIDEO_CONFIRM_DESCRIPTION =
  'Execute a previously proposed action by its proposalId (e.g. a video generation or project create).'
export const MCP_BANNER_CONFIRM_DESCRIPTION =
  'Execute a previously proposed banner render action by its proposalId.'

/** One canonical manifest shared by every proposal suite so duplicate registration is unambiguous. */
export function projectConfirmActionManifest(
  description = MCP_WRITE_CONFIRM_DESCRIPTION
): McpToolManifest {
  return {
    name: MCP_CONFIRM_TOOL,
    description,
    inputSchema: z.toJSONSchema(ConfirmParams) as Record<string, unknown>
  }
}

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
  'propose_set_campaign_budget',
  'propose_bulk_set_campaign_budgets',
  'propose_eom_generate',
  'propose_expense_approval',
  'propose_quote',
  'propose_expense_classify',
  'propose_budget_alert'
] as const

/** Money-movers that require ack:true at the MCP boundary (independent of executor riskTier). */
export const MCP_FINANCIAL_RICH_CONFIRM = [
  'propose_budget_change',
  'propose_bulk_set_campaign_budgets',
  'propose_eom_generate',
  'propose_expense_approval'
] as const

export function isFinancialAction(name: string): boolean {
  return (MCP_FINANCIAL_ACTIONS as readonly string[]).includes(name)
}

/** The financial tools a role may call, as MCP manifests — empty unless the financial flag is on. */
export function projectFinancialTools(
  registryTools: AiTool<unknown>[],
  role: string,
  enabled: boolean,
  options: { bypassPermissions?: boolean, confirmDescription?: string } = {}
): McpToolManifest[] {
  if (!enabled) return []
  const allowed = options.bypassPermissions ? registryTools : filterToolsForUser(registryTools, role)
  const picks = MCP_FINANCIAL_ACTIONS
    .map(a => allowed.find(t => t.name === a))
    .filter((t): t is AiTool<unknown> => !!t && !!t.mutates)
  if (!picks.length) return []
  const proposeManifests = picks.map(t => ({
    name: mcpProposeName(t.name),
    description: options.bypassPermissions
      ? t.description
      : `Propose (does NOT execute yet): ${t.description} Returns a proposalId — call ${MCP_CONFIRM_TOOL} to execute.`,
    inputSchema: z.toJSONSchema(t.parameters) as Record<string, unknown>
  }))
  return [...proposeManifests, projectConfirmActionManifest(options.confirmDescription)]
}

/**
 * Reproduce the legacy endpoint's first-emitted confirm_action description while making every active
 * registered suite emit an identical definition for deterministic deduplication.
 */
export function resolveRegisteredConfirmDescription(context: McpProjectionContext): string {
  if (context.governanceBypass) return MCP_WRITE_CONFIRM_DESCRIPTION
  const writeEmitsConfirm = projectWriteTools(
    context.tools,
    context.role,
    context.suiteFlags.writes
  ).some(tool => tool.name === MCP_CONFIRM_TOOL)
  if (writeEmitsConfirm) return MCP_WRITE_CONFIRM_DESCRIPTION
  const creativeAllowed = roleHasPermission(context.role, 'CREATIVE')
  if (creativeAllowed && context.suiteFlags.video && context.suiteFlags.videoGeneration) {
    return MCP_VIDEO_CONFIRM_DESCRIPTION
  }
  if (creativeAllowed && context.suiteFlags.banners) return MCP_BANNER_CONFIRM_DESCRIPTION
  return MCP_WRITE_CONFIRM_DESCRIPTION
}

/** Registered finance-suite adapter. */
export function projectFinancialMcpSuite(context: McpProjectionContext): McpToolManifest[] {
  return projectFinancialTools(
    context.tools,
    context.role,
    context.governanceBypass || context.suiteFlags.financial,
    {
      bypassPermissions: context.governanceBypass,
      confirmDescription: resolveRegisteredConfirmDescription(context)
    }
  )
}

/** Finance manifests are canonical base AiTools, so the catalog owns their sole resolvers. */
export function resolveFinancialMcpExecutions(): McpExecutionDescriptor[] {
  return []
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
export function projectWriteTools(
  registryTools: AiTool<unknown>[],
  role: string,
  enabled: boolean,
  options: { bypassPermissions?: boolean, confirmDescription?: string } = {}
): McpToolManifest[] {
  if (!enabled) return []
  const allowed = options.bypassPermissions ? registryTools : filterToolsForUser(registryTools, role)
  const picks = MCP_WRITE_SAFE_ACTIONS
    .map(a => allowed.find(t => t.name === a))
    .filter((t): t is AiTool<unknown> => !!t && !!t.mutates)
  if (!picks.length) return []
  const proposeManifests = picks.map(t => ({
    name: mcpProposeName(t.name),
    description: options.bypassPermissions
      ? t.description
      : `Propose (does NOT execute yet): ${t.description} Returns a proposalId — call ${MCP_CONFIRM_TOOL} to execute.`,
    inputSchema: z.toJSONSchema(t.parameters) as Record<string, unknown>
  }))
  return [...proposeManifests, projectConfirmActionManifest(options.confirmDescription)]
}

/** Registered general-write suite adapter. */
export function projectWriteMcpSuite(context: McpProjectionContext): McpToolManifest[] {
  return projectWriteTools(
    context.tools,
    context.role,
    context.governanceBypass || context.suiteFlags.writes,
    {
      bypassPermissions: context.governanceBypass,
      confirmDescription: resolveRegisteredConfirmDescription(context)
    }
  )
}

/** Alias resolvers plus the single shared confirmation dispatcher. */
export function resolveWriteMcpExecutions(context: McpProjectionContext): McpExecutionDescriptor[] {
  const aliases = MCP_WRITE_SAFE_ACTIONS
    .map(canonicalName => context.tools.find(tool => tool.name === canonicalName))
    .filter((tool): tool is AiTool<any> => !!tool && !!tool.mutates)
    .filter(tool => mcpProposeName(tool.name) !== tool.name)
    .map(tool => {
      const name = mcpProposeName(tool.name)
      return {
        name,
        canonicalName: tool.name,
        kind: 'catalog' as const,
        tool: { ...tool, name }
      }
    })
  const confirm: McpExecutionDescriptor = {
    name: MCP_CONFIRM_TOOL,
    canonicalName: MCP_CONFIRM_TOOL,
    kind: 'supplemental',
    executionClass: 'internal-http',
    executeSupplemental: async (args, ctx, services) => {
      const { executeOwnerMcpConfirm } = await import('./ownerConfirm')
      return await executeOwnerMcpConfirm(args, ctx, services)
    },
    tool: {
      name: MCP_CONFIRM_TOOL,
      description: MCP_WRITE_CONFIRM_DESCRIPTION,
      parameters: ConfirmParams,
      mutates: true,
      handler: async (args: unknown, ctx: ToolContext): Promise<ToolResult> => {
        const { executeOwnerMcpConfirm } = await import('./ownerConfirm')
        return await executeOwnerMcpConfirm(args, ctx)
      }
    }
  }
  return [...aliases, confirm]
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
  /** Return the durable result of an already-executed proposal. Proposal-level replay is independent of transport/JTI replay. */
  replay?: (proposalId: string, userId: string) => Promise<WriteConfirmOutcome | null>
  /** Persist the exact successful response before returning it to the assistant. */
  persistResult?: (proposalId: string, userId: string, data: unknown) => Promise<void>
  getExecutor: (toolName: string) => ActionExecutor | null
  /** Optional (2b): handle video confirm-tier tool_names; return null to fall through to the next path. */
  videoDispatch?: (row: ClaimedProposal, ctx: ToolContext) => Promise<WriteConfirmOutcome | null>
  /** Optional (2b): handle banner confirm-tier tool_names; return null to fall through to the next path. */
  bannerDispatch?: (row: ClaimedProposal, ctx: ToolContext) => Promise<WriteConfirmOutcome | null>
  /** Optional (feed round): handle feed confirm-tier tool_names; receives the boundary ack so the
   *  P-2 always-confirm carve-in can refuse without ack:true under ANY authority. Null falls through. */
  feedDispatch?: (row: ClaimedProposal, ctx: ToolContext, ack: boolean) => Promise<WriteConfirmOutcome | null>
  /** Optional Google Ads control-plane confirmation. Returns null for non-Google pending rows. */
  googleAdsDispatch?: (row: ClaimedProposal, ctx: ToolContext) => Promise<WriteConfirmOutcome | null>
  /** Optional: restore a just-claimed row to 'proposed' when a PRE-execution gate rejects (ack/permission),
   *  so the proposal isn't burned and the user can retry (e.g. with ack:true). Never called after execution. */
  revertClaim?: (proposalId: string, userId: string) => Promise<void>
  execution?: TrustedSupplementalExecutionServices
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
  if (!row) {
    const replay = await deps.replay?.(parsed.data.proposalId, ctx.userId).catch(() => null)
    if (replay?.ok) {
      // Replaying the recorded outcome of an already-confirmed proposal. The original dispatch
      // (or its recorded failure) already happened; satisfy the god-mode dispatch checkpoint so
      // the wrapper doesn't discard this as dispatch_checkpoint_missing, and label the response
      // so the caller can tell "your proposal already ran" from a fresh dispatch.
      await deps.execution?.markDispatched()
      const data = replay.data && typeof replay.data === 'object'
        ? { replay: 'already_confirmed' as const, ...(replay.data as Record<string, unknown>) }
        : { replay: 'already_confirmed' as const, result: replay.data }
      return { ok: true, data }
    }
    return replay ?? { ok: false, error: 'Proposal not found, already used, expired, or not yours.', code: 'expired' }
  }

  const persistSuccess = async (outcome: WriteConfirmOutcome): Promise<WriteConfirmOutcome> => {
    if (!outcome.ok) return outcome
    try {
      await deps.persistResult?.(parsed.data.proposalId, ctx.userId, outcome.data)
      return outcome
    } catch {
      const data = outcome.data && typeof outcome.data === 'object'
        ? { ...(outcome.data as Record<string, unknown>), reconciliation: 'pending' }
        : { result: outcome.data, reconciliation: 'pending' }
      return { ok: true, data }
    }
  }

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
    if (vo) return await persistSuccess(vo)
  }

  // 2b: banner confirm-tier actions get their own dispatch (returns jobIds).
  // Returns null for non-banner tool_names, so the financial/2c paths below handle those.
  if (deps.bannerDispatch) {
    const bo = await deps.bannerDispatch(row, ctx)
    if (bo) return await persistSuccess(bo)
  }

  // Feed round: attach / product-set-rules confirmations. An ack refusal happens BEFORE execution,
  // so the claim is reverted and the caller can retry with ack:true.
  if (deps.feedDispatch) {
    const fo = await deps.feedDispatch(row, ctx, parsed.data.ack === true)
    if (fo) {
      if (!fo.ok && fo.code === 'confirm_required') return await rejectAndRevert(fo)
      return await persistSuccess(fo)
    }
  }

  if (deps.googleAdsDispatch) {
    const googleOutcome = await deps.googleAdsDispatch(row, ctx)
    if (googleOutcome) {
      if ('code' in googleOutcome
        && (googleOutcome.code === 'confirm_required' || googleOutcome.code === 'forbidden')) {
        return await rejectAndRevert(googleOutcome)
      }
      return await persistSuccess(googleOutcome)
    }
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
      await deps.execution?.markDispatched()
      const res = await ex.execute(row.resolved_payload, ctx)
      return await persistSuccess({ ok: true, data: { resultRef: res.resultRef, summary: res.summary } })
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
    await deps.execution?.markDispatched()
    const res = await ex.execute(row.resolved_payload, ctx)
    return await persistSuccess({ ok: true, data: { resultRef: res.resultRef, summary: res.summary } })
  } catch {
    return { ok: false, error: 'Execution failed.', code: 'handler_error' }
  }
}
