import { z } from 'zod'
import { requireWriteAccess } from '~~/server/utils/auth'
import { requireVideoProjectWriteAccess } from '~~/server/utils/video-asset-intelligence/access'
import { buildReviewableAssemblyPlan } from '~~/server/utils/video-asset-intelligence/buckets'
import { ensureDefaultBuckets, listBucketItemsForProject } from '~~/server/utils/video-asset-intelligence/db'

const BodySchema = z.object({
  brief: z.string().min(1).max(4000),
  targetFormat: z.string().min(1).max(80).default('reels_9x16'),
})

export default defineEventHandler(async (event) => {
  const user = await requireWriteAccess(event)
  const projectId = getRouterParam(event, 'id')
  if (!projectId) throw createError({ statusCode: 400, statusMessage: 'Project id is required' })
  const body = BodySchema.parse(await readBody(event))
  await requireVideoProjectWriteAccess(user, projectId, 'AI assembly requires an AV project')
  await ensureDefaultBuckets(projectId)
  const bucketItems = await listBucketItemsForProject(projectId)
  return { plan: buildReviewableAssemblyPlan({ projectId, brief: body.brief, targetFormat: body.targetFormat, bucketItems }) }
})
