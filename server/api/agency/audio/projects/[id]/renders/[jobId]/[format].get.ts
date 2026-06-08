// Authed render-variant redirect: 302 → a fresh presigned URL for the rendered MP4.
// Re-presigns each hit (stable URL, no expiry). Serves download + (later) portal viewing.
import { requireAuth } from '~~/server/utils/auth'
import { getProjectWithCurrentTimeline, getRenderJob } from '~~/server/utils/audio/projects'
import { getPresignedDownloadUrl, getPublicUrl, isStorageConfigured } from '~~/server/utils/storage'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const id = getRouterParam(event, 'id')!
  const jobId = getRouterParam(event, 'jobId')!
  const format = getRouterParam(event, 'format')!

  const project = await getProjectWithCurrentTimeline(id)
  if (!project) throw createError({ statusCode: 404, statusMessage: 'Project not found' })

  const job = await getRenderJob(jobId)
  if (!job || job.projectId !== id) throw createError({ statusCode: 404, statusMessage: 'Render job not found' })

  const key = (job.variants ?? {})[format]
  if (!key) throw createError({ statusCode: 404, statusMessage: 'Render variant not available' })

  const url = isStorageConfigured()
    ? (getPublicUrl(key) ?? await getPresignedDownloadUrl(key, 60 * 60))
    : `/api/_uploads/${key}`
  return sendRedirect(event, url, 302)
})
