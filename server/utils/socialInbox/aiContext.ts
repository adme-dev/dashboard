import { queryOne, queryRows } from '~~/server/utils/db'
import type { SocialInboxTriageContext } from './aiTriage'
import type { SocialInboxPriority } from './conversationPatch'

interface ConversationRow {
  id: string
  client_id: string
  client_name: string | null
  platform: string
  channel_type: string
  participant_name: string | null
  rating: number | null
  priority: SocialInboxPriority | null
  tags: string[] | null
  linked_task_id: string | null
  linked_client_request_id: string | null
}

interface MessageRow {
  direction: 'in' | 'out'
  author_name: string | null
  content: string | null
  occurred_at: string | null
  is_internal_note: boolean
}

interface CandidateTaskRow {
  id: string
  title: string
  status_name: string | null
  project_name: string | null
}

export async function loadSocialInboxAiContext(conversationId: string): Promise<SocialInboxTriageContext | null> {
  const conversation = await queryOne<ConversationRow>(
    `SELECT c.id, c.client_id, ac.name AS client_name, c.platform, c.channel_type,
            c.participant_name, c.rating, c.priority, c.tags,
            c.linked_task_id, c.linked_client_request_id
       FROM social_conversations c
       LEFT JOIN agency_clients ac ON ac.id = c.client_id
      WHERE c.id = $1`,
    [conversationId]
  )
  if (!conversation) return null

  const newestMessages = await queryRows<MessageRow>(
    `SELECT direction, author_name, content,
            COALESCE(platform_timestamp, created_at)::text AS occurred_at,
            is_internal_note
       FROM social_messages
      WHERE conversation_id = $1
      ORDER BY COALESCE(platform_timestamp, created_at) DESC NULLS LAST
      LIMIT 8`,
    [conversationId]
  )
  const candidateTasks = await queryRows<CandidateTaskRow>(
    `SELECT t.id, t.title, ts.name AS status_name, p.name AS project_name
       FROM tasks t
       JOIN projects p ON p.id = t.project_id AND p.client_id = $1
       LEFT JOIN task_statuses ts ON ts.id = t.status_id
      WHERE COALESCE(t.status_is_final, FALSE) = FALSE
      ORDER BY t.updated_at DESC NULLS LAST, t.created_at DESC
      LIMIT 8`,
    [conversation.client_id]
  )

  return {
    conversation: {
      id: conversation.id,
      clientId: conversation.client_id,
      clientName: conversation.client_name,
      platform: conversation.platform,
      channelType: conversation.channel_type,
      participantName: conversation.participant_name,
      rating: conversation.rating,
      priority: conversation.priority,
      tags: conversation.tags ?? [],
      linkedTaskId: conversation.linked_task_id,
      linkedClientRequestId: conversation.linked_client_request_id
    },
    messages: newestMessages.reverse().map(message => ({
      direction: message.direction,
      authorName: message.author_name,
      content: message.content,
      occurredAt: message.occurred_at,
      isInternal: message.is_internal_note
    })),
    candidateTasks: candidateTasks.map(task => ({
      id: task.id,
      title: task.title,
      statusName: task.status_name,
      projectName: task.project_name
    }))
  }
}
