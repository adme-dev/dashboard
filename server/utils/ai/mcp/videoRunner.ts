import type { ToolContext } from '~~/server/utils/ai/toolContext'
import type { VideoReadRunner } from './videoTools'
import { filterUsableAvProjects } from './videoTools'
import { listProjects, getProjectWithCurrentTimeline } from '~~/server/utils/audio/projects'
import { listSelectableVideoGenerationModels } from '~~/server/utils/video-generation/modelRegistry'
import { selectableVideoModelOptions } from '~~/app/utils/video/modelPresentation'
import { loadTenantVideoGenerationPolicy } from '~~/server/utils/video-generation/policy'
import { canUseVideoGenerationProject } from '~~/server/utils/video-generation/timelineStillSource'
import { getVideoGenerationJob, listVideoGenerationJobsForProject } from '~~/server/utils/video-generation/jobs'

/**
 * MCP Phase 2b — the REAL video runner (the binding-dependent half of videoTools.ts). Wraps the exact
 * engine functions the in-app HTTP handlers use (video/generation/models,jobs,jobs/[id]) but driven by
 * ctx.userId (resolved by the internal endpoint from the OAuth assertion) instead of a session. RBAC/
 * flag/arg gating is already done by executeVideoTool / executeVideoPropose before any of this runs.
 */

interface ModelsArgs { projectId?: string }
interface ListArgs { projectId: string }
interface StatusArgs { jobId: string }

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
      const existing = await authorizedProject(a.projectId, ctx)
      if (!existing) throw new Error('project not usable')
      const jobs = await listVideoGenerationJobsForProject(a.projectId, 50)
      return jobs.map(j => ({
        jobId: j.id,
        status: j.status,
        mode: j.mode,
        modelId: j.modelId,
        estimatedCostCents: j.estimatedCostCents,
        actualCostCents: j.actualCostCents,
        createdAt: j.createdAt
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
    }
  }
}
