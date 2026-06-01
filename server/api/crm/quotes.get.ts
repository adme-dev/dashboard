// server/api/crm/quotes.get.ts
// F14 — agency-only lookup for the opportunity↔quote link. Without quote_id, lists
// the client's quotes for the picker; with quote_id, returns that quote for the chip.
import { z } from 'zod'
import { requireAuth } from '~~/server/utils/auth'
import { queryRows, queryOne } from '~~/server/utils/db'

const Query = z.object({
  client_id: z.string().uuid(),
  quote_id: z.string().uuid().optional(),
})

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const q = Query.parse(getQuery(event))
  if (q.quote_id) {
    const quote = await queryOne(
      `SELECT id, quote_number, title, status, subtotal FROM quotes WHERE id = $1 AND client_id = $2`,
      [q.quote_id, q.client_id],
    )
    return { quote }
  }
  const items = await queryRows(
    `SELECT id, quote_number, title, status, subtotal FROM quotes
      WHERE client_id = $1 ORDER BY created_at DESC LIMIT 100`,
    [q.client_id],
  )
  return { items }
})
