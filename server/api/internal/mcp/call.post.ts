// server/api/internal/mcp/call.post.ts
// Executes one MCP tool for the authenticated user. The Worker validates OAuth; Pages independently
// requires the service secret plus an exact one-time request claim, re-derives current role/authority,
// and routes through the existing governed tool suites. Every ordinary call is written to
// ai_action_audit with arg keys only, never values.
//
// Auth: x-mcp-secret == MCP_INTERNAL_SECRET. HARD-gated by MCP_SERVER_ENABLED.
import { defineEventHandler, getHeader, readBody, createError } from 'h3'
import { queryOne, execute } from '~~/server/utils/db'
import { registry } from '~~/server/utils/ai/tools'
import { executeReadOnlyTool } from '~~/server/utils/ai/mcp/project'
import { generationTools, executeGenerationTool } from '~~/server/utils/ai/mcp/generationTools'
import { buildGenerationRunner } from '~~/server/utils/ai/mcp/generationRunner'
import {
  videoReadTools, executeVideoTool, executeVideoPropose, resolveVideoProposeAction, dispatchVideoConfirm
} from '~~/server/utils/ai/mcp/videoTools'
import { buildVideoReadRunner, buildVideoProposeDeps, buildVideoConfirmDeps } from '~~/server/utils/ai/mcp/videoRunner'
import {
  bannerReadTools, executeBannerTool, executeBannerPropose, resolveBannerProposeAction,
  type BannerRenderPendingPayload
} from '~~/server/utils/ai/mcp/bannerTools'
import { buildBannerReadRunner, buildBannerProposeDeps, buildBannerConfirmDeps, dispatchBannerConfirm } from '~~/server/utils/ai/mcp/bannerRunner'
import {
  isGenerationRateLimited,
  isInspectionRateLimited,
  MCP_GEN_RATE_WINDOW_MIN,
  MCP_INSPECTION_RATE_WINDOW_MIN,
} from '~~/server/utils/ai/mcp/rateLimit'
import {
  dispatchGoogleAdsConfirm,
  executeGoogleAdsTool,
  GOOGLE_ADS_PROPOSE_ACTION_TOOL,
  isGoogleAdsToolName
} from '~~/server/utils/ai/mcp/googleAdsTools'
import {
  buildGoogleAdsConfirmDependencies,
  buildGoogleAdsMcpToolDependencies,
  googleAdsMcpFlagsFromEnv
} from '~~/server/utils/ai/mcp/googleAdsServer'
import {
  resolveProposeAction, executeWriteConfirm, MCP_CONFIRM_TOOL, type ClaimedProposal,
  isFinancialAction, MCP_FINANCIAL_ACTIONS, MCP_FINANCIAL_RICH_CONFIRM
} from '~~/server/utils/ai/mcp/writeTools'
import { getExecutor } from '~~/server/utils/ai/executors'
import { filterToolsForUser, type AiTool } from '~~/server/utils/ai/toolRegistry'
import { isWriteScopeToolName, hasWriteScope } from '~~/server/utils/ai/mcp/scope'
import {
  consumeMcpRequestClaim,
  getMcpRequestGodModeAuthority
} from '~~/server/utils/ai/mcp/requestClaim'
import { executeGodModeMcpCall } from '~~/server/utils/ai/mcp/directExecution'
import { isActiveGodModeAuthority } from '~~/server/utils/godMode/authority'
import type { ToolContext, ToolResult } from '~~/server/utils/ai/toolContext'
import { executeOrdinaryMcpRememberMutation } from '~~/server/utils/ai/tools/remember'
import { persistMcpProposalResult, replayExecutedMcpProposal } from '~~/server/utils/ai/mcp/proposalReplay'

export default defineEventHandler(async (event) => {
  if (process.env.MCP_SERVER_ENABLED !== 'true') {
    throw createError({ statusCode: 503, statusMessage: 'MCP server disabled' })
  }
  // Always require the shared secret. The previous `!import.meta.dev` bypass was a fail-open gate that
  // would expose this surface unauthenticated in any non-production build — never skip the check itself.
  const expectedSecret = process.env.MCP_INTERNAL_SECRET
  const secret = getHeader(event, 'x-mcp-secret')
  if (!expectedSecret || secret !== expectedSecret) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const body = await readBody<{ userId?: string, tool?: string, args?: unknown, idempotencyKey?: string }>(event).catch(() => null)
  const userId = body?.userId
  const toolName = body?.tool
  const idempotencyKey = body?.idempotencyKey
  if (!userId || !toolName || !idempotencyKey) {
    throw createError({ statusCode: 400, statusMessage: 'userId, tool and idempotencyKey required' })
  }
  if (!/^mcp:[0-9a-f]{64}$/.test(idempotencyKey)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid MCP logical idempotency key' })
  }

  // Consume the one-time exact-request claim before role projection, rate checks, proposal lookup, or
  // execution. The stable logical idempotency key is separately bound inside the signed body.
  const claim = await consumeMcpRequestClaim(
    event,
    getHeader(event, 'x-mcp-assertion') ?? '',
    userId
  )

  // Count before branching into ordinary vs God-mode execution so owner authority never bypasses
  // billing/inspection traffic controls. God-mode attempts live in their immutable audit table;
  // ordinary attempts live in ai_action_audit.
  const inspectionNames = ['verify_creative_compliance']
  const generationNames = [
    ...generationTools.map(t => t.name).filter(n => !['get_generation_status', 'list_creative_models', ...inspectionNames].includes(n)),
    'propose_video_generation', 'create_video_project', 'propose_banner_render',
    GOOGLE_ADS_PROPOSE_ACTION_TOOL,
    ...MCP_FINANCIAL_ACTIONS
  ]
  const isInspection = inspectionNames.includes(toolName)
  const isRateLimitedGeneration = generationNames.includes(toolName)
  if (isInspection || isRateLimitedGeneration) {
    const names = isInspection ? inspectionNames : generationNames
    const since = `${isInspection ? MCP_INSPECTION_RATE_WINDOW_MIN : MCP_GEN_RATE_WINDOW_MIN} minutes`
    const recent = await queryOne<{ n: number }>(
      `SELECT (
         SELECT COUNT(*)::int FROM ai_action_audit
          WHERE user_id = $1 AND payload->>'source' = 'mcp'
            AND tool_name = ANY($2) AND created_at > now() - $3::interval
       ) + (
         SELECT COUNT(*)::int FROM god_mode_audit_events
          WHERE actor_user_id = $1 AND channel = 'mcp' AND phase = 'attempt'
            AND route_or_tool = ANY($2) AND created_at > now() - $3::interval
       ) AS n`,
      [userId, names, since]
    ).catch(() => ({ n: 0 }))
    const limited = isInspection
      ? isInspectionRateLimited(recent?.n ?? 0)
      : isGenerationRateLimited(recent?.n ?? 0)
    if (limited) {
      return {
        ok: false,
        error: `Rate limit: too many ${isInspection ? 'inspection' : 'generation'} requests. Try again in a few minutes.`,
        code: 'rate_limited'
      }
    }
  }

  const authority = getMcpRequestGodModeAuthority(event, userId)
  if (isActiveGodModeAuthority(authority, userId)) {
    return await executeGodModeMcpCall({
      event,
      claim,
      authority,
      idempotencyKey,
      toolName,
      args: body?.args ?? {},
      requireWriteScope: process.env.MCP_REQUIRE_WRITE_SCOPE === 'true'
    })
  }

  const user = await queryOne<{ role: string, name: string | null, email: string | null }>(
    `SELECT user_role AS role, name, email FROM team_members WHERE id = $1 AND is_active = TRUE`,
    [userId]
  )
  if (!user) throw createError({ statusCode: 403, statusMessage: 'Unknown or inactive user' })

  const args = (body?.args ?? {}) as Record<string, unknown>
  // Whole endpoint is the MCP surface → stamp source='mcp' (write proposals persist with conv_id NULL).
  const grantedScopes = new Set(claim.scope)
  const ctx: ToolContext = {
    userId,
    userRole: user.role ?? '',
    userName: user.name ?? undefined,
    userEmail: user.email ?? undefined,
    mcpScopes: grantedScopes,
    event,
    source: 'mcp',
  }
  const writeEnabled = process.env.MCP_WRITE_TOOLS_ENABLED === 'true'

  // Generation tools (Phase 2a) are a separate, explicitly-gated action group — they bill + persist
  // assets, so they go through executeGenerationTool (gated by MCP_GEN_TOOLS_ENABLED + CREATIVE), NOT
  // the read-only guard (which would write_blocked them). Read tools take the Phase-1 path unchanged.
  const isGeneration = generationTools.some(t => t.name === toolName)
  const isRemember = toolName === 'remember'
  const writeAction = resolveProposeAction(toolName) // non-null for a safe propose_<action> write tool
  const isConfirm = toolName === MCP_CONFIRM_TOOL
  // Video suite (Phase 2b): reads gated by MCP_VIDEO_TOOLS_ENABLED; confirm-tier propose/create gated
  // ALSO by MCP_VIDEO_GEN_ENABLED. Video spend is its own confirm action — never the generic write flag.
  const videoSuiteEnabled = process.env.MCP_VIDEO_TOOLS_ENABLED === 'true'
  const videoGenEnabled = process.env.MCP_VIDEO_GEN_ENABLED === 'true'
  const isVideoRead = videoReadTools.some(t => t.name === toolName)
  const videoProposeAction = resolveVideoProposeAction(toolName) // 'video_generation' | 'video_project_create' | null
  // Banner suite (Phase 2b): reads and propose/confirm gated by MCP_BANNER_TOOLS_ENABLED.
  const bannerEnabled = process.env.MCP_BANNER_TOOLS_ENABLED === 'true'
  const isBannerRead = bannerReadTools.some(t => t.name === toolName)
  const bannerProposeAction = resolveBannerProposeAction(toolName) // 'banner_render' | null
  // Financial suite (Phase D4): propose_* names routed when MCP_FINANCIAL_TOOLS_ENABLED is on.
  const financialEnabled = process.env.MCP_FINANCIAL_TOOLS_ENABLED === 'true'
  const isFinancialPropose = isFinancialAction(toolName) // propose_budget_change etc.
  const googleAdsFlags = googleAdsMcpFlagsFromEnv()
  const isGoogleAdsTool = isGoogleAdsToolName(toolName)

  // CRITICAL-B: OAuth write-scope enforcement. Scope comes only from the verified signed claim. When
  // MCP_REQUIRE_WRITE_SCOPE is on, any WRITE-class tool (propose_*/confirm_action/generation/banner/
  // financial) requires mcp:write — so a connector consented as read-only cannot drive writes/money-movers
  // even if the user's ROLE would allow it. Flag OFF (default) → no scope check (non-breaking rollout).
  const requireWriteScope = process.env.MCP_REQUIRE_WRITE_SCOPE === 'true'

  let outcome: { ok: boolean, data?: unknown, error?: string, code?: string }
  if (requireWriteScope && isWriteScopeToolName(toolName) && !hasWriteScope(grantedScopes)) {
    outcome = { ok: false, error: 'This action requires write access. Reconnect your AI assistant and grant write (mcp:write) to use it.', code: 'insufficient_scope' }
  } else if (isRemember) {
    // Unlike proposal writes, remember is an immediate private write. Its coordinator atomically owns
    // the idempotency claim, memory upsert, action audit, and terminal ledger state, so do not append
    // the generic best-effort audit below or run it through the read-only handler.
    return await executeOrdinaryMcpRememberMutation({
      userId,
      idempotencyKey,
      sessionDigest: claim.bodyDigest,
      args,
      ctx
    })
  } else if (isConfirm) {
    // Shared confirm: atomically claim the MCP+user-scoped pending row, then dispatch. Available when
    // EITHER the 2c write group OR the 2b video-gen group is on. videoDispatch handles video tool_names
    // (returns jobId/projectId/cap_exceeded); non-video rows fall through to the 2c executor (gated by
    // writeEnabled). The idempotencyKey is derived from the proposalId so a double-confirm can't double-bill.
    const videoConfirmDeps = buildVideoConfirmDeps()
    outcome = await executeWriteConfirm(args, ctx, {
      enabled: writeEnabled || videoGenEnabled || bannerEnabled || financialEnabled || googleAdsFlags.write,
      writeEnabled,
      financialEnabled,
      getExecutor,
      claim: async (proposalId, uid) => queryOne<ClaimedProposal>(
        `UPDATE ai_pending_actions SET status='executed', confirmed_by=$2, executed_at=now()
          WHERE id = $1 AND user_id = $2 AND status='proposed' AND source='mcp' AND expires_at > now()
          RETURNING tool_name, resolved_payload`,
        [proposalId, uid]
      ).catch(() => null),
      replay: replayExecutedMcpProposal,
      persistResult: persistMcpProposalResult,
      // Restore a just-claimed row to 'proposed' when a PRE-execution gate (ack/permission) rejects, so a
      // money-mover proposal isn't burned and the caller can retry with ack:true. Scoped to our own claim.
      revertClaim: async (proposalId, uid) => {
        await execute(
          `UPDATE ai_pending_actions SET status='proposed', confirmed_by=NULL, executed_at=NULL
          WHERE id = $1 AND user_id = $2 AND status='executed' AND source='mcp'`,
          [proposalId, uid]
        ).catch(() => {})
      },
      videoDispatch: async (row, vctx) => {
        const pid = String((args as { proposalId?: unknown }).proposalId ?? '')
        const payload = row.tool_name === 'video_generation'
          ? { ...(row.resolved_payload as Record<string, unknown>), idempotencyKey: `mcp:${pid}` }
          : row.resolved_payload
        return dispatchVideoConfirm({ tool_name: row.tool_name, resolved_payload: payload }, vctx, {
          genEnabled: videoGenEnabled,
          ...videoConfirmDeps
        })
      },
      bannerDispatch: async (row, bctx) => {
        if (row.tool_name !== 'banner_render') return null
        return dispatchBannerConfirm(row.resolved_payload as BannerRenderPendingPayload, bctx, buildBannerConfirmDeps())
      },
      googleAdsDispatch: (row, googleContext) => dispatchGoogleAdsConfirm(
        row,
        String((args as { proposalId?: unknown }).proposalId ?? ''),
        (args as { ack?: unknown }).ack === true,
        googleContext,
        googleAdsFlags,
        buildGoogleAdsConfirmDependencies()
      )
    })
  } else if (isGoogleAdsTool) {
    outcome = await executeGoogleAdsTool(
      toolName,
      args,
      ctx,
      googleAdsFlags,
      buildGoogleAdsMcpToolDependencies()
    )
  } else if (writeAction) {
    // 2c propose: run the SAME registry propose-handler (resolution + persists a source='mcp' pending
    // row); returns { proposalId, resolved }. Gated by the write flag + the role's RBAC ceiling.
    if (!writeEnabled) {
      outcome = { ok: false, error: 'Write tools are not enabled over MCP.', code: 'disabled' }
    } else {
      const tool = (registry as AiTool<unknown>[]).find(t => t.name === writeAction)
      const allowed = filterToolsForUser(registry as AiTool<unknown>[], ctx.userRole).some(t => t.name === writeAction)
      if (!tool || !allowed) {
        outcome = { ok: false, error: 'Not permitted.', code: 'forbidden' }
      } else {
        const parsed = tool.parameters.safeParse(args)
        if (!parsed.success) {
          outcome = { ok: false, error: 'Invalid arguments.', code: 'bad_args' }
        } else {
          const r: ToolResult = await tool.handler(parsed.data, ctx).catch(() => ({ ok: false, error: 'Propose failed.' }))
          outcome = r.ok ? { ok: true, data: r.data } : { ok: false, error: r.error ?? 'Propose failed.', code: 'handler_error' }
        }
      }
    }
  } else if (videoProposeAction) {
    // 2b propose: validate + preview cost/compliance, persist a source='mcp' pending row (no spend).
    // Gated by the suite flag AND the video-gen flag; CREATIVE-scoped inside executeVideoPropose.
    outcome = await executeVideoPropose(videoProposeAction, args, ctx, {
      suiteEnabled: videoSuiteEnabled,
      genEnabled: videoGenEnabled,
      ...buildVideoProposeDeps()
    })
  } else if (bannerProposeAction) {
    // 2b banner propose: validate + resolve project, persist a source='mcp' pending row (no spend).
    // Gated by the banner flag; CREATIVE-scoped inside executeBannerPropose.
    outcome = await executeBannerPropose(toolName, args, ctx, buildBannerProposeDeps(), bannerEnabled)
  } else if (isFinancialPropose) {
    // D4 financial propose: run the registry propose-handler (resolution + persists source='mcp' pending
    // row) and return a proposalId — identical path to the 2c safe-action propose. Gated by the
    // independent financial flag. RBAC ceiling enforced by filterToolsForUser inside the handler.
    if (!financialEnabled) {
      outcome = { ok: false, error: 'Financial tools are not enabled over MCP.', code: 'disabled' }
    } else {
      // The financial propose_* names are already in MCP_FINANCIAL_ACTIONS; derive the underlying
      // registry action name (strip leading 'propose_' if present — it IS the action name already since
      // MCP_FINANCIAL_ACTIONS uses the propose_* names directly).
      const registryActionName = toolName // e.g. 'propose_budget_change' IS the registry name
      const tool = (registry as AiTool<unknown>[]).find(t => t.name === registryActionName)
      const allowed = filterToolsForUser(registry as AiTool<unknown>[], ctx.userRole).some(t => t.name === registryActionName)
      if (!tool || !allowed) {
        outcome = { ok: false, error: 'Not permitted.', code: 'forbidden' }
      } else {
        const parsed = tool.parameters.safeParse(args)
        if (!parsed.success) {
          outcome = { ok: false, error: 'Invalid arguments.', code: 'bad_args' }
        } else {
          const r: ToolResult = await tool.handler(parsed.data, ctx).catch(() => ({ ok: false, error: 'Propose failed.' }))
          outcome = r.ok ? { ok: true, data: r.data } : { ok: false, error: r.error ?? 'Propose failed.', code: 'handler_error' }
        }
      }
    }
  } else if (isBannerRead) {
    // Banner suite reads (Phase 2b): discovery + status, gated by MCP_BANNER_TOOLS_ENABLED + CREATIVE.
    outcome = await executeBannerTool(buildBannerReadRunner(), toolName, args, ctx, bannerEnabled)
  } else if (isGeneration) {
    outcome = await executeGenerationTool(toolName, args, ctx, {
      enabled: process.env.MCP_GEN_TOOLS_ENABLED === 'true',
      runner: buildGenerationRunner()
    })
  } else if (isVideoRead) {
    // Video suite reads (Phase 2b): discovery + status, gated by MCP_VIDEO_TOOLS_ENABLED + CREATIVE.
    outcome = await executeVideoTool(toolName, args, ctx, {
      enabled: videoSuiteEnabled,
      runner: buildVideoReadRunner()
    })
  } else {
    outcome = await executeReadOnlyTool(registry as AiTool<unknown>[], toolName, args, ctx)
  }

  // Audit every MCP call — arg keys only (no values). Enriched fidelity for the write/confirm surface so
  // a money-mover can be traced: link the proposal (pending_id), stamp confirmed_by on confirms, record a
  // real risk_tier, and distinguish a successful PROPOSE ('proposed' — nothing executed) from a CONFIRM
  // ('executed'). Fail-safe: a logging error never fails the call.
  const isProposeCall = !!writeAction || !!videoProposeAction || !!bannerProposeAction
    || isFinancialPropose || isGoogleAdsPropose
  // pending_id only on success (real, existing row id) to avoid dangling references on failed attempts.
  const auditPendingId = !outcome.ok
    ? null
    : isConfirm
      ? (String((args as { proposalId?: unknown }).proposalId ?? '') || null)
      : isProposeCall
        ? ((outcome.data as { proposalId?: string } | undefined)?.proposalId ?? null)
        : null
  const isMoneyMover = (MCP_FINANCIAL_RICH_CONFIRM as readonly string[]).includes(toolName)
  const auditRiskTier = isMoneyMover
    ? 'rich_confirm'
    : (isFinancialPropose || isGoogleAdsPropose || !!writeAction || isConfirm)
        ? 'confirm'
        : 'auto'
  const auditOutcome = !outcome.ok ? 'failed' : (isProposeCall ? 'proposed' : 'executed')
  await execute(
    `INSERT INTO ai_action_audit (pending_id, user_id, confirmed_by, tool_name, risk_tier, client_scope, payload, result_ref, outcome)
     VALUES ($1, $2, $3, $4, $5, NULL, $6, NULL, $7)`,
    [
      auditPendingId,
      userId,
      isConfirm && outcome.ok ? userId : null,
      toolName,
      auditRiskTier,
      JSON.stringify({ source: 'mcp', argKeys: Object.keys(args) }),
      auditOutcome
    ]
  ).catch(() => {})

  return outcome
})
