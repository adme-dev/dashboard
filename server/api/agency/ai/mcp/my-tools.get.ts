// server/api/agency/ai/mcp/my-tools.get.ts
// Session-facing companion to the Connect AI Assistants page (/agency/ai/connectors).
// Shows the signed-in staff member EXACTLY which tools an external AI host
// (Claude / Cursor / ChatGPT) would expose for them — the complete registered union for an active
// owner authority, or the existing role-scoped read-only set for ordinary staff.
// This is informational only: requireAuth (no MCP secret), never executes a tool.
import { defineEventHandler } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { registry } from '~~/server/utils/ai/tools'
import { projectGodModeTools, projectRegisteredMcpTools } from '~~/server/utils/ai/mcp/registry'
import type { AiTool } from '~~/server/utils/ai/toolRegistry'
import {
  isActiveGodModeAuthority,
  resolveGodModeAuthority
} from '~~/server/utils/godMode/authority'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const role = user.role ?? ''
  const authority = await resolveGodModeAuthority(event, user.id)
  const activeGodMode = isActiveGodModeAuthority(authority, user.id)
  const projectionContext = {
    tools: registry as AiTool<unknown>[],
    role,
    scopes: ['mcp:read'],
    requireWriteScope: process.env.MCP_REQUIRE_WRITE_SCOPE === 'true',
    suiteFlags: {
      generation: false,
      writes: false,
      financial: false,
      video: false,
      videoGeneration: false,
      banners: false,
      feeds: false
    }
  }
  const tools = activeGodMode
    ? projectGodModeTools(projectionContext)
    : projectRegisteredMcpTools(projectionContext)
  return {
    enabled: process.env.MCP_SERVER_ENABLED === 'true',
    workerOrigin: process.env.MCP_WORKER_ORIGIN || '',
    role,
    ...(activeGodMode ? { authority: 'god_mode' as const } : {}),
    tools: tools.map(t => ({ name: t.name, description: t.description })),
  }
})
