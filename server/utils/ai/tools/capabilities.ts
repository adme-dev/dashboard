import { z } from 'zod'
import type { AiTool } from '../toolRegistry'
import type { ToolContext, ToolResult } from '../toolContext'
import { ok, escapeLike } from '../toolContext'
import {
  MCP_GEN_RATE_MAX,
  MCP_GEN_RATE_WINDOW_MIN,
  MCP_INSPECTION_RATE_MAX,
  MCP_INSPECTION_RATE_WINDOW_MIN,
} from '../mcp/rateLimit'
import { queryRows } from '~~/server/utils/db'
import { MCP_CATALOG_RELEASE, MCP_PREVIOUS_CATALOG_RELEASE } from '~~/shared/utils/mcpCatalog'

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
  inspectDataSyncRuns?: () => Promise<DataSyncRunStatus | null>
  retryDelay?: () => Promise<void>
}

/** P-01: what the scheduled sync actually did last, not just when it is next due. */
export type DataSyncRunStatus = {
  lastRunAt: string | null
  lastRunOutcome: 'completed' | 'failed' | 'running' | 'none'
  byPlatform: Array<{ platform: string, status: string, startedAt: string, finishedAt: string | null, syncedCount: number, failureCount: number }>
  coverageBaselinePresent: boolean
}

const DATA_SYNC_INSPECT_TIMEOUT_MS = 1500

export async function inspectDataSyncRunStatus(load: typeof queryRows = queryRows): Promise<DataSyncRunStatus | null> {
  // Never let a slow/unavailable DB stall get_capabilities — a null here renders as "unknown".
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), DATA_SYNC_INSPECT_TIMEOUT_MS) })
  try {
    return await Promise.race([inspectDataSyncRunStatusUnbounded(load), timeout])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

async function inspectDataSyncRunStatusUnbounded(load: typeof queryRows): Promise<DataSyncRunStatus | null> {
  const [runs, baseline] = await Promise.all([
    load<{ platform: string, status: string, started_at: string, finished_at: string | null, synced_count: number, failure_count: number }>(
      `SELECT platform, status, started_at::text, finished_at::text, synced_count,
              jsonb_array_length(COALESCE(failures, '[]'::jsonb)) AS failure_count
         FROM (
           SELECT *, ROW_NUMBER() OVER (PARTITION BY platform ORDER BY started_at DESC) AS rn
             FROM spend_sync_jobs
         ) ranked
        WHERE rn = 1
        ORDER BY started_at DESC`,
      [],
    ).catch(() => null),
    load<{ n: number }>(`SELECT COUNT(*)::int AS n FROM spend_sync_source_counts`, []).catch(() => null),
  ])
  if (!runs) return null
  const newest = runs[0]
  return {
    lastRunAt: newest?.started_at ?? null,
    lastRunOutcome: !newest ? 'none' : newest.status === 'completed' ? 'completed' : newest.status === 'running' ? 'running' : 'failed',
    byPlatform: runs.map(r => ({
      platform: r.platform, status: r.status, startedAt: r.started_at, finishedAt: r.finished_at,
      syncedCount: Number(r.synced_count), failureCount: Number(r.failure_count),
    })),
    coverageBaselinePresent: Number(baseline?.[0]?.n ?? 0) > 0,
  }
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
        AND ($2::text IS NULL OR client.name ILIKE '%' || $2 || '%' ESCAPE '\\')
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
      filter.clientName ? escapeLike(filter.clientName) : null,
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


/** G-4: when data next moves. The ad-spend sync runs from the pages-cron Worker. */
export function describeDataSyncSchedule(now: Date = new Date(), runs: DataSyncRunStatus | null = null) {
  const cron = '0 20 * * *'
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 20, 0, 0))
  if (next.getTime() <= now.getTime()) next.setUTCDate(next.getUTCDate() + 1)
  return {
    adSpend: {
      cron,
      timezone: 'UTC',
      note: '06:00 Melbourne — moved from 06:00 UTC so the 9am budget check reads same-day data',
      nextRunAt: next.toISOString(),
      nextRunBasis: 'computed from the cron expression, not a scheduler record',
      // P-01: the as-of of the sync itself. null = the job table could not be read.
      lastRunAt: runs?.lastRunAt ?? null,
      lastRunOutcome: runs?.lastRunOutcome ?? null,
      byPlatform: runs?.byPlatform ?? null,
      coverageBaselinePresent: runs?.coverageBaselinePresent ?? null,
      coverageHaltNote: 'G-2 halts the persist step when a source\'s campaign count drops >5% vs the baseline in spend_sync_source_counts; coverageBaselinePresent=false means that gate cannot fire yet',
    }
  }
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
    const [toolModule, registryModule, generationModule, feedModule] = await Promise.all([
      import('./index'),
      import('../mcp/registry'),
      import('../mcp/generationTools'),
      import('../mcp/feedTools'),
    ])
    const generationEnabled = process.env.MCP_GEN_TOOLS_ENABLED === 'true'
    const writeEnabled = process.env.MCP_WRITE_TOOLS_ENABLED === 'true'
    const financialEnabled = process.env.MCP_FINANCIAL_TOOLS_ENABLED === 'true'
    const videoEnabled = process.env.MCP_VIDEO_TOOLS_ENABLED === 'true'
    const videoGenerationEnabled = process.env.MCP_VIDEO_GEN_ENABLED === 'true'
    const bannerEnabled = process.env.MCP_BANNER_TOOLS_ENABLED === 'true'
    const feedEnabled = process.env.MCP_FEED_TOOLS_ENABLED === 'true'
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
        feeds: feedEnabled,
      },
    }
    // Capabilities and tools/list share one projection authority. Building the complete God-mode
    // execution map also asserts that every advertised name has exactly one schema-matched handler.
    const executionsByName = new Map(
      registryModule.resolveGodModeMcpExecutions(projectionContext).map(execution => [execution.name, execution])
    )
    const executableNames = new Set(executionsByName.keys())
    const manifests = ctx.godModeExecutionKey
      ? registryModule.projectGodModeTools(projectionContext)
      : registryModule.projectRegisteredMcpTools(projectionContext)
    for (const manifest of manifests) {
      if (!executableNames.has(manifest.name)) {
        throw new Error(`Capability has no registered MCP execution: ${manifest.name}`)
      }
    }
    const inspectionNames = new Set(['verify_creative_compliance', 'run_adspend_sync', 'get_sync_status'])
    const generationNames = new Set(
      generationModule.generationTools
        .map(tool => tool.name)
        .filter(name => !generationModule.isGenerationReadToolName(name) && !inspectionNames.has(name))
    )
    const alwaysConfirmNames = new Set<string>(feedModule.MCP_FEED_ALWAYS_CONFIRM)
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
      // G-1a: report what will ACTUALLY happen for this caller. Under owner god-mode,
      // catalog-registry writes direct-execute (confirmation is a bypassed control) —
      // an agent must never read propose_only and get a live write. Supplemental
      // suites (video/banner) genuinely stop at a proposal and keep their mode.
      const execution = executionsByName.get(manifest.name)
      const directExecutes = Boolean(ctx.godModeExecutionKey)
        && mode === 'propose_only'
        && execution?.kind === 'catalog'
        && execution.tool.mutates === true
      // P-2 carve-in: feed attach / product-set-rules NEVER direct-execute — confirm_action with
      // ack:true is required regardless of caller authority, and effectiveMode must say so.
      const alwaysConfirms = Boolean(ctx.godModeExecutionKey) && alwaysConfirmNames.has(manifest.name)
      return [manifest.name, {
        name: manifest.name,
        mode,
        ...(alwaysConfirms
          ? {
              effectiveMode: 'confirmation_required' as const,
              effectiveModeReason: 'binds or retargets a client ad account; requires confirm_action with ack:true regardless of caller authority. Pass dryRun:true to preview without writing.'
            }
          : directExecutes
            ? {
                effectiveMode: 'direct_execute' as const,
                effectiveModeReason: 'owner god-mode bypasses confirmation for registry writes; pass dryRun:true (where supported) to preview without writing'
              }
            : {})
      }]
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
  inspectDataSyncRuns: inspectDataSyncRunStatus,
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
  const dataSyncRuns = await deps.inspectDataSyncRuns?.().catch(() => null) ?? null
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
      previousRelease: MCP_PREVIOUS_CATALOG_RELEASE,
      toolCount: inspection.tools.length,
      projectionAuthority: 'shared_with_tools_list',
    },
    creationSuites: inspection.suites,
    selectionPolicy: 'capability_driven',
    governance: {
      ...(ctx.godModeExecutionKey
        ? { godModeBypass: 'an owner-authority session direct-executes registry writes; propose_only tools with effectiveMode direct_execute do not stop at a proposal for this identity' }
        : {}),
      read: 'executes immediately',
      inspection: 'executes immediately for analysis and evidence capture; does not create a media asset',
      propose_only: 'creates a reviewable proposal without executing it',
      confirmation: 'requires the authenticated user to confirm a proposal',
      direct_generation: 'intentional authenticated-owner carve-out: may create a billed asset immediately, is rate-limited, and every attempt/outcome is immutably audited',
    },
    alwaysRequiresConfirmation: {
      tools: ['propose_attach_catalog_feed', 'propose_set_product_set_rules'],
      reason: 'binds or retargets a client ad account; not reversible from the agent side',
      note: 'requires confirm_action with ack:true regardless of caller authority',
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
    dataSync: describeDataSyncSchedule(new Date(), dataSyncRuns),
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
