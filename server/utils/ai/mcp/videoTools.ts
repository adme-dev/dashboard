import { z } from 'zod'
import { roleHasPermission } from '~~/server/utils/permissions'
import type { PermissionGroup } from '~~/server/utils/permissions'
import type { ToolContext, ToolResult } from '~~/server/utils/ai/toolContext'
import type { McpExecutionDescriptor, McpProjectionContext, McpToolManifest } from './project'
import {
  MCP_VIDEO_CONFIRM_DESCRIPTION,
  projectConfirmActionManifest,
  resolveRegisteredConfirmDescription
} from './writeTools'
import type {
  VideoGenerationModel,
  VideoGenerationMode,
  VideoGenerationSubjectType,
  VideoGenerationTenantPolicy,
  VideoGenerationSourceAsset,
  VideoGenerationComplianceResult
} from '~~/server/utils/video-generation/types'
import type { EvaluateVideoGenerationComplianceInput } from '~~/server/utils/video-generation/compliance'

/** Minimal shape of an authorized AV project + its current timeline (a superset of the real types). */
export interface ResolvedAvProject {
  project: { mediaType: string, clientId: string | null, createdBy: string | null, currentTimelineId: string | null }
  timeline: { id: string } | null
}

/** The resolved payload a `video_generation` proposal persists (frozen at propose, executed at confirm). */
export interface VideoGenerationPendingPayload {
  tenantId: string
  projectId: string
  timelineId: string | null
  mode: VideoGenerationMode
  modelId: string
  provider: string
  prompt: string
  sourceAssetIds: string[]
  durationSeconds: number
  aspectRatio: string
  resolution: string | null
  subjectType: VideoGenerationSubjectType
  complianceStatus: string
  complianceReasons: string[]
  estimatedCostCents: number
  /** Injected at confirm time (derived from the proposalId) so a double-confirm cannot double-bill. */
  idempotencyKey?: string
}

/** The resolved payload a `video_project_create` proposal persists. */
export interface VideoProjectPendingPayload { title: string, clientId: string | null }

/** The resolved payload a proposal-only timeline edit stores for in-app review. */
export interface VideoTimelineEditPendingPayload {
  projectId: string
  timelineId: string | null
  reason: string | null
  operations: Array<Record<string, unknown>>
  reviewRequired: true
}

/**
 * MCP Server Phase 2b — owned video-generation suite over MCP (spec:
 * docs/superpowers/specs/2026-06-21-mcp-phase2b-video-generation-design.md).
 *
 * Mirrors the 2a generation pattern: this module is PURE (descriptors + projection + guards + injected-
 * dep propose/confirm), unit-testable with no Cloudflare bindings; the binding half lives in
 * videoRunner.ts. The read tools (this file's first half) discover AV projects + models + jobs and poll
 * status — no spend, no writes — gated by MCP_VIDEO_TOOLS_ENABLED + the CREATIVE permission. The
 * confirm-tier propose/confirm half (added below) reuses the dormant 2c ai_pending_actions machinery.
 */

export interface VideoToolDescriptor {
  name: string
  description: string
  parameters: z.ZodTypeAny
  requiredPermission: PermissionGroup
}

const UUID = z.string().uuid()

export const videoReadTools: VideoToolDescriptor[] = [
  {
    name: 'list_av_projects',
    description:
      'List the AV (audio-visual) projects you can generate video into. Returns id/title/client/hasTimeline. '
      + 'Pick a projectId before starting a generation, or call create_video_project to make a new one.',
    parameters: z.object({}),
    requiredPermission: 'CREATIVE'
  },
  {
    name: 'list_video_models',
    description:
      'List selectable video-generation models and, per model, the allowed modes / durations / aspect-ratios / '
      + 'resolutions / subject-types, plus the tenant monthly cap. Use this to form a valid propose_video_generation '
      + 'call. Optional projectId scopes to that tenant\'s policy.',
    parameters: z.object({ projectId: UUID.optional() }),
    requiredPermission: 'CREATIVE'
  },
  {
    name: 'list_video_generations',
    description: 'List recent video-generation jobs for an AV project (status, mode, model, cost, createdAt).',
    parameters: z.object({ projectId: UUID }),
    requiredPermission: 'CREATIVE'
  },
  {
    name: 'get_video_generation_status',
    description:
      'Check a video-generation job by id. Returns status and, when ready, the output asset URL. '
      + 'Poll after confirming a propose_video_generation.',
    parameters: z.object({ jobId: UUID }),
    requiredPermission: 'CREATIVE'
  },
  {
    name: 'get_timeline_context',
    description:
      'Read AV project timeline context for agent planning. Returns project, current timeline clips/assets, '
      + 'recent render/generation jobs, and derived creative version nodes. Read-only.',
    parameters: z.object({ projectId: UUID }),
    requiredPermission: 'CREATIVE'
  }
]

/** The video READ tools a role may call, as MCP manifests — empty unless the suite flag is on. */
export function projectVideoReadTools(
  role: string,
  suiteEnabled: boolean,
  options: { bypassPermissions?: boolean } = {}
): McpToolManifest[] {
  if (!suiteEnabled) return []
  return videoReadTools
    .filter(t => options.bypassPermissions || roleHasPermission(role, t.requiredPermission))
    .map(t => ({
      name: t.name,
      description: t.description,
      inputSchema: z.toJSONSchema(t.parameters) as Record<string, unknown>
    }))
}

/** Keep only AV projects the actor may use: admin/owner see all; everyone else sees their own. */
export function filterUsableAvProjects<T extends { mediaType: string, createdBy?: string | null }>(
  projects: T[],
  actor: { id: string, role: string }
): T[] {
  const all = actor.role === 'admin' || actor.role === 'owner'
  return projects.filter(p => p.mediaType === 'av' && (all || p.createdBy === actor.id))
}

export type VideoExecuteOutcome
  = | { ok: true, data: unknown }
    | { ok: false, error: string, code: 'disabled' | 'not_found' | 'forbidden' | 'bad_args' | 'handler_error' }

/** Injected execution for the read tools: name → runner. The real runner reaches the engine via ctx. */
export type VideoReadRunner = Record<string, (args: unknown, ctx: ToolContext) => Promise<unknown>>

/**
 * Execute ONE video READ tool. Defense-in-depth at the wire boundary, mirroring executeGenerationTool:
 *  - suite flag off → disabled · unknown tool → not_found · role lacks CREATIVE → forbidden
 *  - args fail Zod → bad_args (the host is untrusted) · runner missing/throws → handler_error
 * Never throws — every failure is a typed outcome.
 */
export async function executeVideoTool(
  name: string,
  args: unknown,
  ctx: ToolContext,
  deps: { enabled: boolean, runner: VideoReadRunner, bypassPermissions?: boolean }
): Promise<VideoExecuteOutcome> {
  if (!deps.enabled) return { ok: false, error: 'Video tools are not enabled over MCP.', code: 'disabled' }

  const tool = videoReadTools.find(t => t.name === name)
  if (!tool) return { ok: false, error: `Unknown video tool: ${name}`, code: 'not_found' }

  if (!deps.bypassPermissions && !roleHasPermission(ctx.userRole, tool.requiredPermission)) {
    return { ok: false, error: 'Not permitted.', code: 'forbidden' }
  }

  const parsed = tool.parameters.safeParse(args)
  if (!parsed.success) return { ok: false, error: 'Invalid arguments.', code: 'bad_args' }

  const run = deps.runner[name]
  if (!run) return { ok: false, error: 'No runner registered for tool.', code: 'handler_error' }

  try {
    return { ok: true, data: await run(parsed.data, ctx) }
  } catch {
    return { ok: false, error: 'Video tool failed.', code: 'handler_error' }
  }
}

// ── Confirm-tier propose/confirm (Phase 2b §4.2) ───────────────────────────────
// These BILL and create state, so they are two-step over the dormant 2c machinery: propose_* persists
// an ai_pending_actions row (source='mcp', conv_id NULL) and previews cost+compliance WITHOUT spending;
// confirm_action(proposalId) atomically claims it and dispatches (reserve+enqueue / create project).
// Gated by MCP_VIDEO_TOOLS_ENABLED AND MCP_VIDEO_GEN_ENABLED. The tool_names below are the
// ai_pending_actions.tool_name values + dispatchVideoConfirm routing keys — deliberately NOT in
// MCP_WRITE_SAFE_ACTIONS and NOT in the executor registry (video has no in-app chat equivalent).

export const VIDEO_CONFIRM_ACTIONS = ['video_generation', 'video_project_create', 'video_timeline_edit'] as const
export type VideoConfirmAction = typeof VIDEO_CONFIRM_ACTIONS[number]

const VideoGenParams = z.object({
  projectId: UUID,
  mode: z.enum(['text-to-video', 'image-to-video', 'video-extension', 'lip-sync']),
  modelId: z.string().min(1),
  prompt: z.string().min(1).max(4000),
  sourceAssetIds: z.array(z.string()).default([]),
  durationSeconds: z.number().int().positive().max(60),
  aspectRatio: z.string().min(1),
  resolution: z.string().nullable().optional(),
  subjectType: z.enum(['vehicle', 'non_vehicle', 'unknown']).default('unknown')
})
const VideoProjectParams = z.object({ title: z.string().min(1).max(200), clientId: UUID.nullable().optional() })
const TimelineEditOperation = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('insert'),
    trackId: z.string().min(1),
    assetId: z.string().min(1).optional(),
    r2Key: z.string().min(1).optional(),
    timelineStartSec: z.number().min(0),
    durationSec: z.number().positive()
  }),
  z.object({
    type: z.literal('trim'),
    clipId: z.string().min(1),
    sourceInSec: z.number().min(0),
    sourceOutSec: z.number().positive()
  }),
  z.object({
    type: z.literal('replace'),
    clipId: z.string().min(1),
    assetId: z.string().min(1).optional(),
    r2Key: z.string().min(1).optional()
  }),
  z.object({
    type: z.literal('add-overlay'),
    text: z.string().min(1).max(500).optional(),
    r2Key: z.string().min(1).optional(),
    timelineStartSec: z.number().min(0),
    durationSec: z.number().positive()
  })
])
const TimelineEditParams = z.object({
  projectId: UUID,
  reason: z.string().max(500).optional(),
  operations: z.array(TimelineEditOperation).min(1).max(20)
})

export const videoProposeTools: VideoToolDescriptor[] = [
  {
    name: 'propose_video_generation',
    description:
      'Propose (does NOT spend yet) a video generation into an AV project. Returns a proposalId with the '
      + 'estimated cost + compliance classification + resolved model/params. Call confirm_action(proposalId) '
      + 'to reserve budget and start it. Modes: text-to-video needs no source; image-to-video / video-extension '
      + '/ lip-sync need source asset ids registered in-app.',
    parameters: VideoGenParams,
    requiredPermission: 'CREATIVE'
  },
  {
    name: 'create_video_project',
    description:
      'Propose creating a new empty AV project to generate video into. Returns a proposalId; call '
      + 'confirm_action(proposalId) to create it. Use when no suitable project exists (see list_av_projects).',
    parameters: VideoProjectParams,
    requiredPermission: 'CREATIVE'
  },
  {
    name: 'propose_timeline_edit',
    description:
      'Propose timeline edits for human review. Supports insert, trim, replace, and add-overlay operations. '
      + 'This does not mutate the timeline directly; it stores an audit-ready proposal for in-app review.',
    parameters: TimelineEditParams,
    requiredPermission: 'CREATIVE'
  }
]

/** Which confirm-tier video action a propose tool targets; null for anything else. */
export function resolveVideoProposeAction(name: string): VideoConfirmAction | null {
  if (name === 'propose_video_generation') return 'video_generation'
  if (name === 'create_video_project') return 'video_project_create'
  if (name === 'propose_timeline_edit') return 'video_timeline_edit'
  return null
}

export type VideoProposeOutcome
  = | { ok: true, data: unknown }
    | { ok: false, error: string, code: 'disabled' | 'forbidden' | 'bad_args' | 'blocked' | 'handler_error' }

export interface VideoProposeDeps {
  suiteEnabled: boolean
  genEnabled: boolean
  bypassPermissions?: boolean
  resolveProject: (projectId: string, ctx: ToolContext) => Promise<ResolvedAvProject | null>
  getModel: (modelId: string) => VideoGenerationModel | null | undefined
  isTenantModel: (model: VideoGenerationModel) => boolean
  loadSources: (ids: string[], tenantId: string | undefined, mode: string) => Promise<VideoGenerationSourceAsset[]>
  loadPolicy: (tenantId: string) => Promise<VideoGenerationTenantPolicy>
  evaluateCompliance: (input: EvaluateVideoGenerationComplianceInput) => VideoGenerationComplianceResult
  estimateCost: (model: VideoGenerationModel, durationSeconds: number) => number
  /** Persist an ai_pending_actions row (tool_name = action) and return its id. */
  persist: (ctx: ToolContext, action: VideoConfirmAction, payload: unknown) => Promise<string>
}

function modelSupports(model: VideoGenerationModel, p: z.infer<typeof VideoGenParams>): boolean {
  if (!model.modes.includes(p.mode)) return false
  if (!model.durationsSeconds.includes(p.durationSeconds)) return false
  if (!model.aspectRatios.includes(p.aspectRatio)) return false
  if (p.resolution && !model.resolutions.includes(p.resolution)) return false
  if (p.subjectType !== 'unknown' && !model.allowedSubjectTypes.includes(p.subjectType)) return false
  if (model.requiresApprovedSourceAsset && p.sourceAssetIds.length === 0) return false
  return true
}

/**
 * Propose a confirm-tier video action. Never throws. Spends nothing — at most persists a pending row.
 *  - either flag off → disabled · role lacks CREATIVE → forbidden · args fail Zod → bad_args
 *  - project absent/non-AV/not-owned → forbidden · unknown model or unsupported params → bad_args
 *  - compliance disallows → blocked (NO confirmable proposal persisted)
 */
export async function executeVideoPropose(
  action: VideoConfirmAction, args: unknown, ctx: ToolContext, deps: VideoProposeDeps
): Promise<VideoProposeOutcome> {
  if (!deps.suiteEnabled) return { ok: false, error: 'Video tools are not enabled over MCP.', code: 'disabled' }
  if ((action === 'video_generation' || action === 'video_project_create') && !deps.genEnabled) {
    return { ok: false, error: 'Video generation is not enabled over MCP.', code: 'disabled' }
  }
  if (!deps.bypassPermissions && !roleHasPermission(ctx.userRole, 'CREATIVE')) {
    return { ok: false, error: 'Not permitted.', code: 'forbidden' }
  }

  if (action === 'video_timeline_edit') {
    const parsed = TimelineEditParams.safeParse(args)
    if (!parsed.success) return { ok: false, error: 'Invalid arguments.', code: 'bad_args' }
    try {
      const existing = await deps.resolveProject(parsed.data.projectId, ctx)
      if (!existing) return { ok: false, error: 'Project not found or not an AV project you can use.', code: 'forbidden' }
      const proposalId = await deps.persist(ctx, 'video_timeline_edit', {
        projectId: parsed.data.projectId,
        timelineId: existing.timeline?.id ?? existing.project.currentTimelineId ?? null,
        reason: parsed.data.reason ?? null,
        operations: parsed.data.operations,
        reviewRequired: true
      } satisfies VideoTimelineEditPendingPayload)
      return {
        ok: true,
        data: {
          proposalId,
          kind: 'video_timeline_edit',
          operationCount: parsed.data.operations.length,
          requiresReview: true
        }
      }
    } catch {
      return { ok: false, error: 'Propose failed.', code: 'handler_error' }
    }
  }

  if (action === 'video_project_create') {
    const parsed = VideoProjectParams.safeParse(args)
    if (!parsed.success) return { ok: false, error: 'Invalid arguments.', code: 'bad_args' }
    try {
      const proposalId = await deps.persist(ctx, 'video_project_create', { title: parsed.data.title, clientId: parsed.data.clientId ?? null })
      return { ok: true, data: { proposalId, kind: 'video_project_create', title: parsed.data.title } }
    } catch {
      return { ok: false, error: 'Propose failed.', code: 'handler_error' }
    }
  }

  // video_generation
  const parsed = VideoGenParams.safeParse(args)
  if (!parsed.success) return { ok: false, error: 'Invalid arguments.', code: 'bad_args' }
  const p = parsed.data
  try {
    const existing = await deps.resolveProject(p.projectId, ctx)
    if (!existing) return { ok: false, error: 'Project not found or not an AV project you can use.', code: 'forbidden' }

    const model = deps.getModel(p.modelId)
    if (!model || !deps.isTenantModel(model)) return { ok: false, error: 'Unknown or unavailable model.', code: 'bad_args' }
    if (!modelSupports(model, p)) return { ok: false, error: 'Model does not support the requested mode/params.', code: 'bad_args' }

    const tenantId = existing.project.clientId ?? 'agency'
    let sources: VideoGenerationSourceAsset[] = []
    try {
      sources = await deps.loadSources(p.sourceAssetIds, p.mode === 'image-to-video' ? tenantId : undefined, p.mode)
    } catch {
      return { ok: false, error: 'Source image unavailable.', code: 'bad_args' }
    }
    const policy = await deps.loadPolicy(tenantId)

    // Compliance only checks provenance.idempotencyKey for PRESENCE — the real key is derived from the
    // proposalId at confirm. A stable placeholder here satisfies the gate without affecting the verdict.
    const compliance = deps.evaluateCompliance({
      mode: p.mode, prompt: p.prompt, model, sourceAssets: sources, requestedSubjectType: p.subjectType,
      tenantPolicy: policy,
      provenance: { userId: ctx.userId, tenantId, projectId: p.projectId, idempotencyKey: 'mcp-preview' }
    })
    if (!compliance.allowed) return { ok: false, error: `Blocked: ${compliance.reasons.join('; ') || 'compliance'}`, code: 'blocked' }

    const estimatedCostCents = deps.estimateCost(model, p.durationSeconds)
    const payload = {
      tenantId,
      projectId: p.projectId,
      timelineId: existing.timeline?.id ?? existing.project.currentTimelineId ?? null,
      mode: p.mode, modelId: model.id, provider: model.provider, prompt: p.prompt,
      sourceAssetIds: p.sourceAssetIds, durationSeconds: p.durationSeconds, aspectRatio: p.aspectRatio,
      resolution: p.resolution ?? null, subjectType: p.subjectType,
      complianceStatus: compliance.classification, complianceReasons: compliance.reasons, estimatedCostCents
    }
    const proposalId = await deps.persist(ctx, 'video_generation', payload)
    return {
      ok: true,
      data: {
        proposalId, kind: 'video_generation', estimatedCostCents,
        complianceClassification: compliance.classification, resolvedModel: model.id,
        resolvedParams: { mode: p.mode, durationSeconds: p.durationSeconds, aspectRatio: p.aspectRatio }
      }
    }
  } catch {
    return { ok: false, error: 'Propose failed.', code: 'handler_error' }
  }
}

// ── Confirm dispatch ───────────────────────────────────────────────────────────
// Called by the shared confirm_action path AFTER the atomic single-use claim. Returns null when the
// claimed tool_name is not a video action (so the 2c safe-action path handles it). Unlike the generic
// 2c executor (which can only return a result or throw → handler_error), this maps the budget
// reservation outcome to a clean cap_exceeded, and returns the new jobId / projectId.

export interface ClaimedRow { tool_name: string, resolved_payload: unknown }

export type VideoConfirmOutcome
  = | { ok: true, data: unknown }
    | { ok: false, error: string, code: 'forbidden' | 'cap_exceeded' | 'handler_error' }

export interface VideoConfirmDeps {
  genEnabled: boolean
  reserve: (payload: VideoGenerationPendingPayload, ctx: ToolContext) => Promise<{ ok: boolean, reason?: string, remainingCents?: number, job?: { id: string }, reused?: boolean }>
  enqueue: (payload: VideoGenerationPendingPayload, jobId: string, ctx: ToolContext) => Promise<void>
  createProject: (payload: VideoProjectPendingPayload, ctx: ToolContext) => Promise<{ projectId: string }>
}

export async function dispatchVideoConfirm(
  row: ClaimedRow, ctx: ToolContext, deps: VideoConfirmDeps
): Promise<VideoConfirmOutcome | null> {
  if (!(VIDEO_CONFIRM_ACTIONS as readonly string[]).includes(row.tool_name)) return null
  if (row.tool_name === 'video_timeline_edit') {
    return { ok: false, error: 'Timeline edit proposals require in-app review before execution.', code: 'forbidden' }
  }
  if (!deps.genEnabled) return { ok: false, error: 'Video generation is not enabled over MCP.', code: 'forbidden' }
  try {
    if (row.tool_name === 'video_project_create') {
      const { projectId } = await deps.createProject(row.resolved_payload as VideoProjectPendingPayload, ctx)
      return { ok: true, data: { projectId } }
    }
    // video_generation
    const payload = row.resolved_payload as VideoGenerationPendingPayload
    const reservation = await deps.reserve(payload, ctx)
    if (!reservation.ok || !reservation.job) {
      return { ok: false, error: `Budget unavailable (${reservation.reason ?? 'cap'}).`, code: 'cap_exceeded' }
    }
    // Lost the race to a concurrent same-key request inside the lock → do not re-enqueue.
    if (!reservation.reused) await deps.enqueue(payload, reservation.job.id, ctx)
    return { ok: true, data: { jobId: reservation.job.id, status: 'queued' } }
  } catch {
    return { ok: false, error: 'Execution failed.', code: 'handler_error' }
  }
}

// ── Full suite projection ──────────────────────────────────────────────────────
// reads (suite flag) + propose/create + confirm_action (suite AND gen flags). The shared confirm_action
// is emitted here when gen is on; tools.post.ts dedupes by name so it appears once even when 2c also
// emits it. A non-CREATIVE role gets nothing.

export type VideoFlags = { suite: boolean, gen: boolean }

export function projectVideoTools(
  role: string,
  flags: VideoFlags,
  options: { bypassPermissions?: boolean, confirmDescription?: string } = {}
): McpToolManifest[] {
  if (!flags.suite) return []
  if (!options.bypassPermissions && !roleHasPermission(role, 'CREATIVE')) return []
  const reads = projectVideoReadTools(role, true, options)
  if (!flags.gen) return reads
  const proposes = videoProposeTools.map(t => ({
    name: t.name,
    description: t.description,
    inputSchema: z.toJSONSchema(t.parameters) as Record<string, unknown>
  }))
  return [
    ...reads,
    ...proposes,
    projectConfirmActionManifest(options.confirmDescription ?? MCP_VIDEO_CONFIRM_DESCRIPTION)
  ]
}

/** Registered video/media-suite adapter. */
export function projectVideoMcpSuite(context: McpProjectionContext): McpToolManifest[] {
  return projectVideoTools(
    context.role,
    {
      suite: context.governanceBypass || context.suiteFlags.video,
      gen: context.governanceBypass || context.suiteFlags.videoGeneration
    },
    {
      bypassPermissions: context.governanceBypass,
      confirmDescription: resolveRegisteredConfirmDescription(context)
    }
  )
}

/** Complete executable descriptors for video/media reads and proposal writers. */
export function resolveVideoMcpExecutions(): McpExecutionDescriptor[] {
  const reads = videoReadTools.map(descriptor => ({
    name: descriptor.name,
    canonicalName: descriptor.name,
    kind: 'supplemental' as const,
    tool: {
      ...descriptor,
      mutates: false,
      handler: async (args: unknown, ctx: ToolContext): Promise<ToolResult> => {
        const { buildVideoReadRunner } = await import('./videoRunner')
        const outcome = await executeVideoTool(descriptor.name, args, ctx, {
          enabled: true,
          bypassPermissions: true,
          runner: buildVideoReadRunner()
        })
        return outcome.ok
          ? { ok: true, data: outcome.data }
          : { ok: false, error: 'error' in outcome ? outcome.error : 'Video tool failed.' }
      }
    }
  }))
  const proposals = videoProposeTools.map(descriptor => ({
    name: descriptor.name,
    canonicalName: descriptor.name,
    kind: 'supplemental' as const,
    tool: {
      ...descriptor,
      mutates: true,
      handler: async (args: unknown, ctx: ToolContext): Promise<ToolResult> => {
        const action = resolveVideoProposeAction(descriptor.name)
        if (!action) return { ok: false, error: 'Video action is unavailable.' }
        const { buildVideoProposeDeps } = await import('./videoRunner')
        const outcome = await executeVideoPropose(action, args, ctx, {
          suiteEnabled: true,
          genEnabled: true,
          bypassPermissions: true,
          ...buildVideoProposeDeps()
        })
        return outcome.ok
          ? { ok: true, data: outcome.data }
          : { ok: false, error: 'error' in outcome ? outcome.error : 'Video proposal failed.' }
      }
    }
  }))
  return [...reads, ...proposals]
}
