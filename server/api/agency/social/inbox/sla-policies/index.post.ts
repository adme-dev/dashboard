import { requireAuth } from '~~/server/utils/auth'
import { executeSocialInboxMutation } from '~~/server/utils/socialInbox/godModeMutations'

/** POST /api/agency/social/inbox/sla-policies  body { client_id, channel_type?, target_minutes, enabled? } */
export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const b = await readBody(event)
  if (!b?.client_id) throw createError({ statusCode: 400, statusMessage: 'client_id required' })
  const channel = b.channel_type || null
  const minutes = Number(b.target_minutes) > 0 ? Number(b.target_minutes) : 240
  const enabled = b.enabled !== false
  // The all-channels (NULL channel_type) row upserts on the partial unique index; channel-specific
  // rows upsert on the (client_id, channel_type) unique constraint.
  const conflict = channel === null
    ? `ON CONFLICT (client_id) WHERE channel_type IS NULL`
    : `ON CONFLICT (client_id, channel_type)`
  return await executeSocialInboxMutation<any>(event, 'sla-policy-create', async (db) => {
    const { rows } = await db.query(
      `INSERT INTO social_sla_policies (client_id, channel_type, target_minutes, enabled)
       VALUES ($1,$2,$3,$4)
       ${conflict} DO UPDATE SET
         target_minutes = EXCLUDED.target_minutes, enabled = EXCLUDED.enabled, updated_at = NOW()
       RETURNING *`,
      [b.client_id, channel, minutes, enabled])
    return rows[0]
  }, async (db, ref) => {
    const { rows } = await db.query(`SELECT * FROM social_sla_policies WHERE id = $1`, [ref])
    return rows[0] ?? { id: ref }
  })
})
