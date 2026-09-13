import { z } from 'zod'
import { requireClientAuth } from '~~/server/utils/clientAuth'
import { queryOneFresh } from '~~/server/utils/db'
import { pageStudioHttpError } from '~~/server/utils/pageStudio/http'
import { verifyPageStudioProvisioningJobAuthority } from '~~/server/utils/pageStudio/provisioningAuthority'
import { createPageStudioProvisioningJob, dispatchPageStudioProvisioning, requirePageStudioProvisioningRuntime } from '~~/server/utils/pageStudio/provisioningBinding'

const Body = z.object({ expectedRevision: z.number().int().min(1) }).strict()

export default eventHandler(async (event) => {
  try {
    const user = await requireClientAuth(event)
    if (!['admin', 'manager'].includes(user.role)) throw createError({ statusCode: 403, statusMessage: 'Website editing access denied' })
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
      JOIN page_studio_site_memberships membership ON membership.tenant_id = site.tenant_id
        AND membership.client_id = site.client_id AND membership.site_id = site.id
        AND membership.user_id = $3 AND membership.role = 'editor'
      JOIN agency_clients client ON client.id = site.client_id AND client.is_active = TRUE
      WHERE site.client_id = $1 AND site.id = $2
      ORDER BY proposal.revision DESC LIMIT 1
    `, [user.clientId, siteId.data, user.id])
    if (!row || row.clientId !== user.clientId || row.siteId !== siteId.data) throw createError({ statusCode: 404, statusMessage: 'Setup proposal not found' })
    if (row.status !== 'accepted' || row.revision !== parsed.data.expectedRevision) {
      throw createError({ statusCode: 409, statusMessage: 'The current setup proposal must be accepted before provisioning' })
    }
    const env = (event.context as { cloudflare?: { env?: Record<string, unknown> } }).cloudflare?.env
    const { binding, environment } = requirePageStudioProvisioningRuntime(env)
    const request = {
      initiatingActorKind: 'client-user' as const,
      initiatingUserId: user.id,
      requestKey: `page-studio-${row.siteId}-${row.revision}`,
      scope: { businessId: row.clientId, tenantId: row.tenantId, clientId: row.clientId, siteId: row.siteId, environment },
      source: row.source, revision: row.revision, brief: row.brief, plan: row.plan,
      now: new Date().toISOString()
    }
    await verifyPageStudioProvisioningJobAuthority(createPageStudioProvisioningJob(request), environment)
    const job = await dispatchPageStudioProvisioning(binding, request)
    // A retry preserves its original owner. Never substitute the current caller
    // if that owner has lost permission since the job was retained.
    if (job.actor.userId !== user.id) await verifyPageStudioProvisioningJobAuthority(job, environment)
    // Portal callers need progress, never provider resource identifiers or errors.
    return { provisioning: { phase: job.phase, updatedAt: job.updatedAt } }
  } catch (error) {
    pageStudioHttpError(error)
  }
})
