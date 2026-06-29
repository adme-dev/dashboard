export interface SocialInboxCaseTimelineQuery {
  sql: string
  params: [string, number]
}

function normalizeLimit(limit: unknown) {
  const parsed = Number(limit)
  if (!Number.isFinite(parsed)) return 50
  return Math.min(Math.max(Math.floor(parsed), 1), 100)
}

export function buildSocialInboxCaseTimelineQuery(
  conversationId: string,
  limit: unknown = 50
): SocialInboxCaseTimelineQuery {
  return {
    sql: `
      WITH conv AS (
        SELECT id, client_id, linked_task_id, linked_client_request_id
        FROM social_conversations c
        WHERE c.id = $1
      ),
      timeline AS (
        SELECT
          sm.id::text AS id,
          'social_message' AS source,
          CASE WHEN sm.is_internal_note THEN 'internal_note' ELSE sm.message_type END AS type,
          COALESCE(sm.platform_timestamp, sm.created_at) AS occurred_at,
          sm.author_name AS actor_name,
          sm.content,
          sm.is_internal_note AS is_internal,
          jsonb_build_object(
            'direction', sm.direction,
            'platform_message_id', sm.platform_message_id,
            'message_type', sm.message_type
          ) AS metadata
        FROM conv c
        JOIN social_messages sm ON sm.conversation_id = c.id

        UNION ALL

        SELECT
          sce.id::text AS id,
          'conversation_event' AS source,
          sce.event_type AS type,
          sce.created_at AS occurred_at,
          tm.name AS actor_name,
          sce.content,
          TRUE AS is_internal,
          sce.metadata
        FROM conv c
        JOIN social_conversation_events sce ON sce.conversation_id = c.id AND sce.client_id = c.client_id
        LEFT JOIN team_members tm ON tm.id::text = sce.actor_id

        UNION ALL

        SELECT
          ta.id::text AS id,
          'task_activity' AS source,
          ta.activity_type AS type,
          ta.created_at AS occurred_at,
          tm.name AS actor_name,
          ta.content,
          COALESCE(ta.is_internal, FALSE) AS is_internal,
          jsonb_build_object(
            'task_id', t.id,
            'task_title', t.title,
            'old_value', ta.old_value,
            'new_value', ta.new_value
          ) AS metadata
        FROM conv c
        JOIN tasks t ON t.id = c.linked_task_id
        JOIN projects p ON p.id = t.project_id AND p.client_id = c.client_id
        JOIN task_activities ta ON ta.task_id = t.id
        LEFT JOIN team_members tm ON tm.id = ta.user_id

        UNION ALL

        SELECT
          crm.id::text AS id,
          'client_request_message' AS source,
          CASE WHEN crm.is_internal THEN 'request_internal_note' ELSE 'request_message' END AS type,
          crm.created_at AS occurred_at,
          COALESCE(cu.name, tm.name) AS actor_name,
          crm.content,
          crm.is_internal AS is_internal,
          jsonb_build_object(
            'client_request_id', cr.id,
            'client_request_title', cr.title,
            'request_status', cr.status,
            'author_type', CASE WHEN crm.client_user_id IS NOT NULL THEN 'client' ELSE 'team' END
          ) AS metadata
        FROM conv c
        JOIN client_requests cr ON cr.id = c.linked_client_request_id AND cr.client_id = c.client_id
        JOIN client_request_messages crm ON crm.request_id = cr.id
        LEFT JOIN client_users cu ON cu.id = crm.client_user_id
        LEFT JOIN team_members tm ON tm.id = crm.team_member_id
      )
      SELECT *
      FROM timeline
      ORDER BY occurred_at DESC
      LIMIT $2`,
    params: [conversationId, normalizeLimit(limit)]
  }
}
