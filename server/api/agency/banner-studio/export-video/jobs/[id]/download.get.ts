import { createError, getRouterParam } from 'h3'
import { deliverBannerVideo, isSafeVideoKey } from '~~/server/utils/banner/videoDelivery'

import { requireAuth } from '~~/server/utils/auth'
import { queryOneFresh } from '~~/server/utils/db'
import { hasAllSocialClientAccess, requireSocialClientAccess } from '~~/server/utils/social/clientAccess'

const JOB_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
function notFound(): never {
  throw createError({ statusCode: 404, statusMessage: 'Banner video not found' })
}
function storageUnavailable(statusMessage: string): never {
  throw createError({ statusCode: 503, statusMessage })
}

interface BannerRenderJob {
  id: string
  project_id: string
  r2_key: string | null
  status: string
  client_id: string | null
  created_by: string | null
}

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)

  const id = getRouterParam(event, 'id') || ''
  if (!JOB_ID_PATTERN.test(id)) notFound()

  let job: BannerRenderJob | null
  try {
    job = await queryOneFresh<BannerRenderJob>(
      `SELECT j.id, j.project_id, j.r2_key, j.status, p.client_id, p.created_by
         FROM banner_render_jobs j
         JOIN banner_projects p ON p.id = j.project_id
        WHERE j.id = $1`,
      [id]
    )
  } catch {
    storageUnavailable('Banner video delivery is unavailable')
  }
  if (!job || job.id !== id || job.status !== 'done' || !isSafeVideoKey(job.r2_key, job.project_id)) notFound()
  if (job.client_id) await requireSocialClientAccess(event, job.client_id)
  else if (job.created_by !== user.id && !hasAllSocialClientAccess(user)) {
    throw createError({ statusCode: 403, statusMessage: 'No access to this project' })
  }

  return deliverBannerVideo(event, job.r2_key, job.project_id)
})
