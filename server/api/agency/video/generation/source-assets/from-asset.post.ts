import { z } from 'zod'
import { requireWriteAccess } from '~~/server/utils/auth'
import { createSourceAsset } from '~~/server/utils/video-generation/sourceAssetStore'
import { getAccessibleVideoAsset } from '~~/server/utils/video/assets'
import { imageContentTypeForR2Key } from '~~/server/utils/video-generation/sourceContentTypes'

// Register an existing project video_asset (a still already on the timeline / in the
// library) as an approved i2v source — so users animate stills they already uploaded
// instead of re-uploading. Reuses the same approval-gated source-asset rail as upload.
const BodySchema = z.object({
  assetId: z.string().uuid(),
  subjectType: z.enum(['vehicle', 'non_vehicle', 'unknown']).default('unknown'),
})

export default defineEventHandler(async (event) => {
  if (process.env.VIDEO_GENERATION_ENABLED !== 'true') {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }
  const user = await requireWriteAccess(event)
  const parsed = BodySchema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid request' })

  const asset = await getAccessibleVideoAsset(parsed.data.assetId, user)
  if (!asset?.r2Key) throw createError({ statusCode: 404, statusMessage: 'Asset not found' })

  const contentType = imageContentTypeForR2Key(asset.r2Key)
  if (!contentType) throw createError({ statusCode: 400, statusMessage: 'Source asset must be an image' })

  const source = await createSourceAsset({
    clientId: asset.clientId ?? null,
    createdBy: user.id,
    r2Key: asset.r2Key,
    contentType,
    subjectType: parsed.data.subjectType,
  })
  setResponseStatus(event, 201)
  return { id: source.id, status: source.status }
})
