// server/api/crm/verticals/index.get.ts
import { z } from 'zod'
import { createError } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'

const Query = z.object({
  client_id: z.preprocess(
    value => value === '' ? undefined : value,
    z.string().uuid().optional()
  )
})

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const parsed = Query.safeParse(getQuery(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid client_id' })
  }
  const { client_id } = parsed.data
  const all = await queryRows(`SELECT * FROM crm_verticals ORDER BY is_core DESC, name`)
  let enabled: string[] = ['generic']
  if (client_id) {
    const rows = await queryRows<{ vertical_key: string }>(
      `SELECT vertical_key FROM crm_client_verticals WHERE client_id = $1`,
      [client_id],
    )
    enabled = ['generic', ...rows.map(r => r.vertical_key)]
  }
  return { all, enabled: [...new Set(enabled)] }
})
