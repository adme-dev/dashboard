import type { ToolContext } from '~~/server/utils/ai/toolContext'
import {
  filterUsableAvProjects,
  type VideoReadRunner,
  type VideoConfirmAction,
  type VideoGenerationPendingPayload,
  type VideoProjectPendingPayload,
  type CreativePromotionPendingPayload
} from './videoTools'
import { listProjects, getProjectWithCurrentTimeline, createProject, listRenderJobs } from '~~/server/utils/audio/projects'
import { listSelectableVideoGenerationModels, getVideoGenerationModel } from '~~/server/utils/video-generation/modelRegistry'
import { selectableVideoModelOptions } from '~~/app/utils/video/modelPresentation'
import { loadTenantVideoGenerationPolicy } from '~~/server/utils/video-generation/policy'
import { canUseVideoGenerationProject } from '~~/server/utils/video-generation/timelineStillSource'
import { getVideoGenerationJob, listVideoGenerationJobsForProject, listVideoGenerationJobsForProjects, markVideoGenerationJobFailed } from '~~/server/utils/video-generation/jobs'
import { listApprovedVideoGenerationSourceAssets } from '~~/server/utils/video-generation/sourceAssetStore'
import { isTenantModel } from '~~/server/utils/video-generation/surface'
import { loadVideoGenerationSourceAssets } from '~~/server/utils/video-generation/sourceAssets'
import { evaluateVideoGenerationCompliance } from '~~/server/utils/video-generation/compliance'
import { estimateVideoGenerationCostCents } from '~~/server/utils/video-generation/costs'
import { reserveAndCreateVideoGenerationJob } from '~~/server/utils/video-generation/budget'
import { enqueueVideoGeneration } from '~~/server/utils/video-generation/enqueue'
import { resolveSourceAssetUrls } from '~~/server/utils/video-generation/resolveSourceUrls'
import { emptyAvTimeline } from '~~/server/utils/audio/timelineSchema'
import { proposeAction } from '~~/server/utils/ai/pendingActions'
import { buildCreativeVersionGraph, mapMediaRenderJobToVersionSource } from '~~/server/utils/creative/versionGraph'
import { findCreativeAssetById } from '~~/server/utils/ai/tools/creativeAssets'
import { promoteCreativeAssetToVideoSource } from '~~/server/utils/video-generation/promoteCreativeAsset'

/**
 * MCP Phase 2b — the REAL video runner (the binding-dependent half of videoTools.ts). Wraps the exact
 * engine functions the in-app HTTP handlers use (video/generation/models,jobs,jobs/[id]) but driven by
 * ctx.userId (resolved by the internal endpoint from the OAuth assertion) instead of a session. RBAC/
 * flag/arg gating is already done by executeVideoTool / executeVideoPropose before any of this runs.
 */

interface ModelsArgs { projectId?: string }
interface ListArgs { projectId?: string }
interface SourceAssetsArgs { projectId: string }
interface StatusArgs { jobId: string }
interface TimelineContextArgs { projectId: string }

/**
 * Resolve + authorize a projectId for the actor. Returns the project + current timeline, or null when
 * the project is absent, not AV, or the actor may not use it (caller maps null → not_found/forbidden).
 * Exported so the propose deps (Task 5) reuse the exact same gate.
 */
export async function authorizedProject(projectId: string, ctx: ToolContext) {
  const existing = await getProjectWithCurrentTimeline(projectId)
  if (!existing || existing.project.mediaType !== 'av') return null
  if (!canUseVideoGenerationProject({ id: ctx.userId, role: ctx.userRole }, existing.project)) return null
  return existing
}

export function buildVideoReadRunner(): VideoReadRunner {
  return {
    list_av_projects: async (_raw, ctx) => {
      const all = await listProjects()
      return filterUsableAvProjects(all, { id: ctx.userId, role: ctx.userRole }).map(p => ({
        id: p.id,
        title: p.title,
        clientId: p.clientId ?? null,
        isTest: p.isTest ?? false,
        hasTimeline: !!p.currentTimelineId
      }))
    },

    list_video_models: async (raw, ctx) => {
      const a = raw as ModelsArgs
      const models = selectableVideoModelOptions(listSelectableVideoGenerationModels())
      if (!a.projectId) return { models, policy: { enabled: true } }
      const existing = await authorizedProject(a.projectId, ctx)
      if (!existing) throw new Error('project not usable')
      const policy = await loadTenantVideoGenerationPolicy(existing.project.clientId ?? 'agency')
      return {
        models: policy.enabled ? models : [],
        policy: { enabled: policy.enabled, monthlyCapCents: policy.monthlyCapCents }
      }
    },

    list_video_generations: async (raw, ctx) => {
      const a = raw as ListArgs
      let jobs
      if (a.projectId) {
        const existing = await authorizedProject(a.projectId, ctx)
        if (!existing) throw new Error('project not usable')
        jobs = await listVideoGenerationJobsForProject(a.projectId, 50)
      } else {
        const projects = filterUsableAvProjects(await listProjects(), { id: ctx.userId, role: ctx.userRole })
        jobs = await listVideoGenerationJobsForProjects(projects.map(project => project.id), 50)
      }
      return jobs.map(j => ({
        jobId: j.id,
        projectId: j.projectId,
        status: j.status,
        mode: j.mode,
        modelId: j.modelId,
        estimatedCostCents: j.estimatedCostCents,
        actualCostCents: j.actualCostCents,
        createdAt: j.createdAt
      }))
    },

    list_video_source_assets: async (raw, ctx) => {
      const a = raw as SourceAssetsArgs
      const existing = await authorizedProject(a.projectId, ctx)
      if (!existing) throw new Error('project not usable')
      const tenantId = existing.project.clientId ?? 'agency'
      const assets = await listApprovedVideoGenerationSourceAssets(tenantId)
      return assets.map(asset => ({
        assetId: asset.id,
        filename: asset.original_filename || asset.r2_key.split('/').pop() || null,
        clientId: asset.client_id,
        approvalStatus: asset.status,
        dimensions: asset.width && asset.height ? { width: asset.width, height: asset.height } : null,
        contentType: asset.content_type ?? null,
        subjectType: asset.subject_type ?? 'unknown',
        sourceSystem: asset.source_system ?? null,
        sourceAssetRef: asset.source_asset_ref ?? null,
        createdAt: asset.created_at ?? null,
      }))
    },

    get_video_generation_status: async (raw, ctx) => {
      const a = raw as StatusArgs
      const job = await getVideoGenerationJob(a.jobId)
      if (!job) return { status: 'not_found' }
      const existing = await authorizedProject(job.projectId, ctx)
      if (!existing) throw new Error('job not usable')
      return {
        jobId: job.id,
        status: job.status,
        providerStatus: job.providerStatus,
        outputAssetId: job.outputAssetId,
        assetUrl: job.providerResultUrl ?? null,
        estimatedCostCents: job.estimatedCostCents,
        actualCostCents: job.actualCostCents,
        error: job.errorMessage ?? null
      }
    },

    get_timeline_context: async (raw, ctx) => {
      const a = raw as TimelineContextArgs
      const existing = await authorizedProject(a.projectId, ctx)
      if (!existing) throw new Error('project not usable')

      const renderJobs = await listRenderJobs(a.projectId)
      const generationJobs = await listVideoGenerationJobsForProject(a.projectId, 20)
      const timelineNode = existing.timeline
        ? [{
            id: `timeline:${existing.timeline.id}`,
            assetType: 'video' as const,
            versionKind: 'original' as const,
            status: 'ready' as const,
            sourceRef: { source: 'media_timelines', id: existing.timeline.id },
            parentIds: [],
            label: existing.timeline.label ?? `Timeline v${existing.timeline.version}`,
            createdAt: existing.timeline.createdAt,
            metadata: { projectId: a.projectId, version: existing.timeline.version }
          }]
        : []
      const graph = buildCreativeVersionGraph([
        ...timelineNode,
        ...renderJobs.map(job => mapMediaRenderJobToVersionSource(job as unknown as Record<string, unknown>))
      ])

      return {
        project: {
          id: existing.project.id,
          title: existing.project.title,
          clientId: existing.project.clientId ?? null,
          currentTimelineId: existing.project.currentTimelineId ?? null
        },
        timeline: existing.timeline
          ? {
              id: existing.timeline.id,
              version: existing.timeline.version,
              clips: timelineClips(existing.timeline.state)
            }
          : null,
        assets: timelineAssets(existing.timeline?.state),
        renderJobs: renderJobs.map(job => ({
          id: job.id,
          status: job.status,
          timelineId: job.timelineId,
          variants: job.variants,
          createdAt: job.createdAt
        })),
        generationJobs: generationJobs.map(job => ({
          id: job.id,
          status: job.status,
          mode: job.mode,
          modelId: job.modelId,
          outputAssetId: job.outputAssetId,
          createdAt: job.createdAt
        })),
        versions: graph.nodes.map(node => ({
          id: node.id,
          kind: node.versionKind,
          status: node.status,
          label: node.label,
          parentIds: node.parentIds,
          sourceRef: node.sourceRef
        })),
        findings: graph.findings
      }
    }
  }
}

function timelineClips(state: unknown): Array<Record<string, unknown>> {
  const clips: Array<Record<string, unknown>> = []
  const tracks = state && typeof state === 'object' && Array.isArray((state as { tracks?: unknown }).tracks)
    ? (state as { tracks: Array<Record<string, unknown>> }).tracks
    : []

  for (const track of tracks) {
    const trackClips = Array.isArray(track.clips) ? track.clips : []
    for (const rawClip of trackClips) {
      if (!rawClip || typeof rawClip !== 'object') continue
      const clip = rawClip as Record<string, unknown>
      clips.push({
        id: clip.id,
        type: clip.type ?? track.kind ?? null,
        trackId: track.id ?? null,
        assetId: clip.asset_id ?? clip.assetId ?? null,
        r2Key: clip.r2_key ?? clip.r2Key ?? null,
        timelineStartSec: clip.timeline_start_sec ?? clip.timelineStartSec ?? null,
        sourceInSec: clip.source_in_sec ?? clip.sourceInSec ?? null,
        sourceOutSec: clip.source_out_sec ?? clip.sourceOutSec ?? null
      })
    }
  }

  return clips
}

function timelineAssets(state: unknown): Array<Record<string, unknown>> {
  const byKey = new Map<string, Record<string, unknown>>()
  for (const clip of timelineClips(state)) {
    const assetId = typeof clip.assetId === 'string' ? clip.assetId : null
    const r2Key = typeof clip.r2Key === 'string' ? clip.r2Key : null
    if (!assetId && !r2Key) continue
    const key = assetId ?? r2Key ?? ''
    if (!byKey.has(key)) {
      byKey.set(key, {
        id: assetId,
        r2Key,
        type: clip.type ?? null
      })
    }
  }
  return [...byKey.values()]
}

/**
 * Injected engine deps for executeVideoPropose (the propose/preview half). Flags are supplied by the
 * endpoint. resolveProject reuses the exact authorize gate as the reads. persist stamps source='mcp'
 * with conversation_id NULL (the proposal lives outside any chat conversation).
 */
export function buildVideoProposeDeps() {
  return {
    resolveProject: authorizedProject,
    getModel: getVideoGenerationModel,
    isTenantModel,
    loadSources: (ids: string[], tenantId: string | undefined) => loadVideoGenerationSourceAssets(ids, tenantId),
    loadPolicy: (tenantId: string) => loadTenantVideoGenerationPolicy(tenantId),
    evaluateCompliance: (input: Parameters<typeof evaluateVideoGenerationCompliance>[0]) => evaluateVideoGenerationCompliance(input),
    estimateCost: (model: Parameters<typeof estimateVideoGenerationCostCents>[0], secs: number) => estimateVideoGenerationCostCents(model, secs),
    resolveCreativeAsset: findCreativeAssetById,
    persist: (ctx: ToolContext, action: VideoConfirmAction, payload: unknown) => proposeAction(ctx, null, action, payload)
  }
}

/**
 * Injected engine deps for dispatchVideoConfirm (the execute half). genEnabled is supplied by the
 * endpoint. The confirmed payload carries an idempotencyKey injected by the endpoint (derived from the
 * proposalId) so a double-confirm cannot double-bill — belt-and-braces over the 2c atomic single-use claim.
 */
export function buildVideoConfirmDeps() {
  return {
    reserve: async (payload: VideoGenerationPendingPayload, ctx: ToolContext) => {
      // The endpoint injects idempotencyKey (mcp:<proposalId>) before dispatch; defensive narrow.
      const idempotencyKey = payload.idempotencyKey
      if (!idempotencyKey) throw new Error('missing idempotencyKey at confirm')
      return reserveAndCreateVideoGenerationJob(
        {
          tenantId: payload.tenantId,
          projectId: payload.projectId,
          timelineId: payload.timelineId,
          createdBy: ctx.userId,
          status: 'queued',
          mode: payload.mode,
          modelId: payload.modelId,
          provider: payload.provider,
          prompt: payload.prompt,
          sourceAssetIds: payload.sourceAssetIds,
          durationSeconds: payload.durationSeconds,
          aspectRatio: payload.aspectRatio,
          resolution: payload.resolution,
          subjectType: payload.subjectType,
          complianceStatus: payload.complianceStatus,
          complianceReasons: payload.complianceReasons,
          estimatedCostCents: payload.estimatedCostCents,
          idempotencyKey
        },
        await loadTenantVideoGenerationPolicy(payload.tenantId)
      )
    },
    prepareEnqueue: async (payload: VideoGenerationPendingPayload) => {
      return payload.sourceAssetIds.length > 0
        ? await resolveSourceAssetUrls(payload.sourceAssetIds, payload.tenantId)
        : []
    },
    enqueue: async (payload: VideoGenerationPendingPayload, jobId: string, ctx: ToolContext, prepared?: unknown) => {
      const idempotencyKey = payload.idempotencyKey
      if (!idempotencyKey) throw new Error('missing idempotencyKey at confirm')
      const sourceAssetUrls = Array.isArray(prepared) ? prepared.map(String) : []
      await enqueueVideoGeneration(ctx.event, {
        jobId,
        tenantId: payload.tenantId,
        idempotencyKey,
        sourceAssetUrls
      })
    },
    createProject: async (payload: VideoProjectPendingPayload, ctx: ToolContext) => {
      const { project } = await createProject({
        createdBy: ctx.userId,
        clientId: payload.clientId ?? null,
        title: payload.title,
        mediaType: 'av',
        initialState: emptyAvTimeline()
      })
      return { projectId: project.id }
    },
    promoteCreativeAsset: (payload: CreativePromotionPendingPayload, ctx: ToolContext) =>
      promoteCreativeAssetToVideoSource(payload, ctx),
    markJobFailed: async (jobId: string, reason: string) => {
      await markVideoGenerationJobFailed(jobId, reason)
    }
  }
}
