import { z } from 'zod'
import type { AiTool } from '../toolRegistry'
import type { ToolContext, ToolResult } from '../toolContext'
import { ok } from '../toolContext'
import {
  MCP_GEN_RATE_MAX,
  MCP_GEN_RATE_WINDOW_MIN,
  MCP_INSPECTION_RATE_MAX,
  MCP_INSPECTION_RATE_WINDOW_MIN,
} from '../mcp/rateLimit'
import { queryRows } from '~~/server/utils/db'
import { MCP_CATALOG_RELEASE } from '~~/shared/utils/mcpCatalog'

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
  inspectGenerationSpend?: () => Promise<GenerationSpendStatus | null>
  retryDelay?: () => Promise<void>
}

export type GenerationSpendStatus = {
  monthToDateUsd: number
  basis: 'estimated_reservations'
  note: string
  monthlyLimitUsd: number | null
}

/** Month-to-date generation spend against the gateway cap. Providers on the AI Gateway
 *  path return no per-call billed figure (Cloudflare unified billing), so this is the
 *  same reservation SUM the budget gate enforces: actual cost where reported, estimate
 *  otherwise, over jobs still holding budget this month. */
async function inspectGenerationSpendStatus(): Promise<GenerationSpendStatus | null> {
  const rows = await queryRows<{ total: string }>(
    `SELECT COALESCE(SUM(COALESCE(actual_cost_cents, estimated_cost_cents)), 0) AS total
       FROM video_generation_jobs
      WHERE status IN ('queued','running','succeeded')
        AND created_at >= date_trunc('month', now())`,
    []
  )
  const cents = Number(rows[0]?.total ?? 0)
  const limitRaw = Number(process.env.AI_GATEWAY_GENERATION_MONTHLY_LIMIT_USD)
  return {
    monthToDateUsd: Math.round(cents) / 100,
    basis: 'estimated_reservations',
    note: 'Gateway providers do not report per-call billed cost; figure is the enforced reservation sum (actual where reported, estimate otherwise).',
    monthlyLimitUsd: Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : null,
  }
}

export type GodModeActionFilter = {
  clientId?: string
  clientName?: string
  actorId?: string
  actorEmail?: string
  toolName?: string
  since?: string
  endDate?: string
  outcome?: 'succeeded' | 'failed' | 'ambiguous'
  limit?: number
}

export async function inspectGodModeActions(
  ctx: ToolContext,
  filter: GodModeActionFilter,
  load: typeof queryRows = queryRows,
): Promise<unknown[]> {
  return await load(
    `SELECT event.correlation_id AS "correlationId",
            event.route_or_tool AS tool,
            event.action_arguments AS arguments,
            event.client_id AS "clientId",
            client.name AS "clientName",
            event.phase AS outcome,
            event.outcome_code AS "outcomeCode",
            event.entity_type AS "entityType",
            event.entity_id AS "entityId",
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
        AND ($8::uuid IS NULL OR event.actor_user_id = $8::uuid)
        AND ($9::text IS NULL OR LOWER(actor.email) = LOWER($9))
        AND ($10::timestamptz IS NULL OR event.created_at <= $10::timestamptz)
        AND ($11::text IS NULL OR event.phase = $11)
      ORDER BY event.created_at DESC
      LIMIT $5`,
    [
      filter.clientId ?? null,
      filter.clientName ?? null,
      filter.toolName ?? null,
      filter.since ?? null,
      filter.limit ?? 20,
      ctx.userRole === 'owner',
      ctx.userId,
      filter.actorId ?? null,
      filter.actorEmail ?? null,
      filter.endDate ?? null,
      filter.outcome ?? null,
    ],
  )
}

const minimalInspection: CapabilityInspection = {
  tools: [{ name: 'get_capabilities', mode: 'read' }],
  suites: {
    textModels: true,
    imageGeneration: false,
    bannerStudio: false,
    video: false,
    audio: false,
  },
}

const defaultDeps: CapabilitiesDeps = {
  inspect: async (ctx) => {
    const [toolModule, registryModule, generationModule] = await Promise.all([
      import('./index'),
      import('../mcp/registry'),
      import('../mcp/generationTools'),
    ])
    const generationEnabled = process.env.MCP_GEN_TOOLS_ENABLED === 'true'
    const writeEnabled = process.env.MCP_WRITE_TOOLS_ENABLED === 'true'
    const financialEnabled = process.env.MCP_FINANCIAL_TOOLS_ENABLED === 'true'
    const videoEnabled = process.env.MCP_VIDEO_TOOLS_ENABLED === 'true'
    const videoGenerationEnabled = process.env.MCP_VIDEO_GEN_ENABLED === 'true'
    const bannerEnabled = process.env.MCP_BANNER_TOOLS_ENABLED === 'true'
    const projectionContext = {
      tools: toolModule.registry,
      role: ctx.userRole,
      scopes: [...(ctx.mcpScopes ?? [])],
      requireWriteScope: process.env.MCP_REQUIRE_WRITE_SCOPE === 'true',
      suiteFlags: {
        generation: generationEnabled,
        writes: writeEnabled,
        financial: financialEnabled,
        video: videoEnabled,
        videoGeneration: videoEnabled && videoGenerationEnabled,
        banners: bannerEnabled,
      },
    }
    // Capabilities and tools/list share one projection authority. Building the complete God-mode
    // execution map also asserts that every advertised name has exactly one schema-matched handler.
    const executableNames = new Set(
      registryModule.resolveGodModeMcpExecutions(projectionContext).map(execution => execution.name)
    )
    const manifests = ctx.godModeExecutionKey
      ? registryModule.projectGodModeTools(projectionContext)
      : registryModule.projectRegisteredMcpTools(projectionContext)
    for (const manifest of manifests) {
      if (!executableNames.has(manifest.name)) {
        throw new Error(`Capability has no registered MCP execution: ${manifest.name}`)
      }
    }
    const inspectionNames = new Set(['verify_creative_compliance'])
    const generationNames = new Set(
      generationModule.generationTools
        .map(tool => tool.name)
        .filter(name => !generationModule.isGenerationReadToolName(name) && !inspectionNames.has(name))
    )
    const unique = [...new Map(manifests.map(manifest => {
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
  inspectActions: inspectGodModeActions,
  inspectGenerationSpend: inspectGenerationSpendStatus,
}

async function inspectWithOneRetry(ctx: ToolContext, deps: CapabilitiesDeps): Promise<CapabilityInspection> {
  try {
    return await deps.inspect(ctx)
  } catch {
    await (deps.retryDelay?.() ?? new Promise(resolve => setTimeout(resolve, 25)))
    return await deps.inspect(ctx)
  }
}

async function inspectWithDegradedFallback(
  ctx: ToolContext,
  deps: CapabilitiesDeps
): Promise<{ inspection: CapabilityInspection, degraded: boolean }> {
  try {
    return { inspection: await inspectWithOneRetry(ctx, deps), degraded: false }
  } catch {
    return { inspection: minimalInspection, degraded: true }
  }
}

export async function getCapabilities(args: Args, ctx: ToolContext, deps: CapabilitiesDeps = defaultDeps): Promise<ToolResult> {
  const { inspection, degraded } = await inspectWithDegradedFallback(ctx, deps)
  const generationSpend = await deps.inspectGenerationSpend?.().catch(() => null) ?? null
  let actions: unknown[] | undefined
  let actionLogUnavailable = false
  if (args.actionLog && deps.inspectActions) {
    try {
      actions = await deps.inspectActions(ctx, args.actionLog)
    } catch {
      actionLogUnavailable = true
    }
  }
  const unavailableSections = [
    ...(degraded ? ['tool_catalog'] : []),
    ...(actionLogUnavailable ? ['action_log'] : []),
  ]
  return ok({
    identity: {
      id: ctx.userId,
      name: ctx.userName ?? null,
      email: ctx.userEmail ?? null,
      role: ctx.userRole,
    },
    scopes: [...(ctx.mcpScopes ?? [])],
    tools: inspection.tools,
    servedCatalog: {
      release: MCP_CATALOG_RELEASE,
      toolCount: inspection.tools.length,
      projectionAuthority: 'shared_with_tools_list',
    },
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
    ...(generationSpend ? { generationSpend } : {}),
    ...(actions ? { actionLog: { items: actions, count: actions.length } } : {}),
    ...(unavailableSections.length
      ? {
          degraded: {
            active: true,
            code: 'capabilities_partial',
            retryable: true,
            unavailableSections,
          },
        }
      : {}),
  })
}

export const capabilitiesTool: AiTool<Args> = {
  name: 'get_capabilities',
  description: 'Return the authenticated MCP identity, granted OAuth scopes, exact available tools, creation suites, governance boundaries, direct-generation decision, and rate limits. Optionally filter actionLog by client, tool, or time to self-audit who invoked non-read actions, with what redacted arguments, and their outcomes. Call before planning a multi-model or asset-creation workflow.',
  parameters: params,
  handler: (args, ctx) => getCapabilities(args, ctx),
}
