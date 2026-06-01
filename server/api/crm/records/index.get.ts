// server/api/crm/records/index.get.ts — list records of one object (paginated, title search).
import { z } from 'zod'
import { requireAuth } from '~~/server/utils/auth'
import { queryRows, queryCount } from '~~/server/utils/db'
import { assertObjectVisible } from '~~/server/utils/crm/engine/resolveObjects'
import { buildRecordFilter } from '~~/server/utils/crm/engine/recordFilter'
import { loadFieldDefs, titleKeys } from '~~/server/utils/crm/engine/recordWrite'

const Query = z.object({
  client_id: z.string().uuid(),
  objectKey: z.string().min(1),
  q: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(200).default(50),
})

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const q = Query.parse(getQuery(event))
  const obj = await assertObjectVisible(q.client_id, q.objectKey)
  const defs = await loadFieldDefs(obj.id, q.client_id)
  const { where, params } = buildRecordFilter(q.client_id, obj.id, { q: q.q, titleKeys: titleKeys(defs) })
  const offset = (q.page - 1) * q.page_size
  const items = await queryRows(
    `SELECT * FROM crm_records ${where} ORDER BY created_at DESC LIMIT ${q.page_size} OFFSET ${offset}`,
    params,
  )
  const total = await queryCount(`SELECT COUNT(*)::text AS count FROM crm_records ${where}`, params)
  return { items, total, page: q.page, page_size: q.page_size, object: obj, fields: defs }
})
