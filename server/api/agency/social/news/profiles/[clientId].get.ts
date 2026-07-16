/** GET /api/agency/social/news/profiles/:clientId — client-scoped news and social AI brief. */
import { requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { queryOne } from '~~/server/utils/db'
import { requireSocialClientAccess } from '~~/server/utils/social/clientAccess'
import { normalizeSocialNewsClientProfile } from '~~/server/utils/socialNewsProfile'

export default defineEventHandler(async (event) => {
  await requireRole(event, PERMISSIONS.CREATIVE)
  const clientId = getRouterParam(event, 'clientId') || ''
  if (!clientId) throw createError({ statusCode: 400, statusMessage: 'clientId required' })
  await requireSocialClientAccess(event, clientId)
  const row = await queryOne<Record<string, unknown>>(
    `SELECT p.*, c.name AS client_name, COALESCE(p.industry, c.industry) AS industry,
            COALESCE(p.timezone, c.reporting_timezone, 'Australia/Melbourne') AS timezone
       FROM agency_clients c
       LEFT JOIN social_news_client_profiles p ON p.client_id = c.id
      WHERE c.id = $1`,
    [clientId],
  )
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Client not found' })
  return normalizeSocialNewsClientProfile({ ...row, client_id: clientId })
})
