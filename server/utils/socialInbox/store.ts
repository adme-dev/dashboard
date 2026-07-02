// server/utils/socialInbox/store.ts
// Idempotent persistence for inbox conversations + messages. Takes an injected
// query runner so the upsert logic is unit-testable without a live DB.
//
// Idempotency contract: the conversation's counters (message_count/unread_count) and
// last_message_* fields are only advanced when a message row is ACTUALLY new. A duplicate
// delivery (webhook retry / overlapping poll window) inserts no message row and must not
// move any counter — so the conversation bump runs AFTER, gated on rows-affected.
import type { NormalizedEvent } from './types'

export interface DbRunner {
  queryOne<T = unknown>(sql: string, params?: unknown[]): Promise<T | null>
  execute(sql: string, params?: unknown[]): Promise<number>
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function textOrNull(value: unknown): string | null {
  if (value == null) return null
  const text = String(value).trim()
  return text.length ? text : null
}

function uuidOrNull(value: unknown): string | null {
  const text = textOrNull(value)
  return text && UUID_RE.test(text) ? text : null
}

function sourcePostFromEvent(ev: NormalizedEvent) {
  const post = ev.message.metadata?.sourcePost
  if (!post || typeof post !== 'object') return null

  const imageUrl = textOrNull(post.imageUrl)
  const thumbnailUrl = textOrNull(post.thumbnailUrl)
  const mediaType = textOrNull(post.mediaType) ?? 'image'
  const media = [
    imageUrl ? { url: imageUrl, type: mediaType, thumbnailUrl } : null,
    !imageUrl && thumbnailUrl ? { url: thumbnailUrl, type: mediaType, thumbnailUrl } : null
  ].filter(Boolean)

  return {
    id: textOrNull(post.id),
    url: textOrNull(post.permalink) ?? textOrNull(ev.permalink),
    title: textOrNull(post.title),
    content: textOrNull(post.text),
    media,
    authorName: textOrNull(post.authorName),
    authorAvatarUrl: textOrNull(post.authorAvatarUrl),
    publishedAt: textOrNull(post.publishedAt)
  }
}

async function resolveLinkedSocialPostId(
  db: DbRunner,
  clientId: string,
  platform: string,
  sourcePostId: string | null
): Promise<string | null> {
  if (!sourcePostId) return null
  const row = await db.queryOne<{ id: string }>(
    `SELECT p.id
       FROM social_posts p
       JOIN LATERAL jsonb_each(p.platform_results) AS result(key, value) ON TRUE
      WHERE p.client_id = $1
        AND COALESCE(result.value->>'platform', split_part(result.key, ':', 1)) = $2
        AND result.value->>'platformPostId' = $3
      ORDER BY p.published_at DESC NULLS LAST, p.updated_at DESC NULLS LAST
      LIMIT 1`,
    [clientId, platform, sourcePostId]
  )
  return row?.id ?? null
}

/** Ensure the conversation exists (identity/profile fields only — NO counter/last_message bump). */
async function ensureConversation(db: DbRunner, clientId: string, accountId: string, ev: NormalizedEvent): Promise<string> {
  const isOutbound = ev.message.direction === 'out'
  const participantId = isOutbound ? null : (ev.participant.id ?? ev.message.authorId ?? null)
  const participantName = isOutbound ? null : (ev.participant.name ?? ev.message.authorName ?? null)
  const campaignIdentity = ev.campaignIdentity ?? {}
  const linkedSocialCampaignId = uuidOrNull(campaignIdentity.linkedSocialCampaignId)
  const paidMediaConnectionId = uuidOrNull(campaignIdentity.paidMediaConnectionId)
  const paidMediaPlatform = textOrNull(campaignIdentity.paidMediaPlatform)
  const paidMediaAccountId = textOrNull(campaignIdentity.paidMediaAccountId)
  const paidMediaCampaignId = textOrNull(campaignIdentity.paidMediaCampaignId)
  const paidMediaCampaignName = textOrNull(campaignIdentity.paidMediaCampaignName)
  const sourcePost = sourcePostFromEvent(ev)
  const linkedSocialPostId = await resolveLinkedSocialPostId(db, clientId, ev.platform, sourcePost?.id ?? null)

  const row = await db.queryOne<{ id: string }>(
    `INSERT INTO social_conversations
       (client_id, social_account_id, platform, channel_type, platform_conversation_id,
        permalink, participant_id, participant_name, participant_handle, rating,
        linked_social_campaign_id, paid_media_platform, paid_media_connection_id,
        paid_media_account_id, paid_media_campaign_id, paid_media_campaign_name,
        source_post_id, source_post_url, source_post_title, source_post_content,
        source_post_media, source_post_author_name, source_post_author_avatar_url,
        source_post_published_at, linked_social_post_id,
        paid_media_linked_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,
       $17,$18,$19,$20,$21::jsonb,$22,$23,$24::timestamptz,
       $25::uuid,
       CASE WHEN $12::text IS NOT NULL OR $13::uuid IS NOT NULL OR $14::text IS NOT NULL OR $15::text IS NOT NULL THEN NOW() ELSE NULL END,
       NOW())
     ON CONFLICT (social_account_id, channel_type, platform_conversation_id) DO UPDATE SET
       participant_id = COALESCE(EXCLUDED.participant_id, social_conversations.participant_id),
       participant_name = COALESCE(EXCLUDED.participant_name, social_conversations.participant_name),
       participant_handle = COALESCE(EXCLUDED.participant_handle, social_conversations.participant_handle),
       permalink = COALESCE(EXCLUDED.permalink, social_conversations.permalink),
       rating = COALESCE(EXCLUDED.rating, social_conversations.rating),
       linked_social_campaign_id = COALESCE(EXCLUDED.linked_social_campaign_id, social_conversations.linked_social_campaign_id),
       paid_media_platform = COALESCE(EXCLUDED.paid_media_platform, social_conversations.paid_media_platform),
       paid_media_connection_id = COALESCE(EXCLUDED.paid_media_connection_id, social_conversations.paid_media_connection_id),
       paid_media_account_id = COALESCE(EXCLUDED.paid_media_account_id, social_conversations.paid_media_account_id),
       paid_media_campaign_id = COALESCE(EXCLUDED.paid_media_campaign_id, social_conversations.paid_media_campaign_id),
       paid_media_campaign_name = COALESCE(EXCLUDED.paid_media_campaign_name, social_conversations.paid_media_campaign_name),
       source_post_id = COALESCE(EXCLUDED.source_post_id, social_conversations.source_post_id),
       source_post_url = COALESCE(EXCLUDED.source_post_url, social_conversations.source_post_url),
       source_post_title = COALESCE(EXCLUDED.source_post_title, social_conversations.source_post_title),
       source_post_content = COALESCE(EXCLUDED.source_post_content, social_conversations.source_post_content),
       source_post_media = CASE
         WHEN jsonb_array_length(EXCLUDED.source_post_media) > 0 THEN EXCLUDED.source_post_media
         ELSE social_conversations.source_post_media
       END,
       source_post_author_name = COALESCE(EXCLUDED.source_post_author_name, social_conversations.source_post_author_name),
       source_post_author_avatar_url = COALESCE(EXCLUDED.source_post_author_avatar_url, social_conversations.source_post_author_avatar_url),
       source_post_published_at = COALESCE(EXCLUDED.source_post_published_at, social_conversations.source_post_published_at),
       linked_social_post_id = COALESCE(EXCLUDED.linked_social_post_id, social_conversations.linked_social_post_id),
       paid_media_linked_at = CASE
         WHEN EXCLUDED.paid_media_linked_at IS NOT NULL THEN NOW()
         ELSE social_conversations.paid_media_linked_at
       END,
       updated_at = NOW()
    RETURNING id`,
    [clientId, accountId, ev.platform, ev.channelType, ev.platformConversationId,
      ev.permalink ?? null, participantId, participantName, ev.participant.handle ?? null,
      ev.rating ?? null, linkedSocialCampaignId, paidMediaPlatform, paidMediaConnectionId,
      paidMediaAccountId, paidMediaCampaignId, paidMediaCampaignName,
      sourcePost?.id ?? null, sourcePost?.url ?? null, sourcePost?.title ?? null,
      sourcePost?.content ?? null, JSON.stringify(sourcePost?.media ?? []),
      sourcePost?.authorName ?? null, sourcePost?.authorAvatarUrl ?? null,
      sourcePost?.publishedAt ?? null, linkedSocialPostId]
  )
  if (!row) throw new Error('ensureConversation: no id returned')
  return row.id
}

/** Insert a message; ON CONFLICT DO NOTHING makes it idempotent. Returns rows affected. */
async function insertMessage(db: DbRunner, conversationId: string, clientId: string, ev: NormalizedEvent): Promise<number> {
  return db.execute(
    `INSERT INTO social_messages
       (conversation_id, client_id, platform_message_id, direction, author_id, author_name,
        message_type, content, attachments, platform_timestamp, parent_message_id, metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,
       CASE WHEN $11::text IS NULL THEN NULL ELSE (
         SELECT id FROM social_messages
         WHERE conversation_id = $1 AND platform_message_id = $11
         ORDER BY created_at ASC
         LIMIT 1
       ) END,
       $12::jsonb)
     ON CONFLICT (conversation_id, platform_message_id) WHERE platform_message_id IS NOT NULL DO NOTHING`,
    [conversationId, clientId, ev.message.platformMessageId, ev.message.direction,
      ev.message.authorId ?? null, ev.message.authorName ?? null, ev.message.messageType,
      ev.message.content ?? '', JSON.stringify(ev.message.attachments ?? []), ev.message.platformTimestamp ?? null,
      ev.message.parentPlatformMessageId ?? null, JSON.stringify(ev.message.metadata ?? {})]
  )
}

async function mergeDuplicateMessageMetadata(db: DbRunner, conversationId: string, ev: NormalizedEvent): Promise<void> {
  const metadata = ev.message.metadata ?? {}
  if (!ev.message.platformMessageId || !Object.keys(metadata).length) return

  await db.execute(
    `UPDATE social_messages SET
       metadata = COALESCE(metadata, '{}'::jsonb) || $3::jsonb
     WHERE conversation_id = $1
       AND platform_message_id = $2
       AND COALESCE(metadata, '{}'::jsonb) IS DISTINCT FROM (COALESCE(metadata, '{}'::jsonb) || $3::jsonb)`,
    [conversationId, ev.message.platformMessageId, JSON.stringify(metadata)]
  )
}

/** Advance conversation counters + last_message snapshot for a genuinely-new inbound message. */
async function bumpConversationForInbound(db: DbRunner, conversationId: string, ev: NormalizedEvent): Promise<void> {
  await db.execute(
    `UPDATE social_conversations SET
       last_message_at = GREATEST(COALESCE(last_message_at, '-infinity'::timestamptz), COALESCE($2::timestamptz, NOW())),
       last_message_preview = $3,
       last_message_direction = 'in',
       message_count = message_count + 1,
       unread_count = unread_count + 1,
       status = CASE WHEN status = 'closed' THEN 'open' ELSE status END,
       automation_state = 'pending',
       updated_at = NOW()
     WHERE id = $1`,
    [conversationId, ev.message.platformTimestamp ?? null, (ev.message.content ?? '').slice(0, 200)]
  )
}

/** Advance conversation counters + last_message snapshot for a genuinely-new outbound platform reply. */
async function bumpConversationForOutbound(db: DbRunner, conversationId: string, ev: NormalizedEvent): Promise<void> {
  await db.execute(
    `UPDATE social_conversations SET
       last_message_at = GREATEST(COALESCE(last_message_at, '-infinity'::timestamptz), COALESCE($2::timestamptz, NOW())),
       last_message_preview = $3,
       last_message_direction = 'out',
       message_count = message_count + 1,
       unread_count = 0,
       first_response_at = COALESCE(first_response_at, COALESCE($2::timestamptz, NOW())),
       updated_at = NOW()
     WHERE id = $1`,
    [conversationId, ev.message.platformTimestamp ?? null, (ev.message.content ?? '').slice(0, 200)]
  )
}

/**
 * Record an inbound event: ensure the conversation, idempotently insert the message,
 * and only bump counters/last_message when the message was actually new.
 */
export async function recordInbound(db: DbRunner, clientId: string, accountId: string, ev: NormalizedEvent) {
  const conversationId = await ensureConversation(db, clientId, accountId, ev)
  const affected = await insertMessage(db, conversationId, clientId, ev)
  if (affected > 0) {
    if (ev.message.direction === 'out') {
      await bumpConversationForOutbound(db, conversationId, ev)
    } else {
      await bumpConversationForInbound(db, conversationId, ev)
    }
  } else {
    await mergeDuplicateMessageMetadata(db, conversationId, ev)
  }
  return { conversationId, inserted: affected > 0 }
}

/** Record an outbound reply we just sent (direction='out'); always a genuinely-new row. */
export async function recordOutbound(
  db: DbRunner, conversationId: string, clientId: string,
  args: { platformMessageId: string | null, content: string, sentByUserId: string, messageType?: string }
): Promise<void> {
  await db.execute(
    `INSERT INTO social_messages
       (conversation_id, client_id, platform_message_id, direction, message_type, content, sent_by_user_id, platform_timestamp)
     VALUES ($1,$2,$3,'out',$4,$5,$6, NOW())`,
    [conversationId, clientId, args.platformMessageId, args.messageType ?? 'text', args.content, args.sentByUserId]
  )
  await db.execute(
    `UPDATE social_conversations SET
       last_message_at = NOW(), last_message_preview = $2, last_message_direction = 'out',
       message_count = message_count + 1, unread_count = 0,
       first_response_at = COALESCE(first_response_at, NOW()),
       updated_at = NOW()
     WHERE id = $1`,
    [conversationId, args.content.slice(0, 200)]
  )
}
