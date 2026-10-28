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
 * `expectedTarget` (reviewed sends) refuses before any provider call when the resolved reply target
 * differs from the one that was reviewed; `onDispatchStart` fires immediately before the provider call,
 * so callers can tell an effect-free refusal from an outcome that may have reached the platform.
 */
export async function dispatchReply(
  db: FullDb,
  conversationId: string,
  args: { content: string, sentByUserId: string, aiGenerated?: boolean, expectedTarget?: string, onDispatchStart?: () => void },
): Promise<{ ok: boolean, platformMessageId?: string, error?: string, clientId?: string, dispatched?: boolean }> {
  const conv = await db.queryOne<any>(
    `SELECT c.*, a.platform_account_id, a.access_token, a.refresh_token, a.token_expires_at, a.metadata AS account_metadata
       FROM social_conversations c JOIN social_accounts a ON a.id = c.social_account_id
      WHERE c.id = $1`, [conversationId])
  if (!conv) return { ok: false, error: 'conversation not found' }

  let provider
  try { provider = getProviderOrThrow(conv.platform) } catch (e: any) { return { ok: false, error: String(e?.message ?? e) } }
  if (!provider.reply) return { ok: false, error: `${conv.platform} replies not supported` }

  // LinkedIn access tokens live ~60 days; refresh (and persist) before replying when near expiry.
  let accessToken = conv.access_token
  if (conv.platform === 'linkedin' && conv.refresh_token) {
    try {
      accessToken = await resolveSocialAccountAccessToken({
        db,
        account: {
          id: conv.social_account_id,
          platform: conv.platform,
          access_token: conv.access_token,
          refresh_token: conv.refresh_token,
          token_expires_at: conv.token_expires_at ?? null
        }
      })
    } catch (e: unknown) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  }

  const target = await resolveReplyTarget(db, conversationId, conv)
  if (args.expectedTarget !== undefined && target !== args.expectedTarget) {
    return { ok: false, error: 'reply_target_changed' }
  }
  // LinkedIn nests one level deep: when the target is itself a nested reply, pass its parent thread.
  const threadParent = conv.platform === 'linkedin' && conv.channel_type === 'comment'
    ? await db.queryOne<{ platform_message_id: string }>(
      `SELECT p.platform_message_id
         FROM social_messages m JOIN social_messages p ON p.id = m.parent_message_id
        WHERE m.conversation_id = $1 AND m.platform_message_id = $2
        LIMIT 1`,
      [conversationId, target])
    : null
  args.onDispatchStart?.()
  const r = await provider.reply({
    accountId: conv.platform_account_id, accessToken,
    conversationId: target, content: args.content, channelType: conv.channel_type,
    threadParentId: threadParent?.platform_message_id ?? undefined,
    // IG DMs route through the linked Page (stored on the IG account row at metadata.via_page_id).
    viaPageId: conv.account_metadata?.via_page_id,
  })
  if (r.status !== 'success') return { ok: false, error: r.error || 'reply failed', dispatched: true }

  await recordOutbound(db as any, conversationId, conv.client_id, {
    platformMessageId: r.platformMessageId || null,
    content: args.content,
    sentByUserId: args.sentByUserId,
  })
  return { ok: true, platformMessageId: r.platformMessageId, clientId: conv.client_id, dispatched: true }
}
