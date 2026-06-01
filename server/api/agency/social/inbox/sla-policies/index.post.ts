import { requireAuth } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'

/** POST /api/agency/social/inbox/sla-policies  body { client_id, channel_type?, target_minutes, enabled? } */
export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const b = await readBody(event)
  if (!b?.client_id) throw createError({ statusCode: 400, statusMessage: 'client_id required' })
  return await queryOne(
    `INSERT INTO social_sla_policies (client_id, channel_type, target_minutes, enabled)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (client_id, channel_type) DO UPDATE SET
       target_minutes = EXCLUDED.target_minutes, enabled = EXCLUDED.enabled, updated_at = NOW()
     RETURNING *`,
    [b.client_id, b.channel_type || null, Number(b.target_minutes) > 0 ? Number(b.target_minutes) : 240, b.enabled !== false])
})
