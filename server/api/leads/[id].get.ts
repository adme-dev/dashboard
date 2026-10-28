import { queryOne, queryRows } from '~~/server/utils/db'
import { safeEmailLeadPresentationSelect } from '~~/server/utils/leads/leadPresentation'
import { resolveMarketingLeadBrowserScope } from '~~/server/utils/leads/followupAccess'

export default defineEventHandler(async (event) => {
  const { marketing } = await resolveMarketingLeadBrowserScope(event)
  const id = getRouterParam(event, 'id')!
  const lead = await queryOne(
    `SELECT l.*, ${safeEmailLeadPresentationSelect('l')}
       FROM leads l ${marketing ? 'JOIN agency_clients c ON c.id=l.client_id AND c.is_active=TRUE' : ''}
      WHERE l.id = $1 AND l.deleted_at IS NULL`,
    [id]
  )
  if (!lead) throw createError({ statusCode: 404, statusMessage: 'not_found' })
  const deliveries = await queryRows(
    `SELECT * FROM lead_deliveries WHERE lead_id = $1 ORDER BY created_at ASC`, [id]
  )
  return { lead, deliveries }
})
