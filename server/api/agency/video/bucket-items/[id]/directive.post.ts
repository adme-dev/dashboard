import { z } from 'zod'
import { requireWriteAccess } from '~~/server/utils/auth'
import { createOrUpdateBucketItemDirective } from '~~/server/utils/video-asset-intelligence/db'

const BodySchema = z.object({
  role: z.string().max(120).nullable().optional(),
  directive: z.record(z.string(), z.unknown()).default({}),
})

export default defineEventHandler(async (event) => {
  await requireWriteAccess(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Bucket item id is required' })
  const body = BodySchema.parse(await readBody(event))
  return { item: await createOrUpdateBucketItemDirective(id, body) }
})
