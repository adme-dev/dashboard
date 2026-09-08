import { requireClientAuth } from '~~/server/utils/clientAuth'
import { pageStudioHttpError } from '~~/server/utils/pageStudio/http'
import { queryOne } from '~~/server/utils/db'
import { z } from 'zod'

const Body = z.object({
  decision: z.enum(['accepted', 'rejected']),
  expectedRevision: z.number().int().min(1)
}).strict()

export default eventHandler(async (event) => {
  try {
    const user = await requireClientAuth(event)
    if (!['admin', 'manager'].includes(user.role)) throw createError({ statusCode: 403, statusMessage: 'Page Studio editing access denied' })
    const siteId = getRouterParam(event, 'id')
    const parsed = Body.safeParse(await readBody(event))
    if (!siteId || !parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid setup proposal decision' })
    const updated = await queryOne(`
      UPDATE page_studio_setup_proposals
      SET status = $1, reviewed_by = $2, reviewed_at = NOW(), updated_at = NOW()
      WHERE client_id = $3 AND site_id = $4 AND revision = $5 AND status = 'proposed'
      RETURNING id, site_id AS "siteId", revision, source, brief, plan, status,
                reviewed_by AS "reviewedBy", reviewed_at AS "reviewedAt"
    `, [parsed.data.decision, user.id, user.clientId, siteId, parsed.data.expectedRevision])
    if (!updated) throw createError({ statusCode: 409, statusMessage: 'Setup proposal changed or was already decided' })
    return { proposal: updated }
  } catch (error) {
    pageStudioHttpError(error)
  }
})
