import { requireAuth } from '~~/server/utils/auth'
import { queryOne, execute } from '~~/server/utils/db'
import { getProviderOrThrow } from '~~/server/utils/social-providers/registry'
import { recordOutbound } from '~~/server/utils/socialInbox/store'

/**
 * POST /api/agency/social/inbox/conversations/:id/reply
 * Send a manual reply through the conversation's platform provider, then record it.
 *
 * Reply target differs by channel:
 *  - comment  → the latest inbound comment's platform_message_id (the comment we're replying to)
 *  - review   → the conversation's platform_conversation_id (review resource / object id)
 */
export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const id = getRouterParam(event, 'id')!
  const { content } = await readBody(event)
  if (!content?.trim()) throw createError({ statusCode: 400, statusMessage: 'content required' })

  const conv = await queryOne<any>(
    `SELECT c.*, a.platform_account_id, a.access_token
       FROM social_conversations c
       JOIN social_accounts a ON a.id = c.social_account_id
      WHERE c.id = $1`,
    [id],
  )
  if (!conv) throw createError({ statusCode: 404, statusMessage: 'Not found' })

  const provider = getProviderOrThrow(conv.platform)
  if (!provider.reply) throw createError({ statusCode: 400, statusMessage: `${conv.platform} replies not supported` })

  let target = conv.platform_conversation_id
  if (conv.channel_type === 'comment') {
    const lastInbound = await queryOne<{ platform_message_id: string }>(
      `SELECT platform_message_id FROM social_messages
         WHERE conversation_id = $1 AND direction = 'in' AND platform_message_id IS NOT NULL
         ORDER BY platform_timestamp DESC NULLS LAST, created_at DESC LIMIT 1`,
      [id],
    )
    if (lastInbound?.platform_message_id) target = lastInbound.platform_message_id
  }

  const r = await provider.reply({
    accountId: conv.platform_account_id,
    accessToken: conv.access_token,
    conversationId: target,
    content: content.trim(),
  })
  if (r.status !== 'success') throw createError({ statusCode: 502, statusMessage: r.error || 'reply failed' })

  await recordOutbound({ queryOne, execute }, id, conv.client_id, {
    platformMessageId: r.platformMessageId || null,
    content: content.trim(),
    sentByUserId: String(user.id),
  })
  return { ok: true, platformMessageId: r.platformMessageId }
})
