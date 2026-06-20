/**
 * Observe & Learn W-3 — delete ONE of the caller's own observed/personal memories (the right-to-forget
 * control on the transparency panel). user_id isolation lives in deleteMemoryById's WHERE clause, so a
 * foreign id can never delete another user's row. Department/org memories aren't the caller's to delete
 * (they're curated, scope!='user') — this only ever touches the caller's personal rows.
 * DELETE /api/agency/ai/my-assistant/memories/:id
 */
import { requireAuth } from '~~/server/utils/auth'
import { deleteMemoryById } from '~~/server/utils/ai/memory/store'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing memory id' })

  const deleted = await deleteMemoryById(id, user.id)
  if (!deleted) throw createError({ statusCode: 404, statusMessage: 'Memory not found' })

  return { ok: true, deleted: true }
})
