import { z } from 'zod'
import { requireAgencyPageStudioAccess } from '~~/server/utils/pageStudio/access'
import { transaction } from '~~/server/utils/db'
import { pageStudioHttpError } from '~~/server/utils/pageStudio/http'
import { createPageStudioSetupProposal } from '~~/server/utils/pageStudio/setupProposal'

const Body = z.object({
  expectedRevision: z.number().int().min(0).max(2147483646),
  setupSource: z.enum(['template', 'chat']),
  setupBrief: z.string().trim().max(4000).optional()
}).strict().refine(input => input.setupSource !== 'chat' || Boolean(input.setupBrief), 'Chat setup requires a brief')
const Modules = z.object({ allowedModules: z.array(z.string().min(1)).optional() })
const Starter = z.enum(['limousine-v1', 'floristry-v1', 'retail-v1', 'it-goods-v1', 'import-export-v1'])

export default eventHandler(async (event) => {
  try {
    const { tenantId, user } = await requireAgencyPageStudioAccess(event, 'PAGE_STUDIO_EDIT')
    const siteId = z.string().uuid().safeParse(getRouterParam(event, 'siteId'))
    const body = Body.safeParse(await readBody(event))
    if (!siteId.success || !body.success) throw createError({ statusCode: 400, statusMessage: 'Invalid setup proposal request' })
    const proposal = await transaction(async (db) => {
      // Lock the site even when no proposal exists, so concurrent first requests
      // cannot both become revision 1.
      const result = await db.query<{
        tenant_id: string
        client_id: string
        id: string
        name: string
        starter_version: string
        can_setup: boolean
        pages_per_site_limit: number
        plan_metadata: unknown
      }>(`
        SELECT site.tenant_id, site.client_id, site.id, site.name, site.starter_version,
               entitlement.pages_per_site_limit, entitlement.plan_metadata,
               (site.status IN ('draft', 'active') AND client.is_active = TRUE
                AND entitlement.status IN ('trial', 'active') AND entitlement.effective_from <= NOW()
                AND (entitlement.effective_until IS NULL OR entitlement.effective_until > NOW())
                AND entitlement.active_site_limit > 0
                AND (SELECT COUNT(*) FROM page_studio_sites counted
                     WHERE counted.tenant_id = site.tenant_id AND counted.client_id = site.client_id
                       AND counted.status <> 'archived') <= entitlement.active_site_limit) AS can_setup
        FROM page_studio_sites site
        JOIN agency_clients client ON client.id = site.client_id
        JOIN page_studio_entitlements entitlement ON entitlement.tenant_id = site.tenant_id
          AND entitlement.client_id = site.client_id AND entitlement.id = site.entitlement_id
        WHERE site.tenant_id = $1 AND site.id = $2
        FOR UPDATE OF site, entitlement
      `, [tenantId, siteId.data])
      const site = result.rows[0]
      if (!site) throw createError({ statusCode: 404, statusMessage: 'Website not found' })
      if (site.can_setup !== true || !Number.isInteger(site.pages_per_site_limit) || site.pages_per_site_limit < 1) {
        throw createError({ statusCode: 403, statusMessage: 'An active website entitlement is required' })
      }
      const starter = Starter.safeParse(site.starter_version)
      if (!starter.success) throw createError({ statusCode: 422, statusMessage: 'This website does not use a supported business starter' })
      const plan = createPageStudioSetupProposal({ businessName: site.name, starterVersion: starter.data, ...body.data })
      const metadata = Modules.safeParse(site.plan_metadata)
      if (plan.pages.length > site.pages_per_site_limit || !metadata.success
        || (metadata.data.allowedModules && plan.modules.some(module => !metadata.data.allowedModules!.includes(module)))) {
        throw createError({ statusCode: 403, statusMessage: 'The setup proposal exceeds this website entitlement' })
      }
      const latest = await db.query<{ revision: number, status: string }>(`
        SELECT revision, status FROM page_studio_setup_proposals
        WHERE tenant_id = $1 AND client_id = $2 AND site_id = $3
        ORDER BY revision DESC LIMIT 1 FOR UPDATE
      `, [tenantId, site.client_id, site.id])
      const current = latest.rows[0]
      if ((current?.revision ?? 0) !== body.data.expectedRevision || current?.status === 'accepted') {
        throw createError({ statusCode: 409, statusMessage: 'Setup proposal changed or is already accepted' })
      }
      const inserted = await db.query(`
        INSERT INTO page_studio_setup_proposals
          (tenant_id, client_id, site_id, revision, source, brief, plan, status, created_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, 'proposed', $8)
        RETURNING id, site_id AS "siteId", revision, source, brief, plan, status,
                  created_by AS "createdBy", created_at AS "createdAt"
      `, [tenantId, site.client_id, site.id, body.data.expectedRevision + 1, body.data.setupSource,
        body.data.setupBrief || null, JSON.stringify(plan), user.id])
      return inserted.rows[0]
    })
    return { proposal }
  } catch (error) {
    pageStudioHttpError(error)
  }
})
