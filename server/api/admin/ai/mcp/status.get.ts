import { requireRole } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'
import { registry } from '~~/server/utils/ai/tools'
import {
  projectGodModeTools,
  projectRegisteredMcpTools,
  registeredMcpSuites
} from '~~/server/utils/ai/mcp/registry'
import type { AiTool } from '~~/server/utils/ai/toolRegistry'
import { isActiveGodModeAuthority, resolveGodModeAuthority } from '~~/server/utils/godMode/authority'

interface AuditRow {
  id: string
  route_or_tool: string
  phase: string
  outcome_code: string
  created_at: string
}

function configured(value: string | undefined): boolean {
  return Boolean(value?.trim())
}

export default eventHandler(async (event) => {
  const user = await requireRole(event, ['admin', 'owner'])
  const authority = await resolveGodModeAuthority(event, user.id)
  const godModeActive = isActiveGodModeAuthority(authority, user.id)
  const suiteFlags = {
    generation: process.env.MCP_GEN_TOOLS_ENABLED === 'true',
    writes: process.env.MCP_WRITE_TOOLS_ENABLED === 'true',
    financial: process.env.MCP_FINANCIAL_TOOLS_ENABLED === 'true',
    video: process.env.MCP_VIDEO_TOOLS_ENABLED === 'true',
    videoGeneration: process.env.MCP_VIDEO_GEN_ENABLED === 'true',
    banners: process.env.MCP_BANNER_TOOLS_ENABLED === 'true',
    feeds: process.env.MCP_FEED_TOOLS_ENABLED === 'true'
  }
  const projection = {
    tools: registry as AiTool<unknown>[],
    role: user.role ?? '',
    scopes: ['mcp:read', 'mcp:write'],
    requireWriteScope: process.env.MCP_REQUIRE_WRITE_SCOPE === 'true',
    suiteFlags
  }
  const tools = godModeActive
    ? projectGodModeTools(projection)
    : projectRegisteredMcpTools(projection)
  const recentAudit = await queryRows<AuditRow>(
    `SELECT id, route_or_tool, phase, outcome_code, created_at
       FROM god_mode_audit_events
      WHERE channel = 'mcp'
      ORDER BY created_at DESC
      LIMIT 20`
  ).catch(() => [])

  return {
    enabled: process.env.MCP_SERVER_ENABLED === 'true',
    workerOrigin: process.env.MCP_WORKER_ORIGIN || 'https://mcp-server.adme-dev.workers.dev',
    authority: godModeActive ? 'god_mode' : 'governed',
    role: user.role ?? '',
    toolCount: tools.length,
    tools: tools.map(tool => ({ name: tool.name, description: tool.description })),
    suites: registeredMcpSuites.map(suite => ({ key: suite.key })),
    suiteFlags,
    safeguards: {
      writeScopeRequired: process.env.MCP_REQUIRE_WRITE_SCOPE === 'true',
      emergencyDisabled: authority.emergencyDisabled,
      internalSecretConfigured: configured(process.env.MCP_INTERNAL_SECRET),
      requestSigningSecretConfigured: configured(process.env.MCP_REQUEST_SIGNING_SECRET),
      internalExecutionSecretConfigured: configured(process.env.GOD_MODE_INTERNAL_EXECUTION_SECRET)
    },
    recentAudit: recentAudit.map(row => ({
      id: row.id,
      tool: row.route_or_tool,
      phase: row.phase,
      outcome: row.outcome_code,
      createdAt: row.created_at
    }))
  }
})
