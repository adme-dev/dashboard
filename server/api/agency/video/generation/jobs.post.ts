import { z } from 'zod'
import { requireWriteAccess } from '~~/server/utils/auth'
import { getProjectWithCurrentTimeline } from '~~/server/utils/audio/projects'
import { canSpendVideoGenerationCents, estimateVideoGenerationCostCents } from '~~/server/utils/video-generation/costs'
import { evaluateVideoGenerationCompliance } from '~~/server/utils/video-generation/compliance'
import { enqueueVideoGeneration } from '~~/server/utils/video-generation/enqueue'
import {
  createVideoGenerationJob,
  getVideoGenerationJobByIdempotencyKey,
} from '~~/server/utils/video-generation/jobs'
import { getVideoGenerationModel } from '~~/server/utils/video-generation/modelRegistry'
import { isTenantModel } from '~~/server/utils/video-generation/surface'
import { getTenantVideoGenerationSpendCents, loadTenantVideoGenerationPolicy } from '~~/server/utils/video-generation/policy'
import { loadVideoGenerationSourceAssets } from '~~/server/utils/video-generation/sourceAssets'

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
  if (process.env.VIDEO_STUDIO_ENABLED !== 'true' || process.env.VIDEO_GENERATION_ENABLED !== 'true') {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }
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

  const tenantId = existing.project.clientId ?? 'agency'
  const duplicate = await getVideoGenerationJobByIdempotencyKey(tenantId, body.idempotencyKey)
  if (duplicate) {
    setResponseStatus(event, 202)
    return { job: duplicate, reused: true }
  }

  const model = getVideoGenerationModel(body.modelId)
  if (!model) throw createError({ statusCode: 400, statusMessage: 'Unknown video generation model' })
  if (!isTenantModel(model)) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }

  const [tenantPolicy, currentSpendCents, sourceAssets] = await Promise.all([
    loadTenantVideoGenerationPolicy(tenantId),
    getTenantVideoGenerationSpendCents(tenantId),
    loadVideoGenerationSourceAssets(body.sourceAssetIds),
  ])

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
    throw createError({ statusCode: 422, statusMessage: 'Video generation blocked', data: { job: blocked, reasons: compliance.reasons } })
  }

  const spendDecision = canSpendVideoGenerationCents(tenantPolicy, currentSpendCents, estimatedCostCents)
  if (!spendDecision.allowed) {
    throw createError({ statusCode: 402, statusMessage: 'Video generation budget unavailable', data: spendDecision })
  }

  const job = await createVideoGenerationJob({
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
  })

  await enqueueVideoGeneration(event, { jobId: job.id, tenantId, idempotencyKey: body.idempotencyKey })
  setResponseStatus(event, 202)
  return { job, reused: false }
})
