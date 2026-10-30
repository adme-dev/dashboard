import { queryOneFresh } from '~~/server/utils/db'
import { requireWriteAccess } from '~~/server/utils/auth'
import { hasAllSocialClientAccess, requireSocialClientAccess } from '~~/server/utils/social/clientAccess'
import { ACTIVE_PROJECT_CLIENT_SQL, isMarketingPortfolioUser, requireMarketingBannerProjectAccess } from '~~/server/utils/banner/marketingProjectAccess'
import { resolveBannerFolderId } from '~~/server/utils/banner/folders'

export default defineEventHandler(async (event) => {
  const user = await requireWriteAccess(event)
  const id = getRouterParam(event, 'id')
  if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid project ID' })
  }
  const body = await readBody(event)
  if (!body || !Object.hasOwn(body, 'folderId')) throw createError({ statusCode: 400, statusMessage: 'Choose a folder or Unfiled' })
  const folderId = await resolveBannerFolderId(body.folderId)
  const project = await queryOneFresh<{ client_id: string | null, created_by: string | null, tags: string[] | null, review_status: string | null }>(
    'SELECT client_id, created_by, tags, review_status FROM banner_projects WHERE id = $1', [id])
  if (!project) throw createError({ statusCode: 404, statusMessage: 'Project not found' })
  if (isMarketingPortfolioUser(user)) await requireMarketingBannerProjectAccess(event, user, project)
  else if (project.client_id) await requireSocialClientAccess(event, project.client_id)
  else if (project.created_by !== user.id && !hasAllSocialClientAccess(user)) throw createError({ statusCode: 403, statusMessage: 'No access to this project' })

  const row = await queryOneFresh<{ id: string, folderId: string | null }>(`
    UPDATE banner_projects SET folder_id = $2::uuid, updated_at = NOW()
    WHERE id = $1 AND client_id IS NOT DISTINCT FROM $3::uuid
      AND created_by IS NOT DISTINCT FROM $4::uuid AND review_status::text IS NOT DISTINCT FROM $5::text
      AND ${ACTIVE_PROJECT_CLIENT_SQL}
    RETURNING id, folder_id AS "folderId"
  `, [id, folderId, project.client_id, project.created_by, project.review_status])
  if (!row) throw createError({ statusCode: 409, statusMessage: 'Project access changed; reload before moving' })
  setHeader(event, 'Cache-Control', 'private, no-store')
  return row
})
