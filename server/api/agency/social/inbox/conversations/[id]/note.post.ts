import { requireSocialInboxConversation } from '~~/server/utils/socialInbox/departmentScope'
import { departmentConversationScopeSql } from '~~/server/utils/socialInbox/departmentScopeSql'
import { executeSocialInboxMutation } from '~~/server/utils/socialInbox/godModeMutations'
import { insertInternalNote, notifyNoteMentions } from '~~/server/utils/socialInbox/notes'

/**
 * POST /api/agency/social/inbox/conversations/:id/note  body { content, mentions?: string[] }
 * Records a staff-only internal note (never sent to the platform) and notifies @mentioned teammates.
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const { user, department } = await requireSocialInboxConversation(event, id)
  const { content, mentions } = await readBody(event)
  if (!content?.trim()) throw createError({ statusCode: 400, statusMessage: 'content required' })

  const result = await executeSocialInboxMutation(event, 'conversation-note', async (db) => {
    const scopeSql = department ? ` AND ${departmentConversationScopeSql('c')}` : ''
    const conv = (await db.query(`SELECT c.client_id FROM social_conversations c WHERE c.id = $1${scopeSql}`, [id])).rows[0] as { client_id: string } | undefined
    if (!conv) throw createError({ statusCode: 404, statusMessage: 'Not found' })
    const noteId = await insertInternalNote(db, { conversationId: id, clientId: conv.client_id, content: content.trim(), authorId: String(user.id) })
    return { id: noteId, replayed: false }
  }, async (_db, ref) => ({ id: ref, replayed: true }))

  // Mention notifications are best-effort side effects; a replayed attempt already sent them.
  if (!result.replayed) {
    await notifyNoteMentions({ conversationId: id, content: content.trim(), authorId: String(user.id), mentionUserIds: mentions })
  }
  return { ok: true }
})
