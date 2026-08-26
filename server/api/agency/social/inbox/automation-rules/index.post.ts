import { requireAuth } from '~~/server/utils/auth'
import { executeSocialInboxMutation } from '~~/server/utils/socialInbox/godModeMutations'

/** Confidence floor must be a finite number in [0,1]; default 0.7. Guards the autopilot safety gate. */
function clampFloor(v: unknown): number {
  const n = Number(v ?? 0.7)
  if (!Number.isFinite(n)) return 0.7
  return Math.min(1, Math.max(0, n))
}

/** POST /api/agency/social/inbox/automation-rules  body: full rule (client_id required) */
export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const b = await readBody(event)
  if (!b?.client_id || !b?.name?.trim()) throw createError({ statusCode: 400, statusMessage: 'client_id and name required' })
  const mode = ['off', 'suggest', 'approval', 'autopilot'].includes(b.mode) ? b.mode : 'off'
  return await executeSocialInboxMutation<any>(event, 'automation-rule-create', async (db) => {
    const { rows } = await db.query(
      `INSERT INTO social_automation_rules
         (client_id, name, platform, channel_type, mode, conditions, action, approval_by, rate_limit,
          confidence_floor, business_hours, priority, enabled, created_by)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,$9,$10,$11::jsonb,$12,$13,$14) RETURNING *`,
      [b.client_id, b.name.trim(), b.platform ?? null, b.channel_type ?? null, mode,
       JSON.stringify(b.conditions ?? {}), JSON.stringify(b.action ?? {}),
       ['staff', 'client', 'none'].includes(b.approval_by) ? b.approval_by : 'staff',
       Number(b.rate_limit) || 0, clampFloor(b.confidence_floor),
       b.business_hours ? JSON.stringify(b.business_hours) : null,
       Number(b.priority) || 100, b.enabled !== false, String(user.id)])
    return rows[0]
  }, async (db, ref) => {
    const { rows } = await db.query(`SELECT * FROM social_automation_rules WHERE id = $1`, [ref])
    return rows[0] ?? { id: ref }
  })
})
