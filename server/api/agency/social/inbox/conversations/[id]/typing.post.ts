import { requireAuth } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'
import { emitInboxEvent } from '~~/server/utils/socialInbox/events'

/**
 * POST /api/agency/social/inbox/conversations/:id/typing  body { active?: boolean }
 * Emits a short-lived staff drafting signal over the inbox SSE channel. This is intentionally
 * ephemeral: clients expire the state locally, so no cleanup job or lock table is required.
 */
export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const id = getRouterParam(event, 'id')!
  const body = await readBody<{ active?: boolean }>(event).catch(() => ({}))

  const conv = await queryOne<{ client_id: string }>(
    `SELECT client_id FROM social_conversations WHERE id = $1`,
    [id]
  )
  if (!conv) throw createError({ statusCode: 404, statusMessage: 'Not found' })

  emitInboxEvent({
    clientId: conv.client_id,
    type: 'reply.typing',
    conversationId: id,
    actorId: String(user.id),
    actorName: String(user.name || user.email || 'Team member'),
    active: body.active !== false
  }, event)

  return { ok: true }
})
