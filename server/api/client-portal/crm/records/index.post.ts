// server/api/client-portal/crm/records/index.post.ts — create a record (client-scoped).
import { z } from 'zod'
import { requireClientAuth } from '~~/server/utils/clientAuth'
import { queryOne } from '~~/server/utils/db'
import { assertObjectVisible } from '~~/server/utils/crm/engine/resolveObjects'
import { loadFieldDefs, validateAndCheckRelations, assertStageBelongsToClient } from '~~/server/utils/crm/engine/recordWrite'

const Body = z.object({
  objectKey: z.string().min(1),
  data: z.record(z.string(), z.unknown()).optional().default({}),
  stage_id: z.string().uuid().nullable().optional(),
})

export default defineEventHandler(async (event) => {
  const client = await requireClientAuth(event)
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: parsed.error.message })
  const b = parsed.data
  const obj = await assertObjectVisible(client.clientId, b.objectKey)
  const defs = await loadFieldDefs(obj.id, client.clientId)
  const clean = await validateAndCheckRelations(defs, client.clientId, b.data)
  await assertStageBelongsToClient(b.stage_id, client.clientId)
  const row = await queryOne(
    `INSERT INTO crm_records (client_id, object_def_id, data, stage_id)
     VALUES ($1,$2,$3::jsonb,$4) RETURNING *`,
    [client.clientId, obj.id, JSON.stringify(clean), b.stage_id ?? null],
  )
  return { item: row }
})
