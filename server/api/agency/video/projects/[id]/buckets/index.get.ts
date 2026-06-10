import { requireWriteAccess } from '~~/server/utils/auth'
import { getProjectWithCurrentTimeline } from '~~/server/utils/audio/projects'
import { ensureDefaultBuckets, listBucketItemsForProject, listProjectBuckets, syncProjectVideoAssetsIntoGeneratedBucket } from '~~/server/utils/video-asset-intelligence/db'

export default defineEventHandler(async (event) => {
  await requireWriteAccess(event)
  const projectId = getRouterParam(event, 'id')
  if (!projectId) throw createError({ statusCode: 400, statusMessage: 'Project id is required' })
  const existing = await getProjectWithCurrentTimeline(projectId)
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Project not found' })
  if (existing.project.mediaType !== 'av') throw createError({ statusCode: 400, statusMessage: 'Asset buckets require an AV project' })
  await ensureDefaultBuckets(projectId)
  await syncProjectVideoAssetsIntoGeneratedBucket(projectId)
  const [buckets, items] = await Promise.all([
    listProjectBuckets(projectId),
    listBucketItemsForProject(projectId),
  ])
  return { buckets, items }
})
