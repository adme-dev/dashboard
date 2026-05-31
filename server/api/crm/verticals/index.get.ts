// server/api/crm/verticals/index.get.ts
import { z } from 'zod'
import { requireAuth } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'

const Query = z.object({ client_id: z.string().uuid().optional() })

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const { client_id } = Query.parse(getQuery(event))
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
