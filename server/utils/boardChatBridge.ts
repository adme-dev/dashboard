/**
 * Board → Chat Bridge
 *
 * Posts board events as system messages to linked chat channels.
 * When a board has an active feed linked to a chat channel,
 * events (task created, status changed, etc.) appear as automated
 * messages in the channel.
 *
 * Fire-and-forget — errors logged but never thrown.
 */

import { queryRows, queryOne, execute } from '~~/server/utils/db'

interface BoardChatEvent {
  boardId: string
  type: string
  taskId?: string
  taskTitle?: string
  actorId: string
  actorName?: string
  changes?: Record<string, any>
}

/**
 * Post a board event to any linked chat channels.
 * Looks up active feed settings for the board and inserts system messages.
 */
export async function postBoardEventToChat(event: BoardChatEvent): Promise<void> {
  try {
    // Find active feed settings for this board
    const feeds = await queryRows(`
      SELECT fs.id, fs.channel_id, fs.event_types
      FROM chat_board_feed_settings fs
      WHERE fs.board_id = $1 AND fs.is_active = true
    `, [event.boardId])

    if (feeds.length === 0) return

    // Get actor name if not provided
    let actorName = event.actorName
    if (!actorName) {
      const actor = await queryOne(
        'SELECT name FROM team_members WHERE id = $1',
        [event.actorId]
      )
      actorName = actor?.name || 'Someone'
    }

    // Get task title if not provided
    let taskTitle = event.taskTitle
    if (!taskTitle && event.taskId) {
      const task = await queryOne(
        'SELECT title FROM tasks WHERE id = $1',
        [event.taskId]
      )
      taskTitle = task?.title || 'an item'
    }

    // Build message content
    const content = buildChatMessage(event.type, actorName, taskTitle, event.changes)
    if (!content) return

    // Post to each matching channel
    for (const feed of feeds) {
      const eventTypes: string[] = feed.event_types || []
      if (!eventTypes.includes(event.type)) continue

      // Insert as a system message (user_id = actor, but metadata flags it as system)
      await execute(`
        INSERT INTO chat_messages (channel_id, user_id, content, metadata, created_at)
        VALUES ($1, $2, $3, $4, NOW())
      `, [
        feed.channel_id,
        event.actorId,
        content,
        JSON.stringify({
          system: true,
          boardEvent: event.type,
          taskId: event.taskId || null,
          boardId: event.boardId,
        })
      ])
    }

    // Also post to task-specific channel if one exists
    if (event.taskId) {
      const taskChannel = await queryOne(`
        SELECT id FROM chat_channels
        WHERE task_id = $1 AND archived_at IS NULL
        LIMIT 1
      `, [event.taskId])

      if (taskChannel) {
        // Check it's not already covered by a board feed
        const alreadyCovered = feeds.some((f: any) => f.channel_id === taskChannel.id)
        if (!alreadyCovered) {
          await execute(`
            INSERT INTO chat_messages (channel_id, user_id, content, metadata, created_at)
            VALUES ($1, $2, $3, $4, NOW())
          `, [
            taskChannel.id,
            event.actorId,
            content,
            JSON.stringify({
              system: true,
              boardEvent: event.type,
              taskId: event.taskId,
              boardId: event.boardId,
            })
          ])
        }
      }
    }
  } catch (error) {
    console.error('[BoardChatBridge] Failed to post event to chat:', error)
  }
}

/**
 * Build a human-readable message from a board event.
 */
function buildChatMessage(
  type: string,
  actorName: string,
  taskTitle?: string,
  changes?: Record<string, any>
): string | null {
  const task = taskTitle ? `**${taskTitle}**` : 'an item'

  switch (type) {
    case 'task_created':
      return `${actorName} created ${task}`

    case 'task_updated':
      return `${actorName} updated ${task}`

    case 'task_deleted':
      return `${actorName} deleted ${task}`

    case 'status_changed': {
      const from = changes?.oldStatusName || 'unknown'
      const to = changes?.newStatusName || 'unknown'
      return `${actorName} moved ${task} from **${from}** to **${to}**`
    }

    case 'cell_updated': {
      const colName = changes?.columnName
      if (colName) {
        return `${actorName} updated **${colName}** on ${task}`
      }
      return `${actorName} updated a value on ${task}`
    }

    case 'group_updated':
      return `${actorName} updated a group`

    case 'column_updated':
      return `${actorName} updated a column`

    default:
      return null
  }
}
