import { z } from 'zod'
import { requireWriteAccess } from '~~/server/utils/auth'
import { getProjectWithCurrentTimeline } from '~~/server/utils/audio/projects'
import { estimateVideoGenerationCostCents } from '~~/server/utils/video-generation/costs'
import { evaluateVideoGenerationCompliance } from '~~/server/utils/video-generation/compliance'
import { enqueueVideoGeneration } from '~~/server/utils/video-generation/enqueue'
import { executeGodModeVideoGeneration } from '~~/server/utils/audio/godModeExternalMutations'
import {
  createVideoGenerationJob,
  getVideoGenerationJob, getVideoGenerationJobByIdempotencyKey,
  markVideoGenerationJobFailed,
} from '~~/server/utils/video-generation/jobs'
import { reserveAndCreateVideoGenerationJob } from '~~/server/utils/video-generation/budget'
import { resolveSourceAssetUrls } from '~~/server/utils/video-generation/resolveSourceUrls'
import { getVideoGenerationModel } from '~~/server/utils/video-generation/modelRegistry'
import { isTenantModel } from '~~/server/utils/video-generation/surface'
import { loadTenantVideoGenerationPolicy } from '~~/server/utils/video-generation/policy'
import { loadVideoGenerationSourceAssets } from '~~/server/utils/video-generation/sourceAssets'
import { canUseVideoGenerationProject } from '~~/server/utils/video-generation/timelineStillSource'
import { recordAiInvocation } from '~~/server/utils/ai/invocationLedger'

const BodySchema = z.object({
  projectId: z.string().uuid(),
  mode: z.enum(['text-to-video', 'image-to-video', 'video-extension', 'lip-sync']),
  modelId: z.string().min(1),
  prompt: z.string().min(1).max(4000),
  sourceAssetIds: z.array(z.string()).default([]),
  durationSeconds: z.number().int().positive().max(60),
  aspectRatio: z.string().min(1),
  resolution: z.string().nullable().optional(),
  subjectType: z.enum(['vehicle', 'non_vehicle', 'unknown']).default('unknown'),
  idempotencyKey: z.string().min(6).max(200),
})

function assertEnabled() {
  if (process.env.VIDEO_GENERATION_ENABLED !== 'true') {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }
}

function assertModelSupportsRequest(model: NonNullable<ReturnType<typeof getVideoGenerationModel>>, body: z.infer<typeof BodySchema>) {
  if (!model.modes.includes(body.mode)) {
    throw createError({ statusCode: 400, statusMessage: 'Model does not support the requested generation mode' })
  }
  if (!model.durationsSeconds.includes(body.durationSeconds)) {
    throw createError({ statusCode: 400, statusMessage: 'Model does not support the requested duration' })
  }
  if (!model.aspectRatios.includes(body.aspectRatio)) {
    throw createError({ statusCode: 400, statusMessage: 'Model does not support the requested aspect ratio' })
  }
  if (body.resolution && !model.resolutions.includes(body.resolution)) {
    throw createError({ statusCode: 400, statusMessage: 'Model does not support the requested resolution' })
  }
  if (body.subjectType !== 'unknown' && !model.allowedSubjectTypes.includes(body.subjectType)) {
    throw createError({ statusCode: 400, statusMessage: 'Model does not support the requested subject type' })
  }
  if (model.requiresApprovedSourceAsset && body.sourceAssetIds.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'A source image is required for this model' })
  }
  if (body.sourceAssetIds.length > 1 && !model.capabilities.endFrame) {
    throw createError({ statusCode: 400, statusMessage: 'Model does not support an explicit end frame' })
  }
  if (body.sourceAssetIds.length > 2) {
    throw createError({ statusCode: 400, statusMessage: 'At most one approved start frame and one approved end frame are supported' })
  }
}

function uuidOrNull(value: string | null | undefined): string | null {
  if (!value) return null
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : null
}

async function recordVideoGenerationRequest(input: {
  model: NonNullable<ReturnType<typeof getVideoGenerationModel>>
  userId: string
  tenantId: string
  projectId: string
  jobId: string
  mode: z.infer<typeof BodySchema>['mode']
  status?: 'success' | 'error'
  errorCode?: string | null
  estimatedCostCents: number
  metadata?: Record<string, unknown>
}) {
  await recordAiInvocation({
    featureKey: 'video_generation_job',
    provider: input.model.provider,
    modelId: input.model.cfModel ?? input.model.id,
    gatewayUsed: input.model.provider === 'aigateway',
    userId: input.userId,
    clientId: uuidOrNull(input.tenantId),
    estimatedCostUsd: input.estimatedCostCents / 100,
    status: input.status ?? 'success',
    errorCode: input.errorCode ?? null,
    metadata: {
      tenantId: input.tenantId,
      projectId: input.projectId,
      jobId: input.jobId,
      mode: input.mode,
      registryModelId: input.model.id,
      modality: input.model.modality ?? null,
      supportsNativeAudio: input.model.supportsNativeAudio,
      ...(input.metadata ?? {}),
    },
  })
}

export default defineEventHandler(async (event) => {
  assertEnabled()
  const user = await requireWriteAccess(event)
  const parsed = BodySchema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid video generation request',
      data: { errors: parsed.error.issues.map((issue) => issue.message) },
    })
  }
  const body = parsed.data

  const existing = await getProjectWithCurrentTimeline(body.projectId)
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Project not found' })
  if (existing.project.mediaType !== 'av') {
    throw createError({ statusCode: 400, statusMessage: 'Video generation requires an AV project' })
  }
  if (!canUseVideoGenerationProject(user, existing.project)) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }

  // Owners (God mode) run this under the execution ledger with a reserved job id so a
  // retried request replays the same job. The body idempotencyKey already dedupes for
  // everyone; the ledger adds the audit + ambiguous-dispatch handling owners require.
  return await executeGodModeVideoGeneration(event, async (run) => {
    if (run.replay) {
      const replayed = await getVideoGenerationJob(run.ids[0]!)
      if (!replayed) throw createError({ statusCode: 409, statusMessage: 'Replayed generation job no longer exists' })
      setResponseStatus(event, 202)
      return { job: replayed, reused: true }
    }
    const tenantId = existing.project.clientId ?? 'agency'
    const duplicate = await getVideoGenerationJobByIdempotencyKey(tenantId, body.idempotencyKey)
    if (duplicate) {
      if (duplicate.projectId !== body.projectId) {
        throw createError({ statusCode: 409, statusMessage: 'Idempotency key is already used for another project' })
      }
      setResponseStatus(event, 202)
      return { job: duplicate, reused: true }
    }

    const model = getVideoGenerationModel(body.modelId)
    if (!model) throw createError({ statusCode: 400, statusMessage: 'Unknown video generation model' })
    if (!isTenantModel(model)) {
      throw createError({ statusCode: 404, statusMessage: 'Not found' })
    }
    assertModelSupportsRequest(model, body)

    let sourceAssets = []
    try {
      sourceAssets = await loadVideoGenerationSourceAssets(
        body.sourceAssetIds,
        body.mode === 'image-to-video' ? tenantId : undefined
      )
    } catch (e: any) {
      throw createError({ statusCode: 400, statusMessage: `Source image unavailable: ${e?.message ?? 'unresolved'}` })
    }
    const tenantPolicy = await loadTenantVideoGenerationPolicy(tenantId)

    const compliance = evaluateVideoGenerationCompliance({
      mode: body.mode,
      prompt: body.prompt,
      model,
      sourceAssets,
      requestedSubjectType: body.subjectType,
      tenantPolicy,
      provenance: { userId: user.id, tenantId, projectId: body.projectId, idempotencyKey: body.idempotencyKey },
    })

    const estimatedCostCents = estimateVideoGenerationCostCents(model, body.durationSeconds)
    if (!compliance.allowed) {
      const blocked = await createVideoGenerationJob({
        tenantId,
        projectId: body.projectId,
        timelineId: existing.timeline?.id ?? existing.project.currentTimelineId ?? null,
        createdBy: user.id,
        status: 'blocked',
        mode: body.mode,
        modelId: model.id,
        provider: model.provider,
        prompt: body.prompt,
        sourceAssetIds: body.sourceAssetIds,
        durationSeconds: body.durationSeconds,
        aspectRatio: body.aspectRatio,
        resolution: body.resolution ?? null,
        subjectType: body.subjectType,
        complianceStatus: compliance.classification,
        complianceReasons: compliance.reasons,
        estimatedCostCents,
        idempotencyKey: body.idempotencyKey,
      })
      await recordVideoGenerationRequest({
        model,
        userId: user.id,
        tenantId,
        projectId: body.projectId,
        jobId: blocked.id,
        mode: body.mode,
        estimatedCostCents,
        status: 'error',
        errorCode: 'blocked_by_compliance',
        metadata: {
          queued: false,
          complianceStatus: compliance.classification,
          complianceReasons: compliance.reasons,
          durationSeconds: body.durationSeconds,
          aspectRatio: body.aspectRatio,
          resolution: body.resolution ?? null,
        },
      })
      throw createError({ statusCode: 422, statusMessage: 'Video generation blocked', data: { job: blocked, reasons: compliance.reasons } })
    }

    // Atomic per-tenant budget reservation + job insert (advisory-locked transaction).
    // Replaces the old check-then-insert, which could bust the monthly cap under concurrency.
    const reservation = await reserveAndCreateVideoGenerationJob(
      {
        tenantId,
        projectId: body.projectId,
        timelineId: existing.timeline?.id ?? existing.project.currentTimelineId ?? null,
        createdBy: user.id,
        status: 'queued',
        mode: body.mode,
        modelId: model.id,
        provider: model.provider,
        prompt: body.prompt,
        sourceAssetIds: body.sourceAssetIds,
        durationSeconds: body.durationSeconds,
        aspectRatio: body.aspectRatio,
        resolution: body.resolution ?? null,
        subjectType: body.subjectType,
        complianceStatus: compliance.classification,
        complianceReasons: compliance.reasons,
        estimatedCostCents,
        idempotencyKey: body.idempotencyKey,
        id: run.ids[0]!,
      },
      tenantPolicy
    )

    if (!reservation.ok || !reservation.job) {
      if (reservation.reason === 'idempotency_key_conflict') {
        throw createError({ statusCode: 409, statusMessage: 'Idempotency key is already used for another project' })
      }
      throw createError({
        statusCode: 402,
        statusMessage: 'Video generation budget unavailable',
        data: { allowed: false, reason: reservation.reason, remainingCents: reservation.remainingCents ?? 0 },
      })
    }
    const job = reservation.job

    // Lost the race to a concurrent same-key request inside the lock — return the existing job,
    // do not re-enqueue (the winning request already did).
    if (reservation.reused) {
      setResponseStatus(event, 202)
      return { job, reused: true }
    }

    let sourceAssetUrls: string[] = []
    if (body.mode === 'image-to-video') {
      try {
        sourceAssetUrls = await resolveSourceAssetUrls(body.sourceAssetIds, tenantId)
      } catch (e: any) {
        await markVideoGenerationJobFailed(job.id, `source resolution failed: ${e?.message ?? String(e)}`)
        await recordVideoGenerationRequest({
          model,
          userId: user.id,
          tenantId,
          projectId: body.projectId,
          jobId: job.id,
          mode: body.mode,
          estimatedCostCents,
          status: 'error',
          errorCode: 'source_resolution_failed',
          metadata: {
            queued: false,
            sourceAssetCount: body.sourceAssetIds.length,
            errorMessage: e?.message ?? String(e),
          },
        })
        throw createError({ statusCode: 400, statusMessage: `Source image unavailable: ${e?.message ?? 'unresolved'}` })
      }
    }
    await enqueueVideoGeneration(event, { jobId: job.id, tenantId, idempotencyKey: body.idempotencyKey, sourceAssetUrls })
    await run.markDispatched()
    await recordVideoGenerationRequest({
      model,
      userId: user.id,
      tenantId,
      projectId: body.projectId,
      jobId: job.id,
      mode: body.mode,
      estimatedCostCents,
      metadata: {
        queued: true,
        sourceAssetCount: body.sourceAssetIds.length,
        resolvedSourceAssetUrlCount: sourceAssetUrls.length,
        durationSeconds: body.durationSeconds,
        aspectRatio: body.aspectRatio,
        resolution: body.resolution ?? null,
        complianceStatus: compliance.classification,
      },
    })
    setResponseStatus(event, 202)
    return { job, reused: false }
  })
})
