import { z } from 'zod'
import { requireAgencyPageStudioAccess } from '~~/server/utils/pageStudio/access'
import { queryOneFresh } from '~~/server/utils/db'
import { pageStudioHttpError } from '~~/server/utils/pageStudio/http'
import { verifyPageStudioProvisioningJobAuthority } from '~~/server/utils/pageStudio/provisioningAuthority'
import { createPageStudioProvisioningJob, dispatchPageStudioProvisioning, type PageStudioProvisionerBinding } from '~~/server/utils/pageStudio/provisioningBinding'

const Body = z.object({ expectedRevision: z.number().int().min(1) }).strict()

export default eventHandler(async (event) => {
  try {
    const { tenantId, user } = await requireAgencyPageStudioAccess(event, 'PAGE_STUDIO_EDIT')
    const siteId = z.string().uuid().safeParse(getRouterParam(event, 'siteId'))
    const parsed = Body.safeParse(await readBody(event))
    if (!siteId.success || !parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid provisioning request' })
    const row = await queryOneFresh<{
      tenantId: string
      clientId: string
      siteId: string
      revision: number
      status: string
      source: 'template' | 'chat'
      brief: string | null
      plan: Record<string, unknown>
    }>(`
      SELECT proposal.tenant_id AS "tenantId", proposal.client_id AS "clientId",
             proposal.site_id AS "siteId", proposal.revision, proposal.status,
             proposal.source, proposal.brief, proposal.plan
      FROM page_studio_setup_proposals proposal
      JOIN page_studio_sites site ON site.tenant_id = proposal.tenant_id
        AND site.client_id = proposal.client_id AND site.id = proposal.site_id
      WHERE proposal.tenant_id = $1 AND proposal.site_id = $2
      ORDER BY proposal.revision DESC LIMIT 1
    `, [tenantId, siteId.data])
    if (!row) throw createError({ statusCode: 404, statusMessage: 'Setup proposal not found' })
    if (row.tenantId !== tenantId || row.siteId !== siteId.data || row.status !== 'accepted' || row.revision !== parsed.data.expectedRevision) {
      throw createError({ statusCode: 409, statusMessage: 'The current setup proposal must be accepted before provisioning' })
    }
    const request = {
      initiatingActorKind: 'agency-user' as const,
      initiatingUserId: user.id,
      requestKey: `page-studio-${row.siteId}-${row.revision}`,
      scope: { businessId: row.clientId, tenantId, clientId: row.clientId, siteId: row.siteId, environment: 'staging' as const },
      source: row.source, revision: row.revision, brief: row.brief, plan: row.plan,
      now: new Date().toISOString()
    }
    await verifyPageStudioProvisioningJobAuthority(createPageStudioProvisioningJob(request))
    const env = (event.context as { cloudflare?: { env?: Record<string, unknown> } }).cloudflare?.env
    const binding = env?.PAGE_STUDIO_PROVISIONER as PageStudioProvisionerBinding | undefined
    const job = await dispatchPageStudioProvisioning(binding, request)
    // A retry preserves its original owner. Never substitute the current caller
    // if that owner has lost permission since the job was retained.
    if (job.actor.userId !== user.id) await verifyPageStudioProvisioningJobAuthority(job)
    return { provisioning: { requestKey: request.requestKey, scope: request.scope, job } }
  } catch (error) {
    pageStudioHttpError(error)
  }
})
