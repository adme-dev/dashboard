import { requireAuth } from '~~/server/utils/auth'
import { createNotification } from '~~/server/utils/notifications'
import { executeSocialInboxMutation } from '~~/server/utils/socialInbox/godModeMutations'

/**
 * POST /api/agency/social/inbox/conversations/:id/note  body { content, mentions?: string[] }
 * Records a staff-only internal note (never sent to the platform) and notifies @mentioned teammates.
 */
export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const id = getRouterParam(event, 'id')!
  const { content, mentions } = await readBody(event)
  if (!content?.trim()) throw createError({ statusCode: 400, statusMessage: 'content required' })

  const result = await executeSocialInboxMutation(event, 'conversation-note', async (db) => {
    const conv = (await db.query(`SELECT client_id FROM social_conversations WHERE id = $1`, [id])).rows[0] as { client_id: string } | undefined
    if (!conv) throw createError({ statusCode: 404, statusMessage: 'Not found' })
    const { rows } = await db.query(
      `INSERT INTO social_messages (conversation_id, client_id, direction, message_type, content, is_internal_note, sent_by_user_id, platform_timestamp)
       VALUES ($1,$2,'out','note',$3, TRUE, $4, NOW()) RETURNING id`,
      [id, conv.client_id, content.trim(), String(user.id)])
    return { id: String(rows[0].id), replayed: false }
  }, async (_db, ref) => ({ id: ref, replayed: true }))

  // Mention notifications are best-effort side effects; a replayed attempt already sent them.
  if (!result.replayed) {
    for (const uid of (Array.isArray(mentions) ? mentions : [])) {
      if (uid && uid !== String(user.id)) {
        await createNotification({
          userId: String(uid), type: 'social_assigned', actorId: String(user.id),
          title: 'Mentioned in a social note', message: content.trim().slice(0, 140),
          link: `/agency/social/inbox?c=${id}`, metadata: { conversationId: id },
        })
      }
    }
  }
  return { ok: true }
})
