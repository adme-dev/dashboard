// server/api/crm/records/index.get.ts — list records of one object (paginated, title search).
import { z } from 'zod'
import { queryRows, queryCount } from '~~/server/utils/db'
import { assertObjectVisible } from '~~/server/utils/crm/engine/resolveObjects'
import { buildRecordFilter } from '~~/server/utils/crm/engine/recordFilter'
import { loadFieldDefs, titleKeys } from '~~/server/utils/crm/engine/recordWrite'
import { resolveAgencyCrmSearchContext } from '~~/server/utils/crm/searchContext'

const Query = z.object({
  client_id: z.string().uuid(),
  objectKey: z.string().min(1),
  q: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(200).default(50),
})

export default defineEventHandler(async (event) => {
  const q = Query.parse(getQuery(event))
  const context = await resolveAgencyCrmSearchContext(event, { clientId: q.client_id, surface: 'agency_global' })
  const obj = await assertObjectVisible(context.clientId, q.objectKey)
  const defs = await loadFieldDefs(obj.id, context.clientId)
  const { where, params } = buildRecordFilter(context.clientId, obj.id, {
    q: q.q,
    titleKeys: titleKeys(defs),
    context,
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
