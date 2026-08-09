// server/api/crm/quotes.get.ts
// F14 — agency-only lookup for the opportunity↔quote link. Without quote_id, lists
// the client's quotes for the picker; with quote_id, returns that quote for the chip.
import { z } from 'zod'
import { requireAuth } from '~~/server/utils/auth'
import { queryRows, queryOne } from '~~/server/utils/db'
import { resolveAgencyCrmSearchContext } from '~~/server/utils/crm/searchContext'
import { crmVisibilityCond } from '~~/server/utils/crm/recordAccess'

const Query = z.object({
  client_id: z.string().uuid(),
  quote_id: z.string().uuid().optional(),
})

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const q = Query.parse(getQuery(event))
  const context = await resolveAgencyCrmSearchContext(event, { clientId: q.client_id, surface: 'agency_global' })
  const visibility = crmVisibilityCond(context, 'opportunity', 'opportunity')
  const visibilityParams: unknown[] = []
  let index = 2
  const visibilitySql = visibility
    ? ` AND ${visibility.sql.replace(/\?/g, () => `$${++index}`)}`
    : ''
  if (visibility) visibilityParams.push(...visibility.params)
  if (q.quote_id) {
    const quote = await queryOne(
      visibility
        ? `SELECT quote.id, quote.quote_number, quote.title, quote.status, quote.subtotal
             FROM quotes quote
             JOIN crm_opportunities opportunity ON opportunity.quote_id = quote.id
              AND opportunity.client_id = quote.client_id AND opportunity.deleted_at IS NULL
            WHERE quote.id = $1 AND quote.client_id = $2${visibilitySql}`
        : `SELECT id, quote_number, title, status, subtotal FROM quotes WHERE id = $1 AND client_id = $2`,
      [q.quote_id, context.clientId, ...visibilityParams],
    )
    if (!quote) throw createError({ statusCode: 404, statusMessage: 'Record not found' })
    return { quote }
  }
  const items = await queryRows(
    visibility
      ? `SELECT quote.id, quote.quote_number, quote.title, quote.status, quote.subtotal
           FROM quotes quote
           JOIN crm_opportunities opportunity ON opportunity.quote_id = quote.id
            AND opportunity.client_id = quote.client_id AND opportunity.deleted_at IS NULL
          WHERE quote.client_id = $1${visibilitySql.replace(/\$3/g, '$2').replace(/\$4/g, '$3')}
          ORDER BY quote.created_at DESC LIMIT 100`
      : `SELECT id, quote_number, title, status, subtotal FROM quotes
          WHERE client_id = $1 ORDER BY created_at DESC LIMIT 100`,
    [context.clientId, ...visibilityParams],
  )
  return { items }
})
