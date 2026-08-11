// server/api/client-portal/crm/records/index.get.ts — session-scoped record list.
import { z } from 'zod'
import { requireClientAuth } from '~~/server/utils/clientAuth'
import { queryRows, queryCount } from '~~/server/utils/db'
import { assertObjectVisible } from '~~/server/utils/crm/engine/resolveObjects'
import { buildRecordFilter } from '~~/server/utils/crm/engine/recordFilter'
import { loadFieldDefs, titleKeys } from '~~/server/utils/crm/engine/recordWrite'

const Query = z.object({
  objectKey: z.string().min(1),
  q: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(200).default(50),
})

export default defineEventHandler(async (event) => {
  const client = await requireClientAuth(event)
  const q = Query.parse(getQuery(event))
  const obj = await assertObjectVisible(client.clientId, q.objectKey)
  const defs = await loadFieldDefs(obj.id, client.clientId)
  const { where, params } = buildRecordFilter(client.clientId, obj.id, {
    q: q.q,
    titleKeys: titleKeys(defs),
    relationFields: defs
      .filter(def => def.field_type === 'relation')
      .map(def => ({ key: def.key, target: def.relation_target }))
  })
  const offset = (q.page - 1) * q.page_size
  const items = await queryRows(
    `SELECT * FROM crm_records ${where} ORDER BY created_at DESC LIMIT ${q.page_size} OFFSET ${offset}`,
    params,
  )
  const total = await queryCount(`SELECT COUNT(*)::text AS count FROM crm_records ${where}`, params)
  return { items, total, page: q.page, page_size: q.page_size, object: obj, fields: defs }
})
