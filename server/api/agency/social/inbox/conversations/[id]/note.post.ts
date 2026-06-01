import { requireAuth } from '~~/server/utils/auth'
import { queryOne, execute } from '~~/server/utils/db'
import { createNotification } from '~~/server/utils/notifications'

/**
 * POST /api/agency/social/inbox/conversations/:id/note  body { content, mentions?: string[] }
 * Records a staff-only internal note (never sent to the platform) and notifies @mentioned teammates.
 */
export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const id = getRouterParam(event, 'id')!
  const { content, mentions } = await readBody(event)
  if (!content?.trim()) throw createError({ statusCode: 400, statusMessage: 'content required' })

  const conv = await queryOne<{ client_id: string }>(`SELECT client_id FROM social_conversations WHERE id = $1`, [id])
  if (!conv) throw createError({ statusCode: 404, statusMessage: 'Not found' })

  await execute(
    `INSERT INTO social_messages (conversation_id, client_id, direction, message_type, content, is_internal_note, sent_by_user_id, platform_timestamp)
     VALUES ($1,$2,'out','note',$3, TRUE, $4, NOW())`,
    [id, conv.client_id, content.trim(), String(user.id)])

  for (const uid of (Array.isArray(mentions) ? mentions : [])) {
    if (uid && uid !== String(user.id)) {
      await createNotification({
        userId: String(uid), type: 'social_assigned', actorId: String(user.id),
        title: 'Mentioned in a social note', message: content.trim().slice(0, 140),
        link: `/agency/social/inbox?c=${id}`, metadata: { conversationId: id },
      })
    }
  }
  return { ok: true }
})
