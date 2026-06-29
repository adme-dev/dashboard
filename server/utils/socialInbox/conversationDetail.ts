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
        COALESCE(c.participant_name, latest_in.author_name) AS participant_name,
        CASE
          WHEN linked_task.id IS NULL OR linked_project.id IS NULL THEN NULL
          ELSE jsonb_build_object(
            'id', linked_task.id,
            'title', linked_task.title,
            'status_name', linked_task_status.name,
            'project_name', linked_project.name
          )
        END AS linked_task,
        CASE
          WHEN linked_request.id IS NULL THEN NULL
          ELSE jsonb_build_object(
            'id', linked_request.id,
            'title', linked_request.title,
            'status', linked_request.status,
            'request_type', linked_request.request_type
          )
        END AS linked_client_request
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
      LEFT JOIN tasks linked_task ON linked_task.id = c.linked_task_id
      LEFT JOIN task_statuses linked_task_status ON linked_task_status.id = linked_task.status_id
      LEFT JOIN projects linked_project ON linked_project.id = linked_task.project_id AND linked_project.client_id = c.client_id
      LEFT JOIN client_requests linked_request ON linked_request.id = c.linked_client_request_id AND linked_request.client_id = c.client_id
      WHERE c.id = $1`,
    params: [id]
  }
}
