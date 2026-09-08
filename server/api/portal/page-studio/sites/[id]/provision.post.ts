import { requireClientAuth } from '~~/server/utils/clientAuth'
import { pageStudioHttpError } from '~~/server/utils/pageStudio/http'
import { queryOne } from '~~/server/utils/db'
import { z } from 'zod'

const Body = z.object({ expectedRevision: z.number().int().min(1) }).strict()

export default eventHandler(async (event) => {
  try {
    const user = await requireClientAuth(event)
    if (!['admin', 'manager'].includes(user.role)) throw createError({ statusCode: 403, statusMessage: 'Page Studio editing access denied' })
    const siteId = getRouterParam(event, 'id')
    const parsed = Body.safeParse(await readBody(event))
    if (!siteId || !parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid provisioning request' })
    const row = await queryOne<{
      tenantId: string
      clientId: string
      siteId: string
      revision: number
      status: string
      source: 'template' | 'chat'
      plan: Record<string, unknown>
    }>(`
      SELECT site.tenant_id AS "tenantId", proposal.client_id AS "clientId",
             proposal.site_id AS "siteId", proposal.revision, proposal.status,
             proposal.source, proposal.plan
      FROM page_studio_setup_proposals proposal
      JOIN page_studio_sites site
        ON site.tenant_id = proposal.tenant_id
       AND site.client_id = proposal.client_id
       AND site.id = proposal.site_id
      WHERE proposal.client_id = $1 AND proposal.site_id = $2
        AND proposal.revision = $3
      LIMIT 1
    `, [user.clientId, siteId, parsed.data.expectedRevision])
    if (!row) throw createError({ statusCode: 404, statusMessage: 'Setup proposal not found' })
    if (row.status !== 'accepted') throw createError({ statusCode: 409, statusMessage: 'Setup proposal must be accepted before provisioning' })
    return {
      provisioning: {
        requestKey: `page-studio-${row.siteId}-${row.revision}`,
        scope: { tenantId: row.tenantId, clientId: row.clientId, siteId: row.siteId },
        source: row.source,
        plan: row.plan
      }
    }
  } catch (error) {
    pageStudioHttpError(error)
  }
})
