import { z } from 'zod'
import { requireWriteAccess } from '~~/server/utils/auth'
import { requireVideoProjectWriteAccess } from '~~/server/utils/video-asset-intelligence/access'
import { defaultModelForAction, getAssetIntelligenceAction, getAssetIntelligenceModel } from '~~/server/utils/video-asset-intelligence/registry'
import { createBlockedExtractionJob, createQueuedExtractionJob, getAssetProjectRelationship, getBucketItemProjectRelationship, markAssetIntelligenceJobFailed } from '~~/server/utils/video-asset-intelligence/db'
import { enqueueAssetIntelligence, getAssetIntelligenceQueue } from '~~/server/utils/video-asset-intelligence/enqueue'
import type { AssetIntelligenceActionId } from '~~/server/utils/video-asset-intelligence/registry'
import { recordAiInvocation } from '~~/server/utils/ai/invocationLedger'

const QUEUE_SUPPORTED_ACTIONS = new Set<AssetIntelligenceActionId>([
  'asset-analysis',
  'erase-fill',
  'mask-only',
  'image-edit',
])

function queueSupportsExtractionInput(action: AssetIntelligenceActionId, modelId: string | null): boolean {
  if (!QUEUE_SUPPORTED_ACTIONS.has(action)) return false
  if (!modelId) return true
  return defaultModelForAction(action)?.id === modelId
}

async function recordAssetIntelligenceRequest(input: {
  action: AssetIntelligenceActionId
  modelId: string
  provider: string
  gatewayProvider?: string | null
  userId: string
  projectId: string
  sourceAssetId: string
  jobId: string
  status?: 'success' | 'error'
  errorCode?: string | null
  metadata?: Record<string, unknown>
}) {
  await recordAiInvocation({
    featureKey: 'video_asset_intelligence_job',
    provider: input.provider,
    modelId: input.modelId,
    gatewayUsed: input.gatewayProvider === 'workers-ai',
    userId: input.userId,
    status: input.status ?? 'success',
    errorCode: input.errorCode ?? null,
    metadata: {
      projectId: input.projectId,
      sourceAssetId: input.sourceAssetId,
      jobId: input.jobId,
      action: input.action,
      gatewayProvider: input.gatewayProvider ?? null,
      ...(input.metadata ?? {}),
    },
  })
}

const BodySchema = z.object({
  projectId: z.string().uuid(),
  bucketItemId: z.string().uuid().nullable().optional(),
  action: z.enum(['asset-analysis', 'background-removal', 'object-segmentation', 'layer-decomposition', 'mask-lift', 'erase-fill', 'mask-only', 'image-edit']),
  prompt: z.string().max(4000).nullable().optional(),
  brushMaskKey: z.string().max(1000).nullable().optional(),
  modelId: z.string().max(200).nullable().optional(),
})

export default defineEventHandler(async (event) => {
  const user = await requireWriteAccess(event)
  const sourceAssetId = getRouterParam(event, 'id')
  if (!sourceAssetId) throw createError({ statusCode: 400, statusMessage: 'Asset id is required' })
  const body = BodySchema.parse(await readBody(event))
  const action = getAssetIntelligenceAction(body.action)
  if (!action) throw createError({ statusCode: 400, statusMessage: 'Unknown extraction action' })

  await requireVideoProjectWriteAccess(user, body.projectId, 'Asset intelligence requires an AV project')

  const sourceAsset = await getAssetProjectRelationship(sourceAssetId)
  if (!sourceAsset) throw createError({ statusCode: 404, statusMessage: 'Asset not found' })
  if (sourceAsset.projectId !== body.projectId) {
    throw createError({ statusCode: 403, statusMessage: 'Source asset does not belong to this project' })
  }

  if (body.bucketItemId) {
    const bucketItem = await getBucketItemProjectRelationship(body.bucketItemId)
    if (!bucketItem) throw createError({ statusCode: 400, statusMessage: 'Bucket item not found' })
    if (bucketItem.projectId !== body.projectId) {
      throw createError({ statusCode: 403, statusMessage: 'Bucket item does not belong to this project' })
    }
  }

  const input = {
    projectId: body.projectId,
    sourceAssetId,
    bucketItemId: body.bucketItemId ?? null,
    action: body.action,
    prompt: body.prompt ?? null,
    brushMaskKey: body.brushMaskKey ?? null,
    modelId: body.modelId ?? null,
    createdBy: user.id,
  }

  const queue = getAssetIntelligenceQueue(event)
  const queueSupportedInput = queueSupportsExtractionInput(body.action, input.modelId)
  const selectedModel = input.modelId
    ? getAssetIntelligenceModel(input.modelId)
    : defaultModelForAction(body.action)
  if (queue && queueSupportedInput) {
    const job = await createQueuedExtractionJob(input)
    try {
      await enqueueAssetIntelligence(event, { jobId: job.id, projectId: body.projectId, sourceAssetId })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error || 'Failed to enqueue asset intelligence job')
      await markAssetIntelligenceJobFailed(job.id, errorMessage)
      await recordAssetIntelligenceRequest({
        action: body.action,
        modelId: selectedModel?.id ?? input.modelId ?? 'unknown',
        provider: selectedModel?.provider ?? 'unknown',
        gatewayProvider: selectedModel?.gatewayProvider ?? null,
        userId: user.id,
        projectId: body.projectId,
        sourceAssetId,
        jobId: job.id,
        status: 'error',
        errorCode: 'asset_intelligence_enqueue_failed',
        metadata: { queued: false, errorMessage },
      })
      throw error
    }
    await recordAssetIntelligenceRequest({
      action: body.action,
      modelId: selectedModel?.id ?? input.modelId ?? 'unknown',
      provider: selectedModel?.provider ?? 'unknown',
      gatewayProvider: selectedModel?.gatewayProvider ?? null,
      userId: user.id,
      projectId: body.projectId,
      sourceAssetId,
      jobId: job.id,
      metadata: {
        queued: true,
        bucketItemId: body.bucketItemId ?? null,
        hasPrompt: Boolean(body.prompt),
        hasBrushMask: Boolean(body.brushMaskKey),
      },
    })
    setResponseStatus(event, 202)
    return { job }
  }

  const job = await createBlockedExtractionJob({
    ...input,
    errorMessage: queue
      ? !QUEUE_SUPPORTED_ACTIONS.has(body.action)
        ? `Asset intelligence action ${body.action} is not production-enabled.`
        : input.modelId
        ? `Asset intelligence action ${body.action} with model ${input.modelId} is not supported by the deployed worker.`
        : `Asset intelligence action ${body.action} is not supported by the deployed worker.`
      : undefined,
  })
  await recordAssetIntelligenceRequest({
    action: body.action,
    modelId: selectedModel?.id ?? input.modelId ?? 'unknown',
    provider: selectedModel?.provider ?? 'unknown',
    gatewayProvider: selectedModel?.gatewayProvider ?? null,
    userId: user.id,
    projectId: body.projectId,
    sourceAssetId,
    jobId: job.id,
    status: 'error',
    errorCode: queue ? 'unsupported_asset_intelligence_model' : 'asset_intelligence_queue_unavailable',
    metadata: {
      queued: false,
      bucketItemId: body.bucketItemId ?? null,
      requestedModelId: input.modelId,
      hasQueueBinding: Boolean(queue),
    },
  })
  setResponseStatus(event, 202)
  return { job }
})
