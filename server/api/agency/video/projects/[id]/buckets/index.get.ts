import { requireWriteAccess } from '~~/server/utils/auth'
import { requireVideoProjectWriteAccess } from '~~/server/utils/video-asset-intelligence/access'
import { ensureDefaultBuckets, listBucketItemsForProject, listProjectBuckets, syncProjectVideoAssetsIntoGeneratedBucket } from '~~/server/utils/video-asset-intelligence/db'

export default defineEventHandler(async (event) => {
  const user = await requireWriteAccess(event)
  const projectId = getRouterParam(event, 'id')
  if (!projectId) throw createError({ statusCode: 400, statusMessage: 'Project id is required' })
  await requireVideoProjectWriteAccess(user, projectId, 'Asset buckets require an AV project')
  await ensureDefaultBuckets(projectId)
  await syncProjectVideoAssetsIntoGeneratedBucket(projectId)
  const [buckets, items] = await Promise.all([
    listProjectBuckets(projectId),
    listBucketItemsForProject(projectId),
  ])
  return { buckets, items }
})
