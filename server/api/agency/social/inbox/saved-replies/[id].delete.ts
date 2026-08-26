import { requireAuth } from '~~/server/utils/auth'
import { executeSocialInboxMutation } from '~~/server/utils/socialInbox/godModeMutations'

/** DELETE /api/agency/social/inbox/saved-replies/:id */
export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const id = getRouterParam(event, 'id')!
  const result = await executeSocialInboxMutation(event, 'saved-reply-delete', async (db) => {
    await db.query(`DELETE FROM social_saved_replies WHERE id = $1`, [id])
    return { id, ok: true }
  }, async (_db, ref) => ({ id: ref, ok: true }))
  return { ok: result.ok }
})
