import { requireClientAuth } from '~~/server/utils/clientAuth'
import { pageStudioHttpError } from '~~/server/utils/pageStudio/http'
import { transaction } from '~~/server/utils/db'
import { createPageStudioSetupProposal } from '~~/server/utils/pageStudio/setupProposal'
import { z } from 'zod'

const Body = z.object({
  expectedRevision: z.number().int().min(1),
  setupBrief: z.string().trim().max(4000)
}).strict()

export default eventHandler(async (event) => {
  try {
    const user = await requireClientAuth(event)
    if (!['admin', 'manager'].includes(user.role)) throw createError({ statusCode: 403, statusMessage: 'Page Studio editing access denied' })
    const siteId = getRouterParam(event, 'id')
    const parsed = Body.safeParse(await readBody(event))
    if (!siteId || !parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid setup proposal revision' })
    const proposal = await transaction(async (db) => {
      const latest = await db.query<{
        tenant_id: string
        client_id: string
        site_id: string
        revision: number
        source: 'template' | 'chat'
        brief: string | null
        plan: { businessName?: string, starterVersion?: string }
        status: 'proposed' | 'accepted' | 'rejected'
      }>(`
        SELECT proposal.tenant_id, proposal.client_id, proposal.site_id,
               proposal.revision, proposal.source, proposal.brief, proposal.plan
        FROM page_studio_setup_proposals proposal
        WHERE proposal.client_id = $1 AND proposal.site_id = $2
          AND EXISTS (
            SELECT 1 FROM page_studio_site_memberships membership
            WHERE membership.tenant_id = proposal.tenant_id
              AND membership.client_id = proposal.client_id
              AND membership.site_id = proposal.site_id
              AND membership.user_id = $3
          )
        ORDER BY proposal.revision DESC
        LIMIT 1
        FOR UPDATE
      `, [user.clientId, siteId, user.id])
      const current = latest.rows[0]
      if (!current || current.revision !== parsed.data.expectedRevision || current.status === 'accepted') {
        throw createError({ statusCode: 409, statusMessage: 'Setup proposal changed or is no longer editable' })
      }
      const businessName = typeof current.plan?.businessName === 'string' ? current.plan.businessName : 'Website'
      const starterVersion = typeof current.plan?.starterVersion === 'string' ? current.plan.starterVersion : 'automotive-campaign-v1'
      const plan = createPageStudioSetupProposal({ businessName, starterVersion, setupSource: current.source, setupBrief: parsed.data.setupBrief })
      const inserted = await db.query(`
        INSERT INTO page_studio_setup_proposals
          (tenant_id, client_id, site_id, revision, source, brief, plan, status, created_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, 'proposed', $8)
        RETURNING id, site_id AS "siteId", revision, source, brief, plan, status,
                  created_by AS "createdBy", created_at AS "createdAt"
      `, [current.tenant_id, current.client_id, current.site_id, current.revision + 1, current.source, parsed.data.setupBrief || null, JSON.stringify(plan), user.id])
      return inserted.rows[0]
    })
    return { proposal }
  } catch (error) {
    pageStudioHttpError(error)
  }
})
