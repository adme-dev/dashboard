import { requireClientAuth } from '~~/server/utils/clientAuth'
import { pageStudioHttpError } from '~~/server/utils/pageStudio/http'
import { queryOne } from '~~/server/utils/db'

export default eventHandler(async (event) => {
  try {
    const user = await requireClientAuth(event)
    const siteId = getRouterParam(event, 'id')
    if (!siteId) throw createError({ statusCode: 400, statusMessage: 'Site is required' })
    const proposal = await queryOne(`
      SELECT id, site_id AS "siteId", revision, source, brief, plan, status,
             created_by AS "createdBy", reviewed_by AS "reviewedBy",
             reviewed_at AS "reviewedAt", created_at AS "createdAt"
      FROM page_studio_setup_proposals
      WHERE client_id = $1 AND site_id = $2
      ORDER BY revision DESC LIMIT 1
    `, [user.clientId, siteId])
    if (!proposal) throw createError({ statusCode: 404, statusMessage: 'Setup proposal not found' })
    return { proposal }
  } catch (error) {
    pageStudioHttpError(error)
  }
})
