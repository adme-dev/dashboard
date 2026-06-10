import { z } from 'zod'
import { requireWriteAccess } from '~~/server/utils/auth'
import { requireVideoProjectWriteAccess } from '~~/server/utils/video-asset-intelligence/access'
import { getAssetIntelligenceAction } from '~~/server/utils/video-asset-intelligence/registry'
import { createBlockedExtractionJob, createQueuedExtractionJob, getAssetProjectRelationship, getBucketItemProjectRelationship, markAssetIntelligenceJobFailed } from '~~/server/utils/video-asset-intelligence/db'
import { enqueueAssetIntelligence, getAssetIntelligenceQueue } from '~~/server/utils/video-asset-intelligence/enqueue'
import type { AssetIntelligenceActionId } from '~~/server/utils/video-asset-intelligence/registry'

const QUEUE_SUPPORTED_ACTIONS = new Set<AssetIntelligenceActionId>(['mask-only', 'asset-analysis'])

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
  if (queue && QUEUE_SUPPORTED_ACTIONS.has(body.action)) {
    const job = await createQueuedExtractionJob(input)
    try {
      await enqueueAssetIntelligence(event, { jobId: job.id, projectId: body.projectId, sourceAssetId })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error || 'Failed to enqueue asset intelligence job')
      await markAssetIntelligenceJobFailed(job.id, errorMessage)
      throw error
    }
    setResponseStatus(event, 202)
    return { job }
  }

  const job = await createBlockedExtractionJob({
    ...input,
    errorMessage: queue
      ? `Asset intelligence action ${body.action} is not supported by the deployed worker.`
      : undefined,
  })
  setResponseStatus(event, 202)
  return { job }
})
