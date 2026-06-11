import { z } from 'zod'
import { requireWriteAccess } from '~~/server/utils/auth'
import { requireVideoProjectWriteAccess } from '~~/server/utils/video-asset-intelligence/access'
import { createOrUpdateBucketItemDirective, getBucketItemProjectRelationship } from '~~/server/utils/video-asset-intelligence/db'

const BodySchema = z.object({
  role: z.string().max(120).nullable().optional(),
  directive: z.record(z.string(), z.unknown()).default({}),
})

export default defineEventHandler(async (event) => {
  const user = await requireWriteAccess(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Bucket item id is required' })
  const body = BodySchema.parse(await readBody(event))
  const bucketItem = await getBucketItemProjectRelationship(id)
  if (!bucketItem) throw createError({ statusCode: 404, statusMessage: 'Bucket item not found' })
  await requireVideoProjectWriteAccess(user, bucketItem.projectId, 'Bucket item directive requires an AV project')
  return { item: await createOrUpdateBucketItemDirective(id, body) }
})
