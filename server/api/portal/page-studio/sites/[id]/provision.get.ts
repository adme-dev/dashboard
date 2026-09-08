import { requireClientAuth } from '~~/server/utils/clientAuth'
import { pageStudioHttpError } from '~~/server/utils/pageStudio/http'
import { queryOne } from '~~/server/utils/db'
import { readPageStudioProvisioning, type PageStudioProvisionerBinding } from '~~/server/utils/pageStudio/provisioningBinding'

export default eventHandler(async (event) => {
  try {
    const user = await requireClientAuth(event)
    const siteId = getRouterParam(event, 'id')
    if (!siteId) throw createError({ statusCode: 400, statusMessage: 'Invalid site' })
    const row = await queryOne<{
      tenantId: string
      clientId: string
      siteId: string
      revision: number
      status: string
      source: 'template' | 'chat'
    }>(`
      SELECT site.tenant_id AS "tenantId", proposal.client_id AS "clientId",
             proposal.site_id AS "siteId", proposal.revision, proposal.status,
             proposal.source
      FROM page_studio_setup_proposals proposal
      JOIN page_studio_sites site
        ON site.tenant_id = proposal.tenant_id
       AND site.client_id = proposal.client_id
       AND site.id = proposal.site_id
      WHERE proposal.client_id = $1 AND proposal.site_id = $2
      ORDER BY proposal.revision DESC
      LIMIT 1
    `, [user.clientId, siteId])
    if (!row) throw createError({ statusCode: 404, statusMessage: 'Setup proposal not found' })

    const requestKey = `page-studio-${row.siteId}-${row.revision}`
    const scope = {
      businessId: row.clientId,
      tenantId: row.tenantId,
      clientId: row.clientId,
      siteId: row.siteId,
      environment: 'staging' as const
    }
    const env = (event.context as { cloudflare?: { env?: Record<string, unknown> } }).cloudflare?.env
    const binding = env?.PAGE_STUDIO_PROVISIONER as PageStudioProvisionerBinding | undefined
    const provisioning = await readPageStudioProvisioning(binding, { requestKey, scope })
    return {
      proposal: { revision: row.revision, status: row.status, source: row.source },
      requestKey,
      provisioning,
      serviceAvailable: Boolean(binding?.readProvisioning)
    }
  } catch (error) {
    pageStudioHttpError(error)
  }
})
