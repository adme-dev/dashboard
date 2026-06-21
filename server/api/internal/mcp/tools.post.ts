// server/api/internal/mcp/tools.post.ts
// MCP Server Phase 1 (mcp-server-phase1 spec §2,§4) — the manifest endpoint the MCP Worker calls on
// session start to learn which READ tools the authenticated user may call. The Worker has already
// validated the user's OAuth token and asserts their `userId`; we re-derive the ROLE from the DB (never
// trust an asserted role) and project the read-only, RBAC-filtered toolset. Staff-first: serves the
// staff `registry`; client/portal (`portalRegistry`, different tool type) is a later phase.
//
// Auth: x-mcp-secret must match MCP_INTERNAL_SECRET (the Worker holds the same secret). HARD-gated by
// MCP_SERVER_ENABLED — 503 until the operator turns the expose layer on.
import { defineEventHandler, getHeader, readBody, createError } from 'h3'
import { queryOne } from '~~/server/utils/db'
import { registry } from '~~/server/utils/ai/tools'
import { projectReadOnlyTools } from '~~/server/utils/ai/mcp/project'
import { projectGenerationTools } from '~~/server/utils/ai/mcp/generationTools'
import { projectWriteTools } from '~~/server/utils/ai/mcp/writeTools'
import { projectVideoReadTools } from '~~/server/utils/ai/mcp/videoTools'
import type { AiTool } from '~~/server/utils/ai/toolRegistry'

export default defineEventHandler(async (event) => {
  if (process.env.MCP_SERVER_ENABLED !== 'true') {
    throw createError({ statusCode: 503, statusMessage: 'MCP server disabled' })
  }
  const secret = getHeader(event, 'x-mcp-secret')
  if (!import.meta.dev && secret !== process.env.MCP_INTERNAL_SECRET) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const body = await readBody<{ userId?: string }>(event).catch(() => null)
  const userId = body?.userId
  if (!userId) throw createError({ statusCode: 400, statusMessage: 'userId required' })

  const user = await queryOne<{ role: string }>(
    `SELECT role FROM team_members WHERE id = $1 AND is_active = TRUE`,
    [userId]
  )
  if (!user) throw createError({ statusCode: 403, statusMessage: 'Unknown or inactive user' })

  // Read tools (Phase 1) + generation tools (2a, MCP_GEN_TOOLS_ENABLED) + confirm-tier write
  // propose/confirm tools (2c, MCP_WRITE_TOOLS_ENABLED) + video suite reads (2b,
  // MCP_VIDEO_TOOLS_ENABLED). Each group flag-gated independently. Deduped by name so a tool emitted
  // by more than one group (e.g. confirm_action, once 2b's propose/confirm lands) appears once.
  const role = user.role ?? ''
  const assembled = [
    ...projectReadOnlyTools(registry as AiTool<unknown>[], role),
    ...projectGenerationTools(role, process.env.MCP_GEN_TOOLS_ENABLED === 'true'),
    ...projectWriteTools(registry as AiTool<unknown>[], role, process.env.MCP_WRITE_TOOLS_ENABLED === 'true'),
    ...projectVideoReadTools(role, process.env.MCP_VIDEO_TOOLS_ENABLED === 'true')
  ]
  const seen = new Set<string>()
  const tools = assembled.filter(t => (seen.has(t.name) ? false : (seen.add(t.name), true)))
  return { tools }
})
