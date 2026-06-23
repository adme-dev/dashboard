import { requireAuth } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'
import { projectJobStatus, type BannerJobRow } from '~~/server/utils/banner/renderJob'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const ids = String(getQuery(event).ids ?? '').split(',').map(s => s.trim()).filter(Boolean).slice(0, 20)
  if (!ids.length) return { jobs: [] }
  const rows = await queryRows<BannerJobRow>(
    `SELECT id, project_id, format_key, width, height, fps, crf, quality, source_r2_key, status, url, file_size, error
       FROM banner_render_jobs WHERE id = ANY($1)`,
    [ids],
  )
  return { jobs: projectJobStatus(rows) }
})
