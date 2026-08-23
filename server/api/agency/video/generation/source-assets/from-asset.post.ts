import { z } from 'zod'
import { requireWriteAccess } from '~~/server/utils/auth'
import { createSourceAsset } from '~~/server/utils/video-generation/sourceAssetStore'
import { getAccessibleVideoAsset } from '~~/server/utils/video/assets'
import { imageContentTypeForR2Key } from '~~/server/utils/video-generation/sourceContentTypes'
import { withGodModeLedger } from '~~/server/utils/video/godModeStudioMutations'

// Register an existing project video_asset (a still already on the timeline / in the
// library) as an approved i2v source — so users animate stills they already uploaded
// instead of re-uploading. Reuses the same approval-gated source-asset rail as upload.
const BodySchema = z.object({
  assetId: z.string().uuid(),
  subjectType: z.enum(['vehicle', 'non_vehicle', 'unknown']).default('unknown'),
})

// Owners (God mode) run this under the execution ledger; staff run it directly.
export default defineEventHandler(event => withGodModeLedger(event, 'sourceAssetFromAsset', async ({ reservedId }) => {
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
    id: reservedId,
    clientId: asset.clientId ?? null,
    createdBy: user.id,
    r2Key: asset.r2Key,
    contentType,
    subjectType: parsed.data.subjectType,
  })
  setResponseStatus(event, 201)
  return { id: source.id, status: source.status }
}))
