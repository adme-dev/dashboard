import { z } from 'zod'
import { requireWriteAccess } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'
import { createSourceAsset } from '~~/server/utils/video-generation/sourceAssetStore'

// Register an existing project video_asset (a still already on the timeline / in the
// library) as an approved i2v source — so users animate stills they already uploaded
// instead of re-uploading. Reuses the same approval-gated source-asset rail as upload.
const BodySchema = z.object({
  assetId: z.string().uuid(),
  subjectType: z.enum(['vehicle', 'non_vehicle', 'unknown']).default('unknown'),
})

const IMAGE_CONTENT_TYPE: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif',
}

export default defineEventHandler(async (event) => {
  if (process.env.VIDEO_STUDIO_ENABLED !== 'true' || process.env.VIDEO_GENERATION_ENABLED !== 'true') {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }
  const user = await requireWriteAccess(event)
  const parsed = BodySchema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid request' })

  const asset = await queryOne<{ id: string; client_id: string | null; r2_key: string }>(
    `SELECT id, client_id, r2_key FROM video_assets WHERE id = $1`,
    [parsed.data.assetId]
  )
  if (!asset?.r2_key) throw createError({ statusCode: 404, statusMessage: 'Asset not found' })

  const ext = (asset.r2_key.split('.').pop() || 'jpg').toLowerCase()
  const contentType = IMAGE_CONTENT_TYPE[ext] ?? 'image/jpeg'

  const source = await createSourceAsset({
    clientId: asset.client_id ?? null,
    createdBy: user.id,
    r2Key: asset.r2_key,
    contentType,
    subjectType: parsed.data.subjectType,
  })
  setResponseStatus(event, 201)
  return { id: source.id, status: source.status }
})
