import { requireAgencyPageStudioAccess } from '~~/server/utils/pageStudio/access'
import { pageStudioHttpError } from '~~/server/utils/pageStudio/http'
import { transaction } from '~~/server/utils/db'
import { z } from 'zod'

const Body = z.object({ decision: z.enum(['accepted', 'rejected']), expectedRevision: z.number().int().min(1).max(2147483647) }).strict()

export default eventHandler(async (event) => {
  try {
    const { tenantId, user } = await requireAgencyPageStudioAccess(event, 'PAGE_STUDIO_APPROVE')
    const siteId = z.string().uuid().safeParse(getRouterParam(event, 'siteId'))
    const parsed = Body.safeParse(await readBody(event))
    if (!siteId.success || !parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid setup proposal decision' })
    const proposal = await transaction(async (db) => {
      // Share the creator's site lock, including when a new revision is racing
      // with a decision on the proposal currently displayed to the reviewer.
      const site = (await db.query<{ client_id: string }>(`
        SELECT client_id FROM page_studio_sites
        WHERE tenant_id = $1 AND id = $2 FOR UPDATE
      `, [tenantId, siteId.data])).rows[0]
      if (!site) throw createError({ statusCode: 404, statusMessage: 'Website not found' })
      const latest = (await db.query<{ revision: number, status: string }>(`
        SELECT revision, status FROM page_studio_setup_proposals
        WHERE tenant_id = $1 AND client_id = $2 AND site_id = $3
        ORDER BY revision DESC LIMIT 1 FOR UPDATE
      `, [tenantId, site.client_id, siteId.data])).rows[0]
      if (latest?.revision !== parsed.data.expectedRevision || latest.status !== 'proposed') {
        throw createError({ statusCode: 409, statusMessage: 'Setup proposal changed or was already decided' })
      }
      const decided = (await db.query(`
        UPDATE page_studio_setup_proposals
        SET status = $1, reviewed_by = $2, reviewed_at = NOW(), updated_at = NOW()
        WHERE tenant_id = $3 AND client_id = $4 AND site_id = $5 AND revision = $6 AND status = 'proposed'
        RETURNING id, site_id AS "siteId", revision, source, brief, plan, status,
                  reviewed_by AS "reviewedBy", reviewed_at AS "reviewedAt"
      `, [parsed.data.decision, user.id, tenantId, site.client_id, siteId.data, parsed.data.expectedRevision])).rows[0]
      if (!decided) throw createError({ statusCode: 409, statusMessage: 'Setup proposal changed or was already decided' })
      return decided
    })
    return { proposal }
  } catch (error) {
    pageStudioHttpError(error)
  }
})
