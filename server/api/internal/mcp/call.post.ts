// server/api/internal/mcp/call.post.ts
// MCP Server Phase 1 (mcp-server-phase1 spec §2,§5) — executes ONE read tool for the authenticated user.
// The Worker validated the OAuth token and asserts `userId`; we re-derive ROLE from the DB and run the
// tool through executeReadOnlyTool, which HARD-blocks any write (Phase-1 invariant) and re-checks the
// RBAC ceiling. Every call is written to ai_action_audit (security trail for the external surface);
// payload stores arg KEYS only, never values, to avoid persisting sensitive data.
//
// Auth: x-mcp-secret == MCP_INTERNAL_SECRET. HARD-gated by MCP_SERVER_ENABLED.
import { defineEventHandler, getHeader, readBody, createError } from 'h3'
import { queryOne, execute } from '~~/server/utils/db'
import { registry } from '~~/server/utils/ai/tools'
import { executeReadOnlyTool } from '~~/server/utils/ai/mcp/project'
import { generationTools, executeGenerationTool } from '~~/server/utils/ai/mcp/generationTools'
import { buildGenerationRunner } from '~~/server/utils/ai/mcp/generationRunner'
import { isGenerationRateLimited, MCP_GEN_RATE_WINDOW_MIN } from '~~/server/utils/ai/mcp/rateLimit'
import {
  resolveProposeAction, executeWriteConfirm, MCP_CONFIRM_TOOL, type ClaimedProposal
} from '~~/server/utils/ai/mcp/writeTools'
import { getExecutor } from '~~/server/utils/ai/executors'
import { filterToolsForUser, type AiTool } from '~~/server/utils/ai/toolRegistry'
import type { ToolContext, ToolResult } from '~~/server/utils/ai/toolContext'

export default defineEventHandler(async (event) => {
  if (process.env.MCP_SERVER_ENABLED !== 'true') {
    throw createError({ statusCode: 503, statusMessage: 'MCP server disabled' })
  }
  const secret = getHeader(event, 'x-mcp-secret')
  if (!import.meta.dev && secret !== process.env.MCP_INTERNAL_SECRET) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const body = await readBody<{ userId?: string, tool?: string, args?: unknown }>(event).catch(() => null)
  const userId = body?.userId
  const toolName = body?.tool
  if (!userId || !toolName) throw createError({ statusCode: 400, statusMessage: 'userId and tool required' })

  const user = await queryOne<{ role: string }>(
    `SELECT role FROM team_members WHERE id = $1 AND is_active = TRUE`,
    [userId]
  )
  if (!user) throw createError({ statusCode: 403, statusMessage: 'Unknown or inactive user' })

  const args = (body?.args ?? {}) as Record<string, unknown>
  // Whole endpoint is the MCP surface → stamp source='mcp' (write proposals persist with conv_id NULL).
  const ctx: ToolContext = { userId, userRole: user.role ?? '', event, source: 'mcp' }
  const writeEnabled = process.env.MCP_WRITE_TOOLS_ENABLED === 'true'

  // Generation tools (Phase 2a) are a separate, explicitly-gated action group — they bill + persist
  // assets, so they go through executeGenerationTool (gated by MCP_GEN_TOOLS_ENABLED + CREATIVE), NOT
  // the read-only guard (which would write_blocked them). Read tools take the Phase-1 path unchanged.
  const isGeneration = generationTools.some(t => t.name === toolName)
  const writeAction = resolveProposeAction(toolName) // non-null for a safe propose_<action> write tool
  const isConfirm = toolName === MCP_CONFIRM_TOOL

  // Per-actor rate limit on generation (it bills, no HITL). Count this user's recent MCP generation
  // calls from the audit ledger; refuse over the cap. get_generation_status (a cheap poll) is exempt.
  if (isGeneration && toolName !== 'get_generation_status') {
    const since = `${MCP_GEN_RATE_WINDOW_MIN} minutes`
    const recent = await queryOne<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM ai_action_audit
        WHERE user_id = $1 AND payload->>'source' = 'mcp'
          AND tool_name = ANY($2) AND created_at > now() - $3::interval`,
      [userId, generationTools.map(t => t.name), since]
    ).catch(() => ({ n: 0 }))
    if (isGenerationRateLimited(recent?.n ?? 0)) {
      return { ok: false, error: `Rate limit: too many generation requests. Try again in a few minutes.`, code: 'rate_limited' }
    }
  }

  let outcome: { ok: boolean, data?: unknown, error?: string, code?: string }
  if (isConfirm) {
    // 2c confirm: atomically claim the MCP+user-scoped pending row, then dispatch to the executor.
    outcome = await executeWriteConfirm(args, ctx, {
      enabled: writeEnabled,
      getExecutor,
      claim: async (proposalId, uid) => queryOne<ClaimedProposal>(
        `UPDATE ai_pending_actions SET status='executed', confirmed_by=$2, executed_at=now()
          WHERE id = $1 AND user_id = $2 AND status='proposed' AND source='mcp' AND expires_at > now()
          RETURNING tool_name, resolved_payload`,
        [proposalId, uid]
      ).catch(() => null)
    })
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
  } else if (isGeneration) {
    outcome = await executeGenerationTool(toolName, args, ctx, {
      enabled: process.env.MCP_GEN_TOOLS_ENABLED === 'true',
      runner: buildGenerationRunner()
    })
  } else {
    outcome = await executeReadOnlyTool(registry as AiTool<unknown>[], toolName, args, ctx)
  }

  // Audit every MCP call — arg keys only (no values). Fail-safe: a logging error never fails the call.
  await execute(
    `INSERT INTO ai_action_audit (pending_id, user_id, confirmed_by, tool_name, risk_tier, client_scope, payload, result_ref, outcome)
     VALUES (NULL, $1, NULL, $2, 'auto', NULL, $3, NULL, $4)`,
    [
      userId,
      toolName,
      JSON.stringify({ source: 'mcp', argKeys: Object.keys(args) }),
      outcome.ok ? 'executed' : 'failed'
    ]
  ).catch(() => {})

  return outcome
})
