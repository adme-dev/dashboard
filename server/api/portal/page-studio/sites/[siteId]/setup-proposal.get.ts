import { z } from 'zod'
import { queryOneFresh } from '~~/server/utils/db'
import { requireClientAuth } from '~~/server/utils/clientAuth'
import { pageStudioHttpError } from '~~/server/utils/pageStudio/http'
import { PageStudioProvisioningError, PageStudioProvisioningJobSchema, readPageStudioProvisioning, getPageStudioProvisioningRuntime } from '~~/server/utils/pageStudio/provisioningBinding'

export default eventHandler(async (event) => {
  setHeader(event, 'cache-control', 'no-store')
  try {
    const user = await requireClientAuth(event)
    const siteId = z.string().uuid().safeParse(getRouterParam(event, 'siteId'))
    if (!siteId.success) throw createError({ statusCode: 400, statusMessage: 'Invalid website' })
    const row = await queryOneFresh<{
      tenantId: string
      clientId: string
      siteId: string
      name: string
      starterVersion: string
      membershipRole: string
      revision: number | null
      status: 'proposed' | 'accepted' | 'rejected' | null
      source: 'template' | 'chat' | null
      brief: string | null
      plan: Record<string, unknown> | null
    }>(`
      SELECT site.tenant_id AS "tenantId", site.client_id AS "clientId", site.id AS "siteId",
             site.name, site.starter_version AS "starterVersion", membership.role AS "membershipRole", proposal.revision,
             proposal.status, proposal.source, proposal.brief, proposal.plan
      FROM page_studio_sites site
      JOIN page_studio_site_memberships membership
        ON membership.tenant_id = site.tenant_id AND membership.client_id = site.client_id
        AND membership.site_id = site.id AND membership.user_id = $3
      JOIN agency_clients client ON client.id = site.client_id AND client.is_active = TRUE
      LEFT JOIN LATERAL (
        SELECT revision, status, source, brief, plan FROM page_studio_setup_proposals
        WHERE tenant_id = site.tenant_id AND client_id = site.client_id AND site_id = site.id
        ORDER BY revision DESC LIMIT 1
      ) proposal ON TRUE
      WHERE site.client_id = $1 AND site.id = $2
    `, [user.clientId, siteId.data, user.id])
    if (!row || row.clientId !== user.clientId || row.siteId !== siteId.data) {
      throw createError({ statusCode: 404, statusMessage: 'Website not found' })
    }
    const env = (event.context as { cloudflare?: { env?: Record<string, unknown> } }).cloudflare?.env
    const runtime = getPageStudioProvisioningRuntime(env)
    let provisioning: { phase: string, updatedAt: string } | null = null
    if (row.revision && row.status === 'accepted' && runtime) {
      const saved = await readPageStudioProvisioning(runtime.binding, {
        requestKey: `page-studio-${row.siteId}-${row.revision}`,
        scope: { tenantId: row.tenantId, clientId: row.clientId, businessId: row.clientId, siteId: row.siteId, environment: runtime.environment }
      })
      if (saved !== null) {
        const parsed = PageStudioProvisioningJobSchema.safeParse(saved)
        if (!parsed.success) throw new PageStudioProvisioningError('PROVISIONER_FAILED', 'Website setup status could not be verified')
        // Management needs progress, not provider identifiers or raw executor errors.
        provisioning = { phase: parsed.data.phase, updatedAt: parsed.data.updatedAt }
      }
    }
    return {
      canEdit: ['admin', 'manager'].includes(user.role) && row.membershipRole === 'editor',
      name: row.name,
      supported: ['limousine-v1', 'floristry-v1', 'retail-v1', 'it-goods-v1', 'import-export-v1'].includes(row.starterVersion),
      proposal: row.revision ? { revision: row.revision, status: row.status, source: row.source, brief: row.brief, plan: row.plan } : null,
      provisioning,
      serviceAvailable: Boolean(runtime)
    }
  } catch (error) {
    pageStudioHttpError(error)
  }
})
