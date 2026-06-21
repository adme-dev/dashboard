// server/api/agency/ai/mcp/my-tools.get.ts
// Session-facing companion to the Connect AI Assistants page (/agency/ai/connectors).
// Shows the signed-in staff member EXACTLY which read-only tools an external AI host
// (Claude / Cursor / ChatGPT) would expose for them — projected from the live registry
// against their own role, so the page never drifts from what the MCP server actually serves.
// This is informational only: requireAuth (no MCP secret), never executes a tool.
import { defineEventHandler } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { registry } from '~~/server/utils/ai/tools'
import { projectReadOnlyTools } from '~~/server/utils/ai/mcp/project'
import type { AiTool } from '~~/server/utils/ai/toolRegistry'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const role = user.role ?? ''
  const tools = projectReadOnlyTools(registry as AiTool<unknown>[], role)
  return {
    enabled: process.env.MCP_SERVER_ENABLED === 'true',
    workerOrigin: process.env.MCP_WORKER_ORIGIN || '',
    role,
    tools: tools.map(t => ({ name: t.name, description: t.description })),
  }
})
