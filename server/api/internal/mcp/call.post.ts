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
import type { AiTool } from '~~/server/utils/ai/toolRegistry'

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
  const ctx = { userId, userRole: user.role ?? '', event }

  // Generation tools (Phase 2a) are a separate, explicitly-gated action group — they bill + persist
  // assets, so they go through executeGenerationTool (gated by MCP_GEN_TOOLS_ENABLED + CREATIVE), NOT
  // the read-only guard (which would write_blocked them). Read tools take the Phase-1 path unchanged.
  const isGeneration = generationTools.some(t => t.name === toolName)
  const outcome = isGeneration
    ? await executeGenerationTool(toolName, args, ctx, {
        enabled: process.env.MCP_GEN_TOOLS_ENABLED === 'true',
        runner: buildGenerationRunner()
      })
    : await executeReadOnlyTool(registry as AiTool<unknown>[], toolName, args, ctx)

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
