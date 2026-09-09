import { z } from 'zod'
import { queryOneFresh } from '~~/server/utils/db'
import {
  normalizePageStudioProvisioningPlan, PageStudioProvisioningError,
  PageStudioProvisioningJobSchema, PageStudioProvisioningScopeSchema,
  PageStudioProvisioningSetupSchema, readPageStudioProvisioning,
  type PageStudioProvisionerBinding
} from '~~/server/utils/pageStudio/provisioningBinding'

const Request = z.object({
  requestKey: PageStudioProvisioningJobSchema.shape.requestKey,
  scope: PageStudioProvisioningScopeSchema.extend({
    businessId: z.string().uuid(), clientId: z.string().uuid(), siteId: z.string().uuid(),
    environment: z.literal('staging')
  })
}).strict().refine(input => input.scope.businessId === input.scope.clientId)

interface AuthorityRow {
  tenantId: string
  clientId: string
  siteId: string
  userId: string
  revision: number
  status: string
  source: string
  brief: string | null
  plan: Record<string, unknown>
  canProvision: boolean
  pagesPerSiteLimit: number
  planMetadata: unknown
}

function denied(): never {
  throw new PageStudioProvisioningError('PROVISIONING_AUTHORITY_DENIED', 'The original setup owner no longer has authority for this accepted plan', 403)
}

/** A fresh check, not a reusable grant. Executors must also compare job state and fence their lease. */
export async function authorizePageStudioProvisioning(binding: PageStudioProvisionerBinding | undefined, input: unknown) {
  const parsed = Request.safeParse(input)
  if (!parsed.success) throw new PageStudioProvisioningError('INVALID_PROVISIONING_REQUEST', 'Invalid provisioning authority request', 400)
  if (!binding?.readProvisioning) throw new PageStudioProvisioningError('PROVISIONER_UNAVAILABLE', 'Provisioning authority requires the coordinator', 503)
  const { scope } = parsed.data
  const retained = await readPageStudioProvisioning(binding, parsed.data)
  if (retained === null) throw new PageStudioProvisioningError('PROVISIONING_NOT_FOUND', 'Provisioning request not found', 404)
  const decoded = PageStudioProvisioningJobSchema.safeParse(retained)
  if (!decoded.success) throw new PageStudioProvisioningError('PROVISIONER_FAILED', 'Invalid retained provisioning job')
  const job = decoded.data
  if (!job.actor) throw new PageStudioProvisioningError('PROVISIONING_OWNER_REQUIRED', 'The setup owner requires reconciliation', 409)
  if (!job.setup || ['failed', 'complete'].includes(job.phase)
    || job.id !== job.requestKey || job.requestKey !== `page-studio-${scope.siteId}-${job.setup.proposalRevision}`
    || job.templateId !== job.plan.templateId
    || JSON.stringify(job.scope) !== JSON.stringify(job.plan.scope)) denied()

  const row = await queryOneFresh<AuthorityRow>(`
    SELECT site.tenant_id AS "tenantId", site.client_id AS "clientId", site.id AS "siteId",
           owner.id AS "userId", proposal.revision, proposal.status, proposal.source,
           proposal.brief, proposal.plan, entitlement.pages_per_site_limit AS "pagesPerSiteLimit",
           entitlement.plan_metadata AS "planMetadata",
           (site.status IN ('draft', 'active') AND entitlement.status IN ('trial', 'active')
            AND entitlement.portal_creation_enabled AND entitlement.effective_from <= NOW()
            AND entitlement.active_site_limit > 0
            AND (SELECT COUNT(*) FROM page_studio_sites counted
                 WHERE counted.tenant_id = site.tenant_id AND counted.client_id = site.client_id
                   AND counted.status <> 'archived') <= entitlement.active_site_limit
            AND (entitlement.effective_until IS NULL OR entitlement.effective_until > NOW())) AS "canProvision"
    FROM page_studio_sites site
    JOIN agency_clients client ON client.id = site.client_id AND client.is_active = TRUE
    JOIN client_users owner ON owner.client_id = site.client_id AND owner.id = $4
      AND owner.status = 'active' AND owner.role IN ('admin', 'manager')
    JOIN page_studio_site_memberships membership ON membership.tenant_id = site.tenant_id
      AND membership.client_id = site.client_id AND membership.site_id = site.id
      AND membership.user_id = owner.id AND membership.role = 'editor'
    JOIN page_studio_entitlements entitlement ON entitlement.tenant_id = site.tenant_id
      AND entitlement.client_id = site.client_id AND entitlement.id = site.entitlement_id
    JOIN page_studio_setup_proposals proposal ON proposal.tenant_id = site.tenant_id
      AND proposal.client_id = site.client_id AND proposal.site_id = site.id
    WHERE site.tenant_id = $1 AND site.client_id = $2 AND site.id = $3
    ORDER BY proposal.revision DESC LIMIT 1
  `, [scope.tenantId, scope.clientId, scope.siteId, job.actor.userId]).catch(() => {
    throw new PageStudioProvisioningError('PROVISIONER_FAILED', 'Provisioning authority could not be verified')
  })
  if (!row || row.userId !== job.actor.userId || row.tenantId !== scope.tenantId
    || row.clientId !== scope.clientId || row.siteId !== scope.siteId
    || row.status !== 'accepted' || row.revision !== job.setup.proposalRevision || row.canProvision !== true
    || !Number.isInteger(row.pagesPerSiteLimit) || row.pagesPerSiteLimit < job.plan.pages.length) denied()
  const setup = PageStudioProvisioningSetupSchema.safeParse({
    businessName: row.plan?.businessName, proposalRevision: row.revision, source: row.source,
    ...(row.brief === null ? {} : { brief: row.brief })
  })
  if (!setup.success || JSON.stringify(setup.data) !== JSON.stringify(job.setup)) denied()
  let plan
  try {
    plan = normalizePageStudioProvisioningPlan(row.plan, scope)
  } catch {
    denied()
  }
  if (JSON.stringify(plan) !== JSON.stringify(job.plan)) denied()
  const metadata = z.object({ allowedModules: z.array(z.string().min(1)).optional() }).safeParse(row.planMetadata)
  if (!metadata.success || (metadata.data.allowedModules && job.plan.enabledModules.some(module => !metadata.data.allowedModules!.includes(module)))) denied()
  return { job, userId: job.actor.userId }
}
