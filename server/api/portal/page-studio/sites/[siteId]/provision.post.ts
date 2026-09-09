import { requireClientAuth } from '~~/server/utils/clientAuth'
import { pageStudioHttpError } from '~~/server/utils/pageStudio/http'
import { queryOneFresh } from '~~/server/utils/db'
import { z } from 'zod'
import { dispatchPageStudioProvisioning, type PageStudioProvisionerBinding } from '~~/server/utils/pageStudio/provisioningBinding'

const Body = z.object({ expectedRevision: z.number().int().min(1) }).strict()

export default eventHandler(async (event) => {
  try {
    const user = await requireClientAuth(event)
    if (!['admin', 'manager'].includes(user.role)) throw createError({ statusCode: 403, statusMessage: 'Page Studio editing access denied' })
    const siteId = getRouterParam(event, 'siteId')
    const parsed = Body.safeParse(await readBody(event))
    if (!siteId || !parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid provisioning request' })
    const row = await queryOneFresh<{
      tenantId: string
      clientId: string
      siteId: string
      revision: number
      status: string
      source: 'template' | 'chat'
      brief: string | null
      plan: Record<string, unknown>
      canProvision: boolean
      pagesPerSiteLimit: number
    }>(`
      SELECT site.tenant_id AS "tenantId", proposal.client_id AS "clientId",
             proposal.site_id AS "siteId", proposal.revision, proposal.status,
             proposal.source, proposal.brief, proposal.plan,
             (site.status IN ('draft', 'active')
              AND entitlement.status IN ('trial', 'active')
              AND entitlement.portal_creation_enabled
              AND entitlement.effective_from <= NOW()
              AND (entitlement.effective_until IS NULL OR entitlement.effective_until > NOW())) AS "canProvision",
             entitlement.pages_per_site_limit AS "pagesPerSiteLimit"
      FROM page_studio_setup_proposals proposal
      JOIN page_studio_sites site
        ON site.tenant_id = proposal.tenant_id
       AND site.client_id = proposal.client_id
       AND site.id = proposal.site_id
      JOIN page_studio_entitlements entitlement
        ON entitlement.tenant_id = site.tenant_id
       AND entitlement.client_id = site.client_id
       AND entitlement.id = site.entitlement_id
      JOIN page_studio_site_memberships membership
        ON membership.tenant_id = site.tenant_id
       AND membership.client_id = site.client_id
       AND membership.site_id = site.id
       AND membership.user_id = $4
       AND membership.role = 'editor'
      WHERE proposal.client_id = $1 AND proposal.site_id = $2
        AND proposal.revision = $3
      LIMIT 1
    `, [user.clientId, siteId, parsed.data.expectedRevision, user.id])
    if (!row) throw createError({ statusCode: 404, statusMessage: 'Setup proposal not found' })
    if (row.status !== 'accepted') throw createError({ statusCode: 409, statusMessage: 'Setup proposal must be accepted before provisioning' })
    if (row.canProvision !== true) throw createError({ statusCode: 403, statusMessage: 'An active Page Studio subscription with site creation enabled is required' })
    if (!Number.isInteger(row.pagesPerSiteLimit) || row.pagesPerSiteLimit < 1
      || (Array.isArray(row.plan.pages) && row.plan.pages.length > row.pagesPerSiteLimit)) {
      throw createError({ statusCode: 403, statusMessage: 'The setup proposal exceeds the subscription page allowance' })
    }
    const request = {
      requestKey: `page-studio-${row.siteId}-${row.revision}`,
      scope: { businessId: row.clientId, tenantId: row.tenantId, clientId: row.clientId, siteId: row.siteId, environment: 'staging' as const },
      source: row.source,
      revision: row.revision,
      brief: row.brief,
      plan: row.plan
    }
    const env = (event.context as { cloudflare?: { env?: Record<string, unknown> } }).cloudflare?.env
    const binding = env?.PAGE_STUDIO_PROVISIONER as PageStudioProvisionerBinding | undefined
    const job = await dispatchPageStudioProvisioning(binding, { ...request, now: new Date().toISOString() })
    return { provisioning: { ...request, job } }
  } catch (error) {
    pageStudioHttpError(error)
  }
})
