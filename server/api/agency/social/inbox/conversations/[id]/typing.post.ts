import { requireAuth } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'
import { emitInboxEvent } from '~~/server/utils/socialInbox/events'
import { executeSocialInboxExternalMutation } from '~~/server/utils/socialInbox/godModeMutations'

/**
 * POST /api/agency/social/inbox/conversations/:id/typing  body { active?: boolean }
 * Emits a short-lived staff drafting signal over the inbox SSE channel. This is intentionally
 * ephemeral: clients expire the state locally, so no cleanup job or lock table is required.
 *
 * God mode: the only side effect is the SSE broadcast, so this is an external-ledger family; a
 * replayed owner attempt is a no-op.
 */
export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const id = getRouterParam(event, 'id')!
  const body = await readBody<{ active?: boolean }>(event).catch((): { active?: boolean } => ({}))

  return await executeSocialInboxExternalMutation<{ ok: true }>(event, 'typing', async (run) => {
    if (run.replay) return { ok: true }

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
    await run.markDispatched()

    return { ok: true }
  })
})
