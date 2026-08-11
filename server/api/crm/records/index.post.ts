// server/api/crm/records/index.post.ts — create a record (validated against field defs).
import { z } from 'zod'
import { requireWriteAccess } from '~~/server/utils/auth'
import { transaction } from '~~/server/utils/db'
import { assertObjectVisible } from '~~/server/utils/crm/engine/resolveObjects'
import { loadFieldDefs, validateAndCheckRelations, assertStageBelongsToClient } from '~~/server/utils/crm/engine/recordWrite'
import { resolveAgencyCrmSearchContext } from '~~/server/utils/crm/searchContext'

const Body = z.object({
  client_id: z.string().uuid(),
  objectKey: z.string().min(1),
  data: z.record(z.string(), z.unknown()).optional().default({}),
  stage_id: z.string().uuid().nullable().optional(),
})

export default defineEventHandler(async (event) => {
  await requireWriteAccess(event)
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: parsed.error.message })
  const b = parsed.data
  const context = await resolveAgencyCrmSearchContext(event, { clientId: b.client_id, surface: 'agency_global' })
  const obj = await assertObjectVisible(context.clientId, b.objectKey)
  const row = await transaction(async (database) => {
    const defs = await loadFieldDefs(obj.id, context.clientId, database)
    const clean = await validateAndCheckRelations(defs, context.clientId, b.data, context, database)
    await assertStageBelongsToClient(b.stage_id, context.clientId, database)
    const result = await database.query(
      `INSERT INTO crm_records (client_id, object_def_id, data, stage_id, created_by)
       VALUES ($1,$2,$3::jsonb,$4,$5) RETURNING *`,
      [context.clientId, obj.id, JSON.stringify(clean), b.stage_id ?? null, context.actorId]
    )
    return result.rows?.[0] ?? null
  })
  return { item: row }
})
