// server/utils/socialInbox/dispatch.ts
// Shared reply-target resolution + send, used by manual reply (2a), autopilot, and approve.
// Keeps the "where does a reply go on each channel" rule in ONE place.
import { getProviderOrThrow } from '~~/server/utils/social-providers/registry'
import { recordOutbound } from './store'

interface TargetDb { queryOne<T = any>(sql: string, params?: any[]): Promise<T | null> }

/** comment → latest inbound comment id (the thing we reply under); review/other → conversation object id. */
export async function resolveReplyTarget(
  db: TargetDb, conversationId: string, conv: { channel_type: string; platform_conversation_id: string },
): Promise<string> {
  if (conv.channel_type === 'comment') {
    const last = await db.queryOne<{ platform_message_id: string }>(
      `SELECT platform_message_id FROM social_messages
         WHERE conversation_id = $1 AND direction = 'in' AND platform_message_id IS NOT NULL
         ORDER BY platform_timestamp DESC NULLS LAST, created_at DESC LIMIT 1`,
      [conversationId],
    )
    if (last?.platform_message_id) return last.platform_message_id
  }
  return conv.platform_conversation_id
}

interface FullDb {
  queryOne<T = any>(sql: string, params?: any[]): Promise<T | null>
  execute(sql: string, params?: any[]): Promise<number>
}

/**
 * Send a reply through the conversation's provider and record it as outbound.
 * `sentByUserId` is a real user id for manual/approved sends, or 'automation' for autopilot.
 */
export async function dispatchReply(
  db: FullDb,
  conversationId: string,
  args: { content: string; sentByUserId: string; aiGenerated?: boolean },
): Promise<{ ok: boolean; platformMessageId?: string; error?: string; clientId?: string }> {
  const conv = await db.queryOne<any>(
    `SELECT c.*, a.platform_account_id, a.access_token
       FROM social_conversations c JOIN social_accounts a ON a.id = c.social_account_id
      WHERE c.id = $1`, [conversationId])
  if (!conv) return { ok: false, error: 'conversation not found' }

  let provider
  try { provider = getProviderOrThrow(conv.platform) } catch (e: any) { return { ok: false, error: String(e?.message ?? e) } }
  if (!provider.reply) return { ok: false, error: `${conv.platform} replies not supported` }

  const target = await resolveReplyTarget(db, conversationId, conv)
  const r = await provider.reply({
    accountId: conv.platform_account_id, accessToken: conv.access_token,
    conversationId: target, content: args.content, channelType: conv.channel_type,
  })
  if (r.status !== 'success') return { ok: false, error: r.error || 'reply failed' }

  await recordOutbound(db as any, conversationId, conv.client_id, {
    platformMessageId: r.platformMessageId || null,
    content: args.content,
    sentByUserId: args.sentByUserId,
  })
  return { ok: true, platformMessageId: r.platformMessageId, clientId: conv.client_id }
}
