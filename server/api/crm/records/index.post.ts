// server/api/crm/records/index.post.ts — create a record (validated against field defs).
import { z } from 'zod'
import { requireAuth, requireWriteAccess } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'
import { assertObjectVisible } from '~~/server/utils/crm/engine/resolveObjects'
import { loadFieldDefs, validateAndCheckRelations } from '~~/server/utils/crm/engine/recordWrite'

const Body = z.object({
  client_id: z.string().uuid(),
  objectKey: z.string().min(1),
  data: z.record(z.string(), z.unknown()).optional().default({}),
  stage_id: z.string().uuid().nullable().optional(),
})

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  await requireWriteAccess(event)
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: parsed.error.message })
  const b = parsed.data
  const obj = await assertObjectVisible(b.client_id, b.objectKey)
  const defs = await loadFieldDefs(obj.id, b.client_id)
  const clean = await validateAndCheckRelations(defs, b.client_id, b.data)
  const row = await queryOne(
    `INSERT INTO crm_records (client_id, object_def_id, data, stage_id, created_by)
     VALUES ($1,$2,$3::jsonb,$4,$5) RETURNING *`,
    [b.client_id, obj.id, JSON.stringify(clean), b.stage_id ?? null, user.id],
  )
  return { item: row }
})
