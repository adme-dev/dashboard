import { requireAgencyPageStudioAccess } from '~~/server/utils/pageStudio/access'
import { pageStudioHttpError } from '~~/server/utils/pageStudio/http'
import { queryOne } from '~~/server/utils/db'
import { z } from 'zod'

const Body = z.object({ decision: z.enum(['accepted', 'rejected']), expectedRevision: z.number().int().min(1) }).strict()

export default eventHandler(async (event) => {
  try {
    const { tenantId, user } = await requireAgencyPageStudioAccess(event, 'PAGE_STUDIO_APPROVE')
    const siteId = getRouterParam(event, 'siteId')
    const parsed = Body.safeParse(await readBody(event))
    if (!siteId || !parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid setup proposal decision' })
    const proposal = await queryOne(`
      UPDATE page_studio_setup_proposals
      SET status = $1, reviewed_by = $2, reviewed_at = NOW(), updated_at = NOW()
      WHERE tenant_id = $3 AND site_id = $4 AND revision = $5 AND status = 'proposed'
      RETURNING id, site_id AS "siteId", revision, source, brief, plan, status,
                reviewed_by AS "reviewedBy", reviewed_at AS "reviewedAt"
    `, [parsed.data.decision, user.id, tenantId, siteId, parsed.data.expectedRevision])
    if (!proposal) throw createError({ statusCode: 409, statusMessage: 'Setup proposal changed or was already decided' })
    return { proposal }
  } catch (error) { pageStudioHttpError(error) }
})
