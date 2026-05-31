// server/api/crm/object-defs/index.post.ts — define a config object (agency-only).
import { requireAuth, requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { queryOne } from '~~/server/utils/db'
import { ObjectDefCreate } from '~~/server/utils/crm/engine/schemas'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  await requireRole(event, PERMISSIONS.ADMIN)
  const parsed = ObjectDefCreate.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: parsed.error.message })
  const b = parsed.data
  const row = await queryOne(
    `INSERT INTO crm_object_defs (client_id, vertical_key, key, label, label_plural, icon, has_pipeline, position)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (client_id, key) DO UPDATE
       SET label = EXCLUDED.label, label_plural = EXCLUDED.label_plural, icon = EXCLUDED.icon,
           has_pipeline = EXCLUDED.has_pipeline, position = EXCLUDED.position, updated_at = NOW(), deleted_at = NULL
     RETURNING *`,
    [b.client_id, b.vertical_key, b.key, b.label, b.label_plural, b.icon ?? null, b.has_pipeline, b.position],
  )
  return { item: row }
})
