import type { SocialEngagementWallConversationSummary, SocialEngagementWallPost } from '~/types'

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
const MAX_SEARCH_LENGTH = 160
const LATEST_CONVERSATION_LIMIT = 5

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, match => `\\${match}`)
}

function clampLimit(limit: number | undefined) {
  if (!Number.isFinite(limit)) return 60
  return Math.min(Math.max(Math.trunc(limit || 60), 1), MAX_LIMIT)
}

function cleanText(value: string | null | undefined) {
  if (typeof value !== 'string') return null
  const text = value.trim()
  return text.length ? text : null
}

function parseJson(value: unknown): unknown {
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

function recordOrNull(value: unknown): Record<string, unknown> | null {
  const parsed = parseJson(value)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
  return parsed as Record<string, unknown>
}

function arrayOrEmpty(value: unknown): unknown[] {
  const parsed = parseJson(value)
  return Array.isArray(parsed) ? parsed : []
}

function stringOrNull(value: unknown) {
  if (typeof value !== 'string') return null
  const text = value.trim()
  return text.length ? text : null
}

function numberOrZero(value: unknown) {
  const n = Number(value ?? 0)
  return Number.isFinite(n) ? n : 0
}

function numberOrNull(value: unknown) {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function normalizeStatusSummary(value: unknown): SocialEngagementWallPost['status_summary'] {
  const summary = recordOrNull(value)
  return {
    open: numberOrZero(summary?.open),
    snoozed: numberOrZero(summary?.snoozed),
    closed: numberOrZero(summary?.closed)
  }
}

function normalizeMedia(value: unknown): SocialEngagementWallPost['source_post_media'] {
  return arrayOrEmpty(value).flatMap((item) => {
    const media = recordOrNull(item)
    const url = stringOrNull(media?.url)
    if (!url) return []

    return [{
      url,
      type: stringOrNull(media?.type),
      thumbnailUrl: stringOrNull(media?.thumbnailUrl)
    }]
  })
}

function normalizeConversations(value: unknown): SocialEngagementWallConversationSummary[] {
  return arrayOrEmpty(value).flatMap((item) => {
    const row = recordOrNull(item)
    const id = stringOrNull(row?.id)
    if (!id) return []

    return [{
      id,
      participant_name: stringOrNull(row?.participant_name),
      participant_handle: stringOrNull(row?.participant_handle),
      channel_type: stringOrNull(row?.channel_type) ?? 'comment',
      status: stringOrNull(row?.status) ?? 'open',
      assigned_to: stringOrNull(row?.assigned_to),
      unread_count: numberOrZero(row?.unread_count),
      rating: numberOrNull(row?.rating),
      last_message_preview: stringOrNull(row?.last_message_preview),
      last_message_at: stringOrNull(row?.last_message_at),
      latest_author_name: stringOrNull(row?.latest_author_name),
      latest_author_avatar_url: stringOrNull(row?.latest_author_avatar_url)
    }]
  }).slice(0, LATEST_CONVERSATION_LIMIT)
}

export function normalizeSocialInboxWallRows(rows: unknown[]): SocialEngagementWallPost[] {
  return rows.flatMap((item) => {
    const row = recordOrNull(item)
    const key = stringOrNull(row?.key)
    const clientId = stringOrNull(row?.client_id)
    const platform = stringOrNull(row?.platform)
    if (!key || !clientId || !platform) return []

    return [{
      key,
      client_id: clientId,
      platform,
      social_account_id: stringOrNull(row?.social_account_id),
      account_name: stringOrNull(row?.account_name),
      platform_account_id: stringOrNull(row?.platform_account_id),
      source_post_id: stringOrNull(row?.source_post_id),
      source_post_url: stringOrNull(row?.source_post_url),
      source_post_title: stringOrNull(row?.source_post_title),
      source_post_content: stringOrNull(row?.source_post_content),
      source_post_media: normalizeMedia(row?.source_post_media),
      source_post_author_name: stringOrNull(row?.source_post_author_name),
      source_post_author_avatar_url: stringOrNull(row?.source_post_author_avatar_url),
      source_post_published_at: stringOrNull(row?.source_post_published_at),
      linked_social_post_id: stringOrNull(row?.linked_social_post_id),
      campaign_name: stringOrNull(row?.campaign_name),
      status_summary: normalizeStatusSummary(row?.status_summary),
      unread_count: numberOrZero(row?.unread_count),
      conversation_count: numberOrZero(row?.conversation_count),
      message_count: numberOrZero(row?.message_count),
      latest_activity_at: stringOrNull(row?.latest_activity_at),
      latest_conversations: normalizeConversations(row?.latest_conversations)
    }]
  })
}

export function buildSocialInboxWallQuery(input: SocialInboxWallInput): SocialInboxWallQuery {
  const params: unknown[] = [input.clientId.trim()]
  let where = `WHERE c.client_id = $1
    AND (
      c.source_post_id IS NOT NULL
      OR c.source_post_url IS NOT NULL
      OR c.linked_social_post_id IS NOT NULL
    )`

  for (const [column, value] of [
    ['c.platform', input.platform],
    ['c.social_account_id', input.accountId],
    ['c.status', input.status],
    ['c.assigned_to', input.assignedTo]
  ] as const) {
    const text = cleanText(value)
    if (text) {
      params.push(text)
      where += ` AND ${column} = $${params.length}`
    }
  }

  const search = cleanText(input.search)?.slice(0, MAX_SEARCH_LENGTH)
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
    ),
    ranked_conversations AS (
      SELECT
        fc.*,
        lm.author_name AS latest_author_name,
        lm.metadata AS latest_metadata,
        ROW_NUMBER() OVER (
          PARTITION BY fc.wall_key
          ORDER BY fc.last_message_at DESC NULLS LAST, fc.id
        ) AS rn
      FROM filtered_conversations fc
      LEFT JOIN latest_messages lm ON lm.conversation_id = fc.id
    ),
    latest_conversation_summaries AS (
      SELECT
        rc.wall_key,
        COALESCE(jsonb_agg(
          jsonb_build_object(
            'id', rc.id,
            'participant_name', rc.participant_name,
            'participant_handle', rc.participant_handle,
            'channel_type', rc.channel_type,
            'status', rc.status,
            'assigned_to', rc.assigned_to,
            'unread_count', rc.unread_count,
            'rating', rc.rating,
            'last_message_preview', rc.last_message_preview,
            'last_message_at', rc.last_message_at,
            'latest_author_name', rc.latest_author_name,
            'latest_author_avatar_url', rc.latest_metadata->>'authorAvatarUrl'
          )
          ORDER BY rc.last_message_at DESC NULLS LAST
        ), '[]'::jsonb) AS latest_conversations
      FROM ranked_conversations rc
      WHERE rc.rn <= ${LATEST_CONVERSATION_LIMIT}
      GROUP BY rc.wall_key
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
      COALESCE(lcs.latest_conversations, '[]'::jsonb) AS latest_conversations
    FROM filtered_conversations fc
    LEFT JOIN latest_conversation_summaries lcs ON lcs.wall_key = fc.wall_key
    GROUP BY fc.wall_key, lcs.latest_conversations
    ORDER BY MAX(fc.last_message_at) DESC NULLS LAST
    LIMIT ${limitRef}`

  return { sql, params }
}
