// server/utils/socialInbox/dispatch.ts
// Shared reply-target resolution + send, used by manual reply (2a), autopilot, and approve.
// Keeps the "where does a reply go on each channel" rule in ONE place.
import { getProviderOrThrow } from '~~/server/utils/social-providers/registry'
import { recordOutbound } from './store'
import { resolveSocialAccountAccessToken } from './tokenRefresh'

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
    `SELECT c.*, a.platform_account_id, a.access_token, a.refresh_token, a.token_expires_at,
            a.is_active, a.metadata AS account_metadata
       FROM social_conversations c JOIN social_accounts a ON a.id = c.social_account_id
      WHERE c.id = $1`, [conversationId])
  if (!conv) return { ok: false, error: 'conversation not found' }
  if (conv.is_active === false) return { ok: false, error: 'Account is disconnected. Reconnect before replying.' }

  let provider
  try { provider = getProviderOrThrow(conv.platform) } catch (e: any) { return { ok: false, error: String(e?.message ?? e) } }
  if (!provider.reply) return { ok: false, error: `${conv.platform} replies not supported` }

  const target = await resolveReplyTarget(db, conversationId, conv)
  let accessToken: string
  try {
    accessToken = await resolveSocialAccountAccessToken({ db, account: {
      id: conv.social_account_id, platform: conv.platform, access_token: conv.access_token,
      refresh_token: conv.refresh_token, token_expires_at: conv.token_expires_at
    } })
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Token refresh failed' }
  }
  const automaticReview = args.sentByUserId === 'automation' && conv.channel_type === 'review'
  const inbound = automaticReview ? await db.queryOne<{ content: string }>(
    `SELECT content FROM social_messages WHERE conversation_id = $1 AND direction = 'in'
     ORDER BY platform_timestamp DESC NULLS LAST, created_at DESC LIMIT 1`, [conversationId]) : null
  const r = await provider.reply({
    accountId: conv.platform_account_id, accessToken,
    conversationId: target, content: args.content, channelType: conv.channel_type,
    // IG DMs route through the linked Page (stored on the IG account row at metadata.via_page_id).
    viaPageId: conv.account_metadata?.via_page_id,
    onlyIfUnanswered: automaticReview,
    expectedReviewContent: inbound?.content,
  })
  if (r.status !== 'success') return { ok: false, error: r.error || 'reply failed' }

  await recordOutbound(db as any, conversationId, conv.client_id, {
    platformMessageId: r.platformMessageId || null,
    content: args.content,
    sentByUserId: args.sentByUserId,
    messageType: conv.channel_type === 'review' ? 'review_reply' : 'text',
    aiGenerated: args.aiGenerated,
  })
  return { ok: true, platformMessageId: r.platformMessageId, clientId: conv.client_id }
}
