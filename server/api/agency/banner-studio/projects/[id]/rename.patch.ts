import { queryOneFresh } from '~~/server/utils/db'
import { requireWriteAccess } from '~~/server/utils/auth'
import { requireBannerShareAccess } from '~~/server/utils/banner/shareAccess'
import { ACTIVE_PROJECT_CLIENT_SQL, checkMarketingBannerProjectPatch, isMarketingPortfolioUser } from '~~/server/utils/banner/marketingProjectAccess'

export default defineEventHandler(async (event) => {
  const user = await requireWriteAccess(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Project ID is required' })
  const body = await readBody(event)
  const name = body?.name
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 200) {
    throw createError({ statusCode: 400, statusMessage: 'Choose a name under 200 characters' })
  }
  await requireBannerShareAccess(event, user, id)
  const project = await queryOneFresh<{ client_id: string | null, created_by: string | null, tags: string[] | null, review_status: string | null }>(
    'SELECT client_id, created_by, tags, review_status FROM banner_projects WHERE id = $1', [id])
  if (!project) throw createError({ statusCode: 404, statusMessage: 'Project not found' })
  if (isMarketingPortfolioUser(user)) await checkMarketingBannerProjectPatch(event, user, project, { name })
  const row = await queryOneFresh<{ id: string, name: string }>(`
    UPDATE banner_projects SET name = $2, updated_at = NOW()
    WHERE id = $1 AND client_id IS NOT DISTINCT FROM $3::uuid
      AND created_by IS NOT DISTINCT FROM $4::uuid
      AND review_status::text IS NOT DISTINCT FROM $5::text
      AND ${ACTIVE_PROJECT_CLIENT_SQL}
    RETURNING id, name
  `, [id, name.trim(), project.client_id, project.created_by, project.review_status])
  if (!row) throw createError({ statusCode: 409, statusMessage: 'Project access changed; reload before renaming' })
  setHeader(event, 'Cache-Control', 'private, no-store')
  return row
})
