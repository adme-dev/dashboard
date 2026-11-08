// server/api/admin/ai/mcp/status.get.ts
// Owner/admin rollout diagnostic for the MCP connector (app/pages/admin/ai/mcp.vue).
// Reads the master switch, suite flags and legacy write-scope opt-in through the SAME shared
// runtime resolver as tools/list, tools/call and my-tools, so this page reports the suites the
// Worker actually serves: request Cloudflare bindings first, compact MCP_SUITE_CONFIG honoured,
// explicit false / non-string legacy bindings fail closed. Secret health is presence-only; raw
// secret values and operator staff-grant JSON never leave the server.
import { defineEventHandler, type H3Event } from 'h3'
import { requireRole } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'
import { registry } from '~~/server/utils/ai/tools'
import {
  projectGodModeTools,
  projectRegisteredMcpTools,
  registeredMcpSuites
} from '~~/server/utils/ai/mcp/registry'
import { readMcpRuntimeValue, resolveMcpRuntimeConfig } from '~~/server/utils/ai/mcp/runtimeConfig'
import type { AiTool } from '~~/server/utils/ai/toolRegistry'
import { isActiveGodModeAuthority, resolveGodModeAuthority } from '~~/server/utils/godMode/authority'

interface AuditRow {
  id: string
  route_or_tool: string
  phase: string
  outcome_code: string
  created_at: string
}

const DEFAULT_WORKER_ORIGIN = 'https://mcp-server.adme-dev.workers.dev'

function configured(value: string | undefined): boolean {
  return Boolean(value?.trim())
}

/** Worker handshake secret: binding first; a present non-string binding fails closed (tools.post / call.post). */
function internalSecretConfigured(event: H3Event): boolean {
  return configured(readMcpRuntimeValue(event, 'MCP_INTERNAL_SECRET'))
}

/** Signing / internal-execution secrets: string binding, else local env (requestClaim, internalExecutionDelegation). */
function fallbackSecretConfigured(event: H3Event, key: string): boolean {
  const binding = (event.context as { cloudflare?: { env?: Record<string, unknown> } }).cloudflare?.env?.[key]
  return configured(typeof binding === 'string' ? binding : process.env[key])
}

export default defineEventHandler(async (event) => {
  const user = await requireRole(event, ['admin', 'owner'])
  const runtime = resolveMcpRuntimeConfig(event)
  const authority = await resolveGodModeAuthority(event, user.id)
  const godModeActive = isActiveGodModeAuthority(authority, user.id)
  const projection = {
    tools: registry as AiTool<unknown>[],
    role: user.role ?? '',
    scopes: ['mcp:read', 'mcp:write'],
    requireWriteScope: runtime.legacyRequireWriteScope,
    suiteFlags: runtime.suiteFlags
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
    enabled: runtime.serverEnabled,
    workerOrigin: runtime.workerOrigin || DEFAULT_WORKER_ORIGIN,
    authority: godModeActive ? 'god_mode' : 'governed',
    role: user.role ?? '',
    toolCount: tools.length,
    tools: tools.map(tool => ({ name: tool.name, description: tool.description })),
    suites: registeredMcpSuites.map(suite => ({ key: suite.key })),
    suiteFlags: { ...runtime.suiteFlags },
    safeguards: {
      writeScopeRequired: runtime.legacyRequireWriteScope,
      emergencyDisabled: authority.emergencyDisabled,
      internalSecretConfigured: internalSecretConfigured(event),
      requestSigningSecretConfigured: fallbackSecretConfigured(event, 'MCP_REQUEST_SIGNING_SECRET'),
      internalExecutionSecretConfigured: fallbackSecretConfigured(event, 'GOD_MODE_INTERNAL_EXECUTION_SECRET')
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
