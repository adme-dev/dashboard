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
      WHERE client_id = $1 AND site_id = $3
        AND EXISTS (
          SELECT 1 FROM page_studio_site_memberships membership
          WHERE membership.tenant_id = page_studio_setup_proposals.tenant_id
            AND membership.client_id = page_studio_setup_proposals.client_id
            AND membership.site_id = page_studio_setup_proposals.site_id
            AND membership.user_id = $2
        )
      ORDER BY revision DESC LIMIT 1
    `, [user.clientId, user.id, siteId])
    if (!proposal) throw createError({ statusCode: 404, statusMessage: 'Setup proposal not found' })
    return { proposal }
  } catch (error) {
    pageStudioHttpError(error)
  }
})
