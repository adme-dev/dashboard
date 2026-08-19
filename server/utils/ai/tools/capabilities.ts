import { z } from 'zod'
import type { AiTool } from '../toolRegistry'
import type { ToolContext, ToolResult } from '../toolContext'
import { ok, fail } from '../toolContext'
import {
  MCP_GEN_RATE_MAX,
  MCP_GEN_RATE_WINDOW_MIN,
  MCP_INSPECTION_RATE_MAX,
  MCP_INSPECTION_RATE_WINDOW_MIN,
} from '../mcp/rateLimit'
import { hasWriteScope, isWriteScopeToolName } from '../mcp/scope'
import { queryRows } from '~~/server/utils/db'

const actionLogFilter = z.object({
  clientId: z.string().uuid().optional(),
  clientName: z.string().trim().min(2).max(120).optional(),
  toolName: z.string().trim().min(1).max(160).optional(),
  since: z.string().datetime({ offset: true }).optional(),
  limit: z.number().int().min(1).max(50).default(20),
})
const params = z.object({ actionLog: actionLogFilter.optional() })
type Args = z.infer<typeof params>
type ToolMode = 'read' | 'inspection' | 'propose_only' | 'confirmation' | 'direct_generation'

export type CapabilityInspection = {
  tools: Array<{ name: string, mode: ToolMode }>
  suites: {
    textModels: boolean
    imageGeneration: boolean
    bannerStudio: boolean
    video: boolean
    audio: boolean
  }
}

export type CapabilitiesDeps = {
  inspect: (ctx: ToolContext) => Promise<CapabilityInspection>
  inspectActions?: (ctx: ToolContext, filter: z.infer<typeof actionLogFilter>) => Promise<unknown[]>
  retryDelay?: () => Promise<void>
}

const defaultDeps: CapabilitiesDeps = {
  inspect: async (ctx) => {
    const [toolModule, projectModule, generationModule, videoModule, bannerModule, writeModule] = await Promise.all([
      import('./index'),
      import('../mcp/project'),
      import('../mcp/generationTools'),
      import('../mcp/videoTools'),
      import('../mcp/bannerTools'),
      import('../mcp/writeTools'),
    ])
    const registryTools = toolModule.registry as AiTool<unknown>[]
    const genEnabled = process.env.MCP_GEN_TOOLS_ENABLED === 'true'
    const videoEnabled = process.env.MCP_VIDEO_TOOLS_ENABLED === 'true'
    const videoGenEnabled = videoEnabled && process.env.MCP_VIDEO_GEN_ENABLED === 'true'
    const bannerEnabled = process.env.MCP_BANNER_TOOLS_ENABLED === 'true'
    const writeEnabled = process.env.MCP_WRITE_TOOLS_ENABLED === 'true'
    const financialEnabled = process.env.MCP_FINANCIAL_TOOLS_ENABLED === 'true'
    const manifests = [
      ...projectModule.projectReadOnlyTools(registryTools, ctx.userRole),
      ...generationModule.projectGenerationTools(ctx.userRole, genEnabled),
      ...writeModule.projectWriteTools(registryTools, ctx.userRole, writeEnabled),
      ...videoModule.projectVideoTools(ctx.userRole, { suite: videoEnabled, gen: videoGenEnabled }),
      ...bannerModule.projectBannerTools(ctx.userRole, bannerEnabled),
      ...writeModule.projectFinancialTools(registryTools, ctx.userRole, financialEnabled),
    ]
    const grantedScopes = new Set(ctx.mcpScopes ?? [])
    const scopeFiltered = process.env.MCP_REQUIRE_WRITE_SCOPE === 'true' && !hasWriteScope(grantedScopes)
      ? manifests.filter(tool => !isWriteScopeToolName(tool.name))
      : manifests
    const inspectionNames = new Set(['verify_creative_compliance'])
    const generationNames = new Set(
      generationModule.generationTools
        .map(tool => tool.name)
        .filter(name => !generationModule.isGenerationReadToolName(name) && !inspectionNames.has(name))
    )
    const unique = [...new Map(scopeFiltered.map(manifest => {
      const mode: ToolMode = manifest.name === 'confirm_action'
        ? 'confirmation'
        : inspectionNames.has(manifest.name)
          ? 'inspection'
        : generationNames.has(manifest.name)
          ? 'direct_generation'
          : manifest.name.startsWith('propose_') || manifest.name === 'create_video_project'
            ? 'propose_only'
            : 'read'
      return [manifest.name, { name: manifest.name, mode }]
    })).values()]
    return {
      tools: unique,
      suites: {
        textModels: true,
        imageGeneration: unique.some(tool => tool.name === 'generate_banner_image'),
        bannerStudio: unique.some(tool => tool.name === 'list_banner_projects'),
        video: unique.some(tool => tool.name === 'list_video_models'),
        audio: unique.some(tool => tool.name === 'generate_voiceover' || tool.name === 'start_music_generation'),
      },
    }
  },
  inspectActions: async (ctx, filter) => await queryRows(
    `SELECT event.correlation_id AS "correlationId",
            event.route_or_tool AS tool,
            event.action_arguments AS arguments,
            event.client_id AS "clientId",
            client.name AS "clientName",
            event.phase AS outcome,
            event.outcome_code AS "outcomeCode",
            event.created_at AS "timestamp",
            actor.id AS "actorId",
            actor.name AS "actorName",
            actor.email AS "actorEmail"
       FROM god_mode_audit_events event
       LEFT JOIN agency_clients client ON client.id = event.client_id
       LEFT JOIN team_members actor ON actor.id = event.actor_user_id
      WHERE event.channel = 'mcp'
        AND event.phase IN ('ambiguous', 'succeeded', 'failed')
        AND cardinality(event.bypassed_controls) > 0
        AND ($1::uuid IS NULL OR event.client_id = $1::uuid)
        AND ($2::text IS NULL OR client.name ILIKE '%' || $2 || '%')
        AND ($3::text IS NULL OR event.route_or_tool = $3)
        AND ($4::timestamptz IS NULL OR event.created_at >= $4::timestamptz)
        AND ($6::boolean OR event.actor_user_id = $7::uuid)
      ORDER BY event.created_at DESC
      LIMIT $5`,
    [
      filter.clientId ?? null,
      filter.clientName ?? null,
      filter.toolName ?? null,
      filter.since ?? null,
      filter.limit,
      ctx.userRole === 'owner',
      ctx.userId,
    ]
  ),
}

async function inspectWithOneRetry(ctx: ToolContext, deps: CapabilitiesDeps): Promise<CapabilityInspection> {
  try {
    return await deps.inspect(ctx)
  } catch {
    await (deps.retryDelay?.() ?? new Promise(resolve => setTimeout(resolve, 25)))
    return await deps.inspect(ctx)
  }
}

export async function getCapabilities(args: Args, ctx: ToolContext, deps: CapabilitiesDeps = defaultDeps): Promise<ToolResult> {
  try {
    const [inspection, actions] = await Promise.all([
      inspectWithOneRetry(ctx, deps),
      args.actionLog && deps.inspectActions ? deps.inspectActions(ctx, args.actionLog) : Promise.resolve(undefined),
    ])
    return ok({
      identity: {
        id: ctx.userId,
        name: ctx.userName ?? null,
        email: ctx.userEmail ?? null,
        role: ctx.userRole,
      },
      scopes: [...(ctx.mcpScopes ?? [])],
      tools: inspection.tools,
      creationSuites: inspection.suites,
      selectionPolicy: 'capability_driven',
      governance: {
        read: 'executes immediately',
        inspection: 'executes immediately for analysis and evidence capture; does not create a media asset',
        propose_only: 'creates a reviewable proposal without executing it',
        confirmation: 'requires the authenticated user to confirm a proposal',
        direct_generation: 'intentional authenticated-owner carve-out: may create a billed asset immediately, is rate-limited, and every attempt/outcome is immutably audited',
      },
      directGenerationDecision: {
        enabled: inspection.tools.some(tool => tool.mode === 'direct_generation'),
        intended: true,
        tools: inspection.tools.filter(tool => tool.mode === 'direct_generation').map(tool => tool.name),
        compensatingControls: ['authenticated owner authority', 'rate limit', 'immutable action audit'],
        expansionPolicy: 'no additional direct-generation tools without an explicit review',
      },
      rateLimits: {
        generation: { maxCalls: MCP_GEN_RATE_MAX, windowMinutes: MCP_GEN_RATE_WINDOW_MIN },
        inspection: { maxCalls: MCP_INSPECTION_RATE_MAX, windowMinutes: MCP_INSPECTION_RATE_WINDOW_MIN },
      },
      ...(actions ? { actionLog: { items: actions, count: actions.length } } : {}),
    })
  } catch {
    return fail('Could not inspect MCP capabilities.', 'capabilities_unavailable', { retryable: true })
  }
}

export const capabilitiesTool: AiTool<Args> = {
  name: 'get_capabilities',
  description: 'Return the authenticated MCP identity, granted OAuth scopes, exact available tools, creation suites, governance boundaries, direct-generation decision, and rate limits. Optionally filter actionLog by client, tool, or time to self-audit who invoked non-read actions, with what redacted arguments, and their outcomes. Call before planning a multi-model or asset-creation workflow.',
  parameters: params,
  handler: (args, ctx) => getCapabilities(args, ctx),
}
