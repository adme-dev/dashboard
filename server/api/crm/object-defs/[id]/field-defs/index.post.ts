// server/api/crm/object-defs/[id]/field-defs/index.post.ts — define/upsert a field (agency-only).
import { requireAuth, requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { queryOne } from '~~/server/utils/db'
import { FieldDefCreate } from '~~/server/utils/crm/engine/schemas'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  await requireRole(event, PERMISSIONS.ADMIN)
  const objectDefId = getRouterParam(event, 'id')
  const parsed = FieldDefCreate.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: parsed.error.message })
  const b = parsed.data
  // Guard: relation fields must name a target.
  if (b.field_type === 'relation' && !b.relation_target) {
    throw createError({ statusCode: 400, statusMessage: 'relation_target required for relation field' })
  }
  const row = await queryOne(
    `INSERT INTO crm_field_defs (client_id, object_def_id, key, label, field_type, options, relation_target, is_required, is_title, position)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10)
     ON CONFLICT (object_def_id, key) DO UPDATE
       SET label = EXCLUDED.label, field_type = EXCLUDED.field_type, options = EXCLUDED.options,
           relation_target = EXCLUDED.relation_target, is_required = EXCLUDED.is_required,
           is_title = EXCLUDED.is_title, position = EXCLUDED.position, updated_at = NOW()
     RETURNING *`,
    [b.client_id, objectDefId, b.key, b.label, b.field_type, JSON.stringify(b.options),
      b.relation_target ?? null, b.is_required, b.is_title, b.position],
  )
  return { item: row }
})
