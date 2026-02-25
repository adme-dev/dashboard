/**
 * GET /api/chat/channels
 * List channels the current user is a member of, with unread counts and last message.
 */
import { queryRows } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)

  const channels = await queryRows(`
    SELECT
      c.id, c.name, c.slug, c.description, c.type, c.is_private,
      c.department_id, c.task_id, c.avatar_url, c.archived_at,
      c.created_at, c.updated_at,
      cm.role, cm.muted_until, cm.last_read_message_id,
      -- Unread count
      COALESCE((
        SELECT COUNT(*) FROM chat_messages m
        WHERE m.channel_id = c.id
          AND m.id > cm.last_read_message_id
          AND m.deleted_at IS NULL
      ), 0)::int AS unread_count,
      -- Last message preview
      lm.id AS last_message_id,
      lm.content AS last_message_content,
      lm.user_id AS last_message_user_id,
      lm.created_at AS last_message_at,
      lm_user.name AS last_message_user_name
    FROM chat_channel_members cm
    JOIN chat_channels c ON c.id = cm.channel_id
    LEFT JOIN LATERAL (
      SELECT m.id, m.content, m.user_id, m.created_at
      FROM chat_messages m
      WHERE m.channel_id = c.id AND m.deleted_at IS NULL
      ORDER BY m.id DESC LIMIT 1
    ) lm ON true
    LEFT JOIN team_members lm_user ON lm_user.id = lm.user_id
    WHERE cm.user_id = $1 AND c.archived_at IS NULL
    ORDER BY COALESCE(lm.created_at, c.created_at) DESC
  `, [user.id])

  return channels.map((ch: any) => ({
    id: ch.id,
    name: ch.name,
    slug: ch.slug,
    description: ch.description,
    type: ch.type,
    is_private: ch.is_private,
    department_id: ch.department_id,
    task_id: ch.task_id,
    avatar_url: ch.avatar_url,
    archived_at: ch.archived_at,
    created_at: ch.created_at,
    updated_at: ch.updated_at,
    role: ch.role,
    muted_until: ch.muted_until,
    last_read_message_id: ch.last_read_message_id,
    unread_count: ch.unread_count,
    last_message: ch.last_message_id ? {
      id: ch.last_message_id,
      content: ch.last_message_content?.substring(0, 120),
      user_id: ch.last_message_user_id,
      user_name: ch.last_message_user_name,
      created_at: ch.last_message_at
    } : null
  }))
})
