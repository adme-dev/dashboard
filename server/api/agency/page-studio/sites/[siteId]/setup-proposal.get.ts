import { z } from 'zod'
import { queryOneFresh } from '~~/server/utils/db'
import { requireAgencyPageStudioAccess } from '~~/server/utils/pageStudio/access'
import { pageStudioHttpError } from '~~/server/utils/pageStudio/http'
import { PageStudioProvisioningError, PageStudioProvisioningJobSchema, readPageStudioProvisioning, type PageStudioProvisionerBinding } from '~~/server/utils/pageStudio/provisioningBinding'

export default eventHandler(async (event) => {
  setHeader(event, 'cache-control', 'no-store')
  try {
    const { tenantId } = await requireAgencyPageStudioAccess(event, 'PAGE_STUDIO_VIEW')
    const siteId = z.string().uuid().safeParse(getRouterParam(event, 'siteId'))
    if (!siteId.success) throw createError({ statusCode: 400, statusMessage: 'Invalid website' })
    const row = await queryOneFresh<{
      tenantId: string
      clientId: string
      siteId: string
      name: string
      starterVersion: string
      revision: number | null
      status: 'proposed' | 'accepted' | 'rejected' | null
      source: 'template' | 'chat' | null
      brief: string | null
      plan: Record<string, unknown> | null
    }>(`
      SELECT site.tenant_id AS "tenantId", site.client_id AS "clientId", site.id AS "siteId",
             site.name, site.starter_version AS "starterVersion", proposal.revision,
             proposal.status, proposal.source, proposal.brief, proposal.plan
      FROM page_studio_sites site
      LEFT JOIN LATERAL (
        SELECT revision, status, source, brief, plan FROM page_studio_setup_proposals
        WHERE tenant_id = site.tenant_id AND client_id = site.client_id AND site_id = site.id
        ORDER BY revision DESC LIMIT 1
      ) proposal ON TRUE
      WHERE site.tenant_id = $1 AND site.id = $2
    `, [tenantId, siteId.data])
    if (!row || row.tenantId !== tenantId || row.siteId !== siteId.data) {
      throw createError({ statusCode: 404, statusMessage: 'Website not found' })
    }
    const env = (event.context as { cloudflare?: { env?: Record<string, unknown> } }).cloudflare?.env
    const binding = env?.PAGE_STUDIO_PROVISIONER as PageStudioProvisionerBinding | undefined
    let provisioning: { phase: string, updatedAt: string } | null = null
    if (row.revision && row.status === 'accepted' && binding?.readProvisioning) {
      const saved = await readPageStudioProvisioning(binding, {
        requestKey: `page-studio-${row.siteId}-${row.revision}`,
        scope: { tenantId, clientId: row.clientId, businessId: row.clientId, siteId: row.siteId, environment: 'staging' }
      })
      if (saved !== null) {
        const parsed = PageStudioProvisioningJobSchema.safeParse(saved)
        if (!parsed.success) throw new PageStudioProvisioningError('PROVISIONER_FAILED', 'Website setup status could not be verified')
        // Management needs progress, not provider identifiers or raw executor errors.
        provisioning = { phase: parsed.data.phase, updatedAt: parsed.data.updatedAt }
      }
    }
    return {
      supported: ['limousine-v1', 'floristry-v1', 'retail-v1', 'it-goods-v1', 'import-export-v1'].includes(row.starterVersion),
      proposal: row.revision ? { revision: row.revision, status: row.status, source: row.source, brief: row.brief, plan: row.plan } : null,
      provisioning,
      serviceAvailable: Boolean(binding?.readProvisioning && binding?.createProvisioning)
    }
  } catch (error) {
    pageStudioHttpError(error)
  }
})
