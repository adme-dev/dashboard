export interface SocialInboxConversationDetailQuery {
  sql: string
  params: [string]
}

export function buildSocialInboxConversationDetailQuery(id: string): SocialInboxConversationDetailQuery {
  return {
    sql: `
      SELECT
        c.*,
        COALESCE(c.participant_id, latest_in.author_id) AS participant_id,
        COALESCE(c.participant_name, latest_in.author_name) AS participant_name
      FROM social_conversations c
      LEFT JOIN LATERAL (
        SELECT author_id, author_name
        FROM social_messages m
        WHERE m.conversation_id = c.id
          AND m.direction = 'in'
          AND (m.author_id IS NOT NULL OR m.author_name IS NOT NULL)
        ORDER BY m.platform_timestamp DESC NULLS LAST, m.created_at DESC
        LIMIT 1
      ) latest_in ON TRUE
      WHERE c.id = $1`,
    params: [id]
  }
}
