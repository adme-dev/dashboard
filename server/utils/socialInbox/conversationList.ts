export interface SocialInboxConversationListInput {
  clientId?: string | null
  channel?: string | null
  platform?: string | null
  status?: string | null
  assignedTo?: string | null
  unassigned?: boolean
  breached?: boolean
  search?: string | null
  limit?: number
  offset?: number
}

export interface SocialInboxConversationListQuery {
  sql: string
  params: unknown[]
}

const MAX_LIMIT = 500

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, match => `\\${match}`)
}

function clampLimit(limit: number | undefined) {
  if (!Number.isFinite(limit)) return 100
  return Math.min(Math.max(Math.trunc(limit || 100), 1), MAX_LIMIT)
}

function clampOffset(offset: number | undefined) {
  if (!Number.isFinite(offset)) return 0
  return Math.max(Math.trunc(offset || 0), 0)
}

export function buildSocialInboxConversationListQuery(input: SocialInboxConversationListInput): SocialInboxConversationListQuery {
  const params: unknown[] = []
  let sql = `
    SELECT
      c.*,
      COALESCE(c.participant_name, latest_in.author_name) AS participant_name,
      client.name AS client_name,
      a.account_name AS social_account_name,
      a.platform_account_id AS social_account_platform_id
    FROM social_conversations c
    LEFT JOIN social_accounts a ON a.id = c.social_account_id
    LEFT JOIN agency_clients client ON client.id = a.client_id
    LEFT JOIN LATERAL (
      SELECT author_name
      FROM social_messages m
      WHERE m.conversation_id = c.id
        AND m.direction = 'in'
        AND m.author_name IS NOT NULL
      ORDER BY m.platform_timestamp DESC NULLS LAST, m.created_at DESC
      LIMIT 1
    ) latest_in ON TRUE
    WHERE a.is_active = TRUE`

  if (input.clientId) {
    params.push(input.clientId)
    sql += ` AND a.client_id = $${params.length}`
  }

  for (const [col, value] of [
    ['channel_type', input.channel],
    ['platform', input.platform],
    ['status', input.status],
    ['assigned_to', input.assignedTo]
  ] as const) {
    if (value) {
      params.push(value)
      sql += ` AND c.${col} = $${params.length}`
    }
  }

  if (input.unassigned) sql += ' AND c.assigned_to IS NULL'
  if (input.breached) sql += ' AND c.sla_breached = TRUE'

  const search = input.search?.trim()
  if (search) {
    params.push(`%${escapeLike(search)}%`)
    const idx = params.length
    sql += ` AND (
      c.participant_name ILIKE $${idx} ESCAPE '\\'
      OR c.participant_handle ILIKE $${idx} ESCAPE '\\'
      OR latest_in.author_name ILIKE $${idx} ESCAPE '\\'
      OR a.account_name ILIKE $${idx} ESCAPE '\\'
      OR a.platform_account_id ILIKE $${idx} ESCAPE '\\'
      OR c.last_message_preview ILIKE $${idx} ESCAPE '\\'
      OR EXISTS (
        SELECT 1
        FROM social_messages sm
        WHERE sm.conversation_id = c.id
          AND (
            sm.content ILIKE $${idx} ESCAPE '\\'
            OR sm.author_name ILIKE $${idx} ESCAPE '\\'
          )
      )
    )`
  }

  params.push(clampLimit(input.limit))
  sql += ` ORDER BY c.last_message_at DESC NULLS LAST LIMIT $${params.length}`

  params.push(clampOffset(input.offset))
  sql += ` OFFSET $${params.length}`

  return { sql, params }
}
