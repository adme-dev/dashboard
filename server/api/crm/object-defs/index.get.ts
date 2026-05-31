// server/api/crm/object-defs/index.get.ts — list a client's object defs (optionally by vertical).
import { z } from 'zod'
import { requireAuth } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'

const Query = z.object({ client_id: z.string().uuid(), vertical_key: z.string().optional() })

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const q = Query.parse(getQuery(event))
  const params: unknown[] = [q.client_id]
  let sql = `SELECT * FROM crm_object_defs WHERE client_id = $1 AND deleted_at IS NULL`
  if (q.vertical_key) { params.push(q.vertical_key); sql += ` AND vertical_key = $2` }
  sql += ` ORDER BY position, label`
  return { items: await queryRows(sql, params) }
})
