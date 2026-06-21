import { z } from 'zod'
import { roleHasPermission } from '~~/server/utils/permissions'
import type { PermissionGroup } from '~~/server/utils/permissions'
import type { ToolContext } from '~~/server/utils/ai/toolContext'
import type { McpToolManifest } from './project'

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
  }
]

/** The video READ tools a role may call, as MCP manifests — empty unless the suite flag is on. */
export function projectVideoReadTools(role: string, suiteEnabled: boolean): McpToolManifest[] {
  if (!suiteEnabled) return []
  return videoReadTools
    .filter(t => roleHasPermission(role, t.requiredPermission))
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
  deps: { enabled: boolean, runner: VideoReadRunner }
): Promise<VideoExecuteOutcome> {
  if (!deps.enabled) return { ok: false, error: 'Video tools are not enabled over MCP.', code: 'disabled' }

  const tool = videoReadTools.find(t => t.name === name)
  if (!tool) return { ok: false, error: `Unknown video tool: ${name}`, code: 'not_found' }

  if (!roleHasPermission(ctx.userRole, tool.requiredPermission)) {
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

export const VIDEO_CONFIRM_ACTIONS = ['video_generation', 'video_project_create'] as const
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
  }
]

/** Which confirm-tier video action a propose tool targets; null for anything else. */
export function resolveVideoProposeAction(name: string): VideoConfirmAction | null {
  if (name === 'propose_video_generation') return 'video_generation'
  if (name === 'create_video_project') return 'video_project_create'
  return null
}

export type VideoProposeOutcome
  = | { ok: true, data: unknown }
    | { ok: false, error: string, code: 'disabled' | 'forbidden' | 'bad_args' | 'blocked' | 'handler_error' }

export interface VideoProposeDeps {
  suiteEnabled: boolean
  genEnabled: boolean
  resolveProject: (projectId: string, ctx: ToolContext) => Promise<{ project: any, timeline: any } | null>
  getModel: (modelId: string) => any | null
  isTenantModel: (model: any) => boolean
  loadSources: (ids: string[], tenantId: string | undefined, mode: string) => Promise<any[]>
  loadPolicy: (tenantId: string) => Promise<any>
  evaluateCompliance: (input: any) => { allowed: boolean, classification: string, reasons: string[] }
  estimateCost: (model: any, durationSeconds: number) => number
  /** Persist an ai_pending_actions row (tool_name = action) and return its id. */
  persist: (ctx: ToolContext, action: VideoConfirmAction, payload: unknown) => Promise<string>
}

function modelSupports(model: any, p: z.infer<typeof VideoGenParams>): boolean {
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
  if (!deps.suiteEnabled || !deps.genEnabled) return { ok: false, error: 'Video generation is not enabled over MCP.', code: 'disabled' }
  if (!roleHasPermission(ctx.userRole, 'CREATIVE')) return { ok: false, error: 'Not permitted.', code: 'forbidden' }

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
    let sources: any[] = []
    try {
      sources = await deps.loadSources(p.sourceAssetIds, p.mode === 'image-to-video' ? tenantId : undefined, p.mode)
    } catch {
      return { ok: false, error: 'Source image unavailable.', code: 'bad_args' }
    }
    const policy = await deps.loadPolicy(tenantId)

    const compliance = deps.evaluateCompliance({
      mode: p.mode, prompt: p.prompt, model, sourceAssets: sources, requestedSubjectType: p.subjectType,
      tenantPolicy: policy, provenance: { userId: ctx.userId, tenantId, projectId: p.projectId }
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
  reserve: (payload: any, ctx: ToolContext) => Promise<{ ok: boolean, reason?: string, remainingCents?: number, job?: any, reused?: boolean }>
  enqueue: (payload: any, jobId: string, ctx: ToolContext) => Promise<void>
  createProject: (payload: any, ctx: ToolContext) => Promise<{ projectId: string }>
}

export async function dispatchVideoConfirm(
  row: ClaimedRow, ctx: ToolContext, deps: VideoConfirmDeps
): Promise<VideoConfirmOutcome | null> {
  if (!(VIDEO_CONFIRM_ACTIONS as readonly string[]).includes(row.tool_name)) return null
  if (!deps.genEnabled) return { ok: false, error: 'Video generation is not enabled over MCP.', code: 'forbidden' }
  try {
    if (row.tool_name === 'video_project_create') {
      const { projectId } = await deps.createProject(row.resolved_payload, ctx)
      return { ok: true, data: { projectId } }
    }
    // video_generation
    const reservation = await deps.reserve(row.resolved_payload, ctx)
    if (!reservation.ok || !reservation.job) {
      return { ok: false, error: `Budget unavailable (${reservation.reason ?? 'cap'}).`, code: 'cap_exceeded' }
    }
    // Lost the race to a concurrent same-key request inside the lock → do not re-enqueue.
    if (!reservation.reused) await deps.enqueue(row.resolved_payload, reservation.job.id, ctx)
    return { ok: true, data: { jobId: reservation.job.id, status: 'queued' } }
  } catch {
    return { ok: false, error: 'Execution failed.', code: 'handler_error' }
  }
}
