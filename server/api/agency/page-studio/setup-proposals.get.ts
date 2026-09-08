import { requireAgencyPageStudioAccess } from '~~/server/utils/pageStudio/access'
import { pageStudioHttpError } from '~~/server/utils/pageStudio/http'
import { queryRows } from '~~/server/utils/db'

export default eventHandler(async (event) => {
  try {
    const { tenantId } = await requireAgencyPageStudioAccess(event, 'PAGE_STUDIO_APPROVE')
    const status = getQuery(event).status
    const params: unknown[] = [tenantId]
    const statusClause = status === 'accepted' || status === 'rejected' || status === 'proposed'
      ? (params.push(status), `AND proposal.status = $${params.length}`)
      : ''
    const proposals = await queryRows(`
      SELECT proposal.id, proposal.client_id AS "clientId", proposal.site_id AS "siteId",
             client.name AS "clientName", site.name AS "siteName", proposal.revision,
             proposal.source, proposal.brief, proposal.plan, proposal.status,
             proposal.created_at AS "createdAt", proposal.reviewed_at AS "reviewedAt"
      FROM page_studio_setup_proposals proposal
      JOIN page_studio_sites site ON site.tenant_id = proposal.tenant_id AND site.client_id = proposal.client_id AND site.id = proposal.site_id
      JOIN agency_clients client ON client.id = proposal.client_id
      WHERE proposal.tenant_id = $1 ${statusClause}
      ORDER BY proposal.created_at DESC, proposal.id
    `, params)
    return { proposals }
  } catch (error) { pageStudioHttpError(error) }
})
