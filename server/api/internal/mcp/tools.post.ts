// server/api/internal/mcp/tools.post.ts
// MCP manifest endpoint. The Worker calls this for every tools/list request after validating OAuth;
// Pages then requires an exact one-time claim, revalidates current authority, and projects the scoped
// toolset. Staff-first: serves the staff registry; client/portal is a separate surface.
//
// Auth: x-mcp-secret must match MCP_INTERNAL_SECRET (the Worker holds the same secret). HARD-gated by
// MCP_SERVER_ENABLED — 503 until the operator turns the expose layer on.
import { defineEventHandler, getHeader, readBody, createError } from 'h3'
import { randomUUID } from 'node:crypto'
import { queryOne } from '~~/server/utils/db'
import { registry } from '~~/server/utils/ai/tools'
import { projectGodModeTools, projectRegisteredMcpTools } from '~~/server/utils/ai/mcp/registry'
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
  if (process.env.MCP_SERVER_ENABLED !== 'true') {
    throw createError({ statusCode: 503, statusMessage: 'MCP server disabled' })
  }
  // Always require the shared secret (no dev bypass — that was a fail-open gate in non-prod builds).
  const expectedSecret = process.env.MCP_INTERNAL_SECRET
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
  const requireWriteScope = process.env.MCP_REQUIRE_WRITE_SCOPE === 'true'
  const projectionContext = {
    tools: registry as AiTool<unknown>[],
    role: 'owner',
    scopes: claim.scope,
    requireWriteScope,
    suiteFlags: {
      generation: process.env.MCP_GEN_TOOLS_ENABLED === 'true',
      writes: process.env.MCP_WRITE_TOOLS_ENABLED === 'true',
      financial: process.env.MCP_FINANCIAL_TOOLS_ENABLED === 'true',
      video: process.env.MCP_VIDEO_TOOLS_ENABLED === 'true',
      videoGeneration: process.env.MCP_VIDEO_GEN_ENABLED === 'true',
      banners: process.env.MCP_BANNER_TOOLS_ENABLED === 'true',
      feeds: process.env.MCP_FEED_TOOLS_ENABLED === 'true',
      googleAdsRead: process.env.GOOGLE_ADS_MCP_READ_ENABLED === 'true',
      googleAdsWrite: process.env.GOOGLE_ADS_MCP_WRITE_ENABLED === 'true',
      googleAdsAutomation: process.env.GOOGLE_ADS_MCP_AUTOMATION_ENABLED === 'true',
      googleAdsDestructive: process.env.GOOGLE_ADS_MCP_DESTRUCTIVE_ENABLED === 'true'
    }
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

  const user = await queryOne<{ role: string }>(
    `SELECT user_role AS role FROM team_members WHERE id = $1 AND is_active = TRUE`,
    [userId]
  )
  if (!user) throw createError({ statusCode: 403, statusMessage: 'Unknown or inactive user' })

  // The registered suite list is the only assembly authority. For ordinary users its projectors retain
  // the existing per-suite flags, role permissions, and signed-claim write-scope narrowing.
  const role = user.role ?? ''
  return manifestResponse(projectRegisteredMcpTools({ ...projectionContext, role }))
})
