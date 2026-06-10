import { z } from 'zod'
import { requireWriteAccess } from '~~/server/utils/auth'
import { getAssetIntelligenceAction } from '~~/server/utils/video-asset-intelligence/registry'
import { createBlockedExtractionJob } from '~~/server/utils/video-asset-intelligence/db'

const BodySchema = z.object({
  projectId: z.string().uuid(),
  bucketItemId: z.string().uuid().nullable().optional(),
  action: z.enum(['background-removal', 'object-segmentation', 'layer-decomposition', 'mask-lift', 'erase-fill', 'mask-only', 'image-edit']),
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
  const job = await createBlockedExtractionJob({
    projectId: body.projectId,
    sourceAssetId,
    bucketItemId: body.bucketItemId ?? null,
    action: body.action,
    prompt: body.prompt ?? null,
    brushMaskKey: body.brushMaskKey ?? null,
    modelId: body.modelId ?? null,
    createdBy: user.id,
  })
  setResponseStatus(event, 202)
  return { job }
})
