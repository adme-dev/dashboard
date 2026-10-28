import { requireDealerFeedAccess } from '~~/server/utils/feeds/departmentAccess'
import { queryRowsFresh } from '~~/server/utils/db'
import { listDealerLinks } from '~~/server/utils/feeds/dealerLinkStore'

export default defineEventHandler(async (event) => {
  await requireDealerFeedAccess(event)

  const query = getQuery(event)
  const status
    = typeof query.status === 'string' && query.status.trim()
      ? query.status
      : 'active'
  const providerId
    = typeof query.providerId === 'string' ? query.providerId : undefined
  const clientId
    = typeof query.clientId === 'string' ? query.clientId : undefined

  if (clientId) await requireDealerFeedAccess(event, clientId)
  try {
    const links = await listDealerLinks({
      status,
      providerId,
      clientId,
      queryRows: (sql, params) =>
        queryRowsFresh(
          `SELECT scoped.* FROM (${sql}) scoped JOIN agency_clients active_client ON active_client.id = scoped.client_id AND active_client.is_active = TRUE`,
          params
        )
    })
    return { ok: true, links }
  } catch {
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to list dealer feed links'
    })
  }
})
