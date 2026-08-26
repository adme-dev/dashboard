import { requireAuth } from '~~/server/utils/auth'
import { executeSocialInboxMutation } from '~~/server/utils/socialInbox/godModeMutations'

/** DELETE /api/agency/social/inbox/automation-rules/:id */
export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const id = getRouterParam(event, 'id')!
  const clientId = getQuery(event).clientId as string
  if (!clientId) throw createError({ statusCode: 400, statusMessage: 'clientId required' })
  const result = await executeSocialInboxMutation(event, 'automation-rule-delete', async (db) => {
    await db.query(`DELETE FROM social_automation_rules WHERE id = $1 AND client_id = $2`, [id, clientId])
    return { id, ok: true }
  }, async (_db, ref) => ({ id: ref, ok: true }))
  return { ok: result.ok }
})
