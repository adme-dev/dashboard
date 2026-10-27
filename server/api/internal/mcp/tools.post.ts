// server/api/internal/mcp/tools.post.ts
// MCP manifest endpoint. The Worker calls this for every tools/list request after validating OAuth;
// Pages then requires an exact one-time claim, revalidates current authority, and projects the scoped
// toolset. Staff-first: serves the staff registry; client/portal is a separate surface.
//
// Owners with active God-mode authority keep the complete registered union. Every other user is
// freshly resolved (resolveMcpStaffContext) and projected through marketingPolicy — the same policy
// tools/call and the connector preview use.
//
// Auth: x-mcp-secret must match MCP_INTERNAL_SECRET (binding first; the Worker holds the same secret). HARD-gated by
// MCP_SERVER_ENABLED (binding first, then process env) — 503 until the operator turns it on.
import { defineEventHandler, getHeader, readBody, createError } from 'h3'
import { randomUUID } from 'node:crypto'
import { registry } from '~~/server/utils/ai/tools'
import { projectGodModeTools } from '~~/server/utils/ai/mcp/registry'
import { projectMcpToolsForStaff } from '~~/server/utils/ai/mcp/marketingPolicy'
import { readMcpRuntimeValue, resolveMcpRuntimeConfig } from '~~/server/utils/ai/mcp/runtimeConfig'
import { resolveMcpStaffContext } from '~~/server/utils/ai/mcp/staffAuthority'
import {
  consumeMcpRequestClaim,
  getMcpRequestGodModeAuthority
} from '~~/server/utils/ai/mcp/requestClaim'
import type { AiTool } from '~~/server/utils/ai/toolRegistry'
import { isActiveGodModeAuthority } from '~~/server/utils/godMode/authority'
import {
  appendGodModeAuditEvent,
  type GodModeBypassedControl
} from '~~/server/utils/godMode/audit'
import { MCP_CATALOG_RELEASE, MCP_PREVIOUS_CATALOG_RELEASE, assertMcpCatalogNotRegressed } from '~~/shared/utils/mcpCatalog'

function manifestResponse<T>(tools: T[], assertOwnerFloor = false) {
  if (assertOwnerFloor && process.env.NODE_ENV !== 'test') {
    assertMcpCatalogNotRegressed(MCP_CATALOG_RELEASE, tools.length)
  }
  return {
    tools,
    catalog: {
      release: MCP_CATALOG_RELEASE,
      previousRelease: MCP_PREVIOUS_CATALOG_RELEASE,
      toolCount: tools.length,
      source: 'fresh_server_projection' as const,
      fullOwnerProjection: assertOwnerFloor,
    },
  }
}

export default defineEventHandler(async (event) => {
  const runtime = resolveMcpRuntimeConfig(event)
  if (!runtime.serverEnabled) {
    throw createError({ statusCode: 503, statusMessage: 'MCP server disabled' })
  }
  // Always require the shared secret (no dev bypass — that was a fail-open gate in non-prod builds).
  // Binding first (Pages runtime), then the local process env; a present non-string binding fails closed.
  const expectedSecret = readMcpRuntimeValue(event, 'MCP_INTERNAL_SECRET')
  const secret = getHeader(event, 'x-mcp-secret')
  if (!expectedSecret || secret !== expectedSecret) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const body = await readBody<{ userId?: string }>(event).catch(() => null)
  const userId = body?.userId
  if (!userId) throw createError({ statusCode: 400, statusMessage: 'userId required' })

  // The service secret authenticates the Worker; this unique signed claim authenticates and binds this
  // exact Worker request. It is consumed before any user projection/database-backed tool discovery.
  const claim = await consumeMcpRequestClaim(
    event,
    getHeader(event, 'x-mcp-assertion') ?? '',
    userId
  )

  const authority = getMcpRequestGodModeAuthority(event, userId)
  // Legacy opt-in: only labels the owner's scope bypass below; ordinary staff always need mcp:write.
  const requireWriteScope = runtime.legacyRequireWriteScope
  const projectionContext = {
    tools: registry as AiTool<unknown>[],
    role: 'owner',
    scopes: claim.scope,
    requireWriteScope,
    suiteFlags: runtime.suiteFlags
  }
  if (isActiveGodModeAuthority(authority, userId)) {
    const correlationId = randomUUID()
    const bypassedControls: GodModeBypassedControl[] = [
      'permission', 'feature_flag', 'release_policy', 'evaluation_policy',
      'personal_policy', 'budget', 'rate_limit'
    ]
    if (requireWriteScope && !claim.scope.includes('mcp:write')) bypassedControls.push('mcp_scope')
    if (Object.values(projectionContext.suiteFlags).some(enabled => !enabled)) {
      bypassedControls.push('mcp_suite_flag')
    }
    const audit = {
      actorUserId: userId,
      correlationId,
      sessionDigest: claim.bodyDigest,
      channel: 'mcp' as const,
      routeOrTool: 'tools/list',
      tenantId: null,
      clientId: null,
      bypassedControls,
      emergencyDisabled: false
    }
    let attemptWritten = false
    let failureOutcome = 'catalog_projection_failed'
    try {
      await appendGodModeAuditEvent({ ...audit, phase: 'attempt', outcomeCode: 'started' })
      attemptWritten = true
      const tools = projectGodModeTools(projectionContext)
      failureOutcome = 'catalog_terminal_audit_failed'
      await appendGodModeAuditEvent({ ...audit, phase: 'succeeded', outcomeCode: 'catalog_projected' })
      return manifestResponse(tools, true)
    } catch {
      if (attemptWritten) {
        try {
          await appendGodModeAuditEvent({ ...audit, phase: 'failed', outcomeCode: failureOutcome })
        } catch {
          throw createError({ statusCode: 503, statusMessage: 'God mode MCP audit unavailable' })
        }
      }
      throw createError({ statusCode: 503, statusMessage: 'God mode MCP audit unavailable' })
    }
  }

  // Fresh, uncached staff authority (403 inactive / 503 unavailable). Management staff keep the
  // registered suite projection narrowed by fresh groups + signed write scope; everyone else sees only
  // reviewed staff-policy tools.
  const staff = await resolveMcpStaffContext(event, userId, claim.scope, { runtimeConfig: runtime })
  return manifestResponse(projectMcpToolsForStaff({ context: projectionContext, staff }))
})
