import { requireAuth } from '~~/server/utils/auth'
import { executeSocialInboxMutation } from '~~/server/utils/socialInbox/godModeMutations'

/** PATCH /api/agency/social/inbox/sla-policies/:id  body { target_minutes?, enabled? } */
export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const id = getRouterParam(event, 'id')!
  const b = await readBody(event)
  const sets: string[] = []
  const params: any[] = []
  const set = (col: string, val: any) => { params.push(val); sets.push(`${col} = $${params.length}`) }
  if (b.target_minutes != null && Number(b.target_minutes) > 0) set('target_minutes', Number(b.target_minutes))
  if (b.enabled != null) set('enabled', !!b.enabled)
  if (!sets.length) throw createError({ statusCode: 400, statusMessage: 'nothing to update' })
  params.push(id)
  return await executeSocialInboxMutation<any>(event, 'sla-policy-update', async (db) => {
    const { rows } = await db.query(`UPDATE social_sla_policies SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${params.length} RETURNING *`, params)
    const row = rows[0]
    if (!row) throw createError({ statusCode: 404, statusMessage: 'Not found' })
    return row
  }, async (db, ref) => {
    const { rows } = await db.query(`SELECT * FROM social_sla_policies WHERE id = $1`, [ref])
    return rows[0] ?? { id: ref }
  })
})
