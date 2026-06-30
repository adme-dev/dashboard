export interface SocialInboxWallInput {
  clientId: string
  platform?: string | null
  accountId?: string | null
  status?: string | null
  assignedTo?: string | null
  search?: string | null
  limit?: number
}

export interface SocialInboxWallQuery {
  sql: string
  params: unknown[]
}

const MAX_LIMIT = 120

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, match => `\\${match}`)
}

function clampLimit(limit: number | undefined) {
  if (!Number.isFinite(limit)) return 60
  return Math.min(Math.max(Math.trunc(limit || 60), 1), MAX_LIMIT)
}

export function buildSocialInboxWallQuery(input: SocialInboxWallInput): SocialInboxWallQuery {
  const params: unknown[] = [input.clientId]
  let where = 'WHERE c.client_id = $1'

  for (const [column, value] of [
    ['c.platform', input.platform],
    ['c.social_account_id', input.accountId],
    ['c.status', input.status],
    ['c.assigned_to', input.assignedTo]
  ] as const) {
    if (value) {
      params.push(value)
      where += ` AND ${column} = $${params.length}`
    }
  }

  const search = input.search?.trim()
  if (search) {
    params.push(`%${escapeLike(search)}%`)
    const idx = params.length
    where += ` AND (
      c.source_post_title ILIKE $${idx} ESCAPE '\\'
      OR c.source_post_content ILIKE $${idx} ESCAPE '\\'
      OR c.participant_name ILIKE $${idx} ESCAPE '\\'
      OR c.last_message_preview ILIKE $${idx} ESCAPE '\\'
      OR a.account_name ILIKE $${idx} ESCAPE '\\'
      OR EXISTS (
        SELECT 1 FROM social_messages sm
        WHERE sm.conversation_id = c.id
          AND (sm.content ILIKE $${idx} ESCAPE '\\' OR sm.author_name ILIKE $${idx} ESCAPE '\\')
      )
    )`
  }

  params.push(clampLimit(input.limit))
  const limitRef = `$${params.length}`

  const sql = `
    WITH filtered_conversations AS (
      SELECT
        c.*,
        a.account_name,
        a.platform_account_id,
        sp.campaign_id,
        sc.name AS campaign_name,
        COALESCE(c.source_post_id,
          c.source_post_url,
          c.linked_social_post_id::text,
          c.id::text
        ) AS wall_key
      FROM social_conversations c
      LEFT JOIN social_accounts a ON a.id = c.social_account_id
      LEFT JOIN social_posts sp ON sp.id = c.linked_social_post_id
      LEFT JOIN social_campaigns sc ON sc.id = sp.campaign_id
      ${where}
    ),
    latest_messages AS (
      SELECT DISTINCT ON (m.conversation_id)
        m.conversation_id,
        m.author_name,
        m.metadata,
        m.platform_timestamp,
        m.created_at
      FROM social_messages m
      JOIN filtered_conversations fc ON fc.id = m.conversation_id
      WHERE m.direction = 'in'
      ORDER BY m.conversation_id, m.platform_timestamp DESC NULLS LAST, m.created_at DESC
    )
    SELECT
      fc.wall_key AS key,
      MIN(fc.client_id::text) AS client_id,
      MIN(fc.platform) AS platform,
      MIN(fc.social_account_id::text) AS social_account_id,
      MIN(fc.account_name) AS account_name,
      MIN(fc.platform_account_id) AS platform_account_id,
      MIN(fc.source_post_id) AS source_post_id,
      MIN(fc.source_post_url) AS source_post_url,
      MIN(fc.source_post_title) AS source_post_title,
      MIN(fc.source_post_content) AS source_post_content,
      COALESCE(
        (array_agg(fc.source_post_media ORDER BY jsonb_array_length(fc.source_post_media) DESC))[1],
        '[]'::jsonb
      ) AS source_post_media,
      MIN(fc.source_post_author_name) AS source_post_author_name,
      MIN(fc.source_post_author_avatar_url) AS source_post_author_avatar_url,
      MIN(fc.source_post_published_at)::text AS source_post_published_at,
      MIN(fc.linked_social_post_id::text) AS linked_social_post_id,
      MIN(fc.campaign_name) AS campaign_name,
      jsonb_build_object(
        'open', COUNT(*) FILTER (WHERE fc.status = 'open'),
        'snoozed', COUNT(*) FILTER (WHERE fc.status = 'snoozed'),
        'closed', COUNT(*) FILTER (WHERE fc.status = 'closed')
      ) AS status_summary,
      COALESCE(SUM(fc.unread_count), 0)::int AS unread_count,
      COUNT(*)::int AS conversation_count,
      COALESCE(SUM(fc.message_count), 0)::int AS message_count,
      MAX(fc.last_message_at)::text AS latest_activity_at,
      COALESCE(jsonb_agg(
        jsonb_build_object(
          'id', fc.id,
          'participant_name', fc.participant_name,
          'participant_handle', fc.participant_handle,
          'channel_type', fc.channel_type,
          'status', fc.status,
          'assigned_to', fc.assigned_to,
          'unread_count', fc.unread_count,
          'rating', fc.rating,
          'last_message_preview', fc.last_message_preview,
          'last_message_at', fc.last_message_at,
          'latest_author_name', lm.author_name,
          'latest_author_avatar_url', lm.metadata->>'authorAvatarUrl'
        )
        ORDER BY fc.last_message_at DESC NULLS LAST
      ), '[]'::jsonb) AS latest_conversations
    FROM filtered_conversations fc
    LEFT JOIN latest_messages lm ON lm.conversation_id = fc.id
    GROUP BY fc.wall_key
    ORDER BY MAX(fc.last_message_at) DESC NULLS LAST
    LIMIT ${limitRef}`

  return { sql, params }
}
