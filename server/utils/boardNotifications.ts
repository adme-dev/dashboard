/**
 * Board Notifications — bridges board events to notification creation for subscribers.
 *
 * When a board event fires (task updated, status changed, cell edited, etc.),
 * this module looks up relevant subscribers and creates in-app notifications
 * and/or sends email notifications based on their preferences.
 */

import { queryOne, queryRows } from '~~/server/utils/db'
import { createNotification } from '~~/server/utils/notifications'
import { getSubscribers } from '~~/server/utils/subscriptions'
import { sendBoardMemberAddedEmail } from '~~/server/utils/email'
import { findKeywordMatches } from '~~/server/utils/keywordSubscriptions'

const baseUrl = process.env.APP_URL || 'http://localhost:3000'

interface BoardEventNotification {
  boardId: string
  type: string           // 'task_updated', 'status_changed', 'cell_updated', etc.
  taskId?: string
  columnId?: string
  actorId: string        // who triggered the change
  changes?: Record<string, any>
}

/**
 * Notify board subscribers about a board event.
 * Fire-and-forget — errors are logged but never thrown to caller.
 */
export async function notifyBoardSubscribers(event: BoardEventNotification): Promise<void> {
  try {
    // Get subscribers matching this event
    const subscribers = await getSubscribers({
      boardId: event.boardId,
      itemId: event.taskId,
      columnId: event.columnId,
      eventType: event.type,
    })

    // Filter out the actor (don't notify yourself).
    // Also skip the new assignee on assignment changes — they get a more
    // specific `task_assigned` via notifyTaskAssigneeChanged, so a generic
    // "X updated item" board notification on the same event is duplicate noise.
    const newAssigneeId = typeof event.changes?.assignee === 'string'
      ? event.changes.assignee
      : null
    const toNotify = subscribers.filter(
      s => s.userId !== event.actorId && s.userId !== newAssigneeId
    )

    if (toNotify.length === 0) return

    // Get actor info for the notification message
    const actor = await queryOne(
      'SELECT name, email FROM team_members WHERE id = $1',
      [event.actorId]
    )
    const actorName = actor?.name || 'Someone'

    // Get board info
    const board = await queryOne(
      'SELECT name FROM departments WHERE id = $1',
      [event.boardId]
    )
    const boardName = board?.name || 'board'

    // Get task info if applicable
    let taskTitle = ''
    if (event.taskId) {
      const task = await queryOne(
        'SELECT title FROM tasks WHERE id = $1',
        [event.taskId]
      )
      taskTitle = task?.title || ''
    }

    // Build notification content based on event type
    const { title, message } = buildNotificationContent(
      event.type,
      actorName,
      boardName,
      taskTitle,
      event.changes
    )

    const link = event.taskId
      ? `/agency/boards/${event.boardId}?task=${event.taskId}`
      : `/agency/boards/${event.boardId}`

    // Create notifications for each subscriber
    const inappSubscribers = toNotify.filter(s => s.notifyInapp)
    const emailSubscribers = toNotify.filter(s => s.notifyEmail)

    // In-app notifications
    await Promise.allSettled(
      inappSubscribers.map(sub =>
        createNotification({
          userId: sub.userId,
          type: mapEventToNotificationType(event.type),
          title,
          message,
          link,
          actorId: event.actorId,
          reason: sub.itemId ? 'watching_item' : 'watching_board',
          metadata: {
            boardId: event.boardId,
            boardName,
            taskId: event.taskId,
            taskTitle,
            columnId: event.columnId,
            eventType: event.type,
            changes: event.changes,
          },
        })
      )
    )

    // Keyword subscription fan-out — Phase E
    // Notify users whose keyword matches the title/message (excluding actor +
    // anyone already notified via subscription).
    try {
      const alreadyNotified = new Set([event.actorId, ...inappSubscribers.map(s => s.userId)])
      const keywordMatches = await findKeywordMatches({
        title,
        message,
        excludeUserIds: Array.from(alreadyNotified),
      })
      if (keywordMatches.length > 0) {
        await Promise.allSettled(
          keywordMatches.map(km =>
            createNotification({
              userId: km.userId,
              type: mapEventToNotificationType(event.type),
              title: km.mode === 'semantic'
                ? `Related to "${km.keyword}"`
                : `Keyword match: "${km.keyword}"`,
              message,
              link,
              actorId: event.actorId,
              reason: 'direct',
              metadata: {
                boardId: event.boardId,
                boardName,
                taskId: event.taskId,
                taskTitle,
                eventType: event.type,
                matchedKeyword: km.keyword,
                matchMode: km.mode,
              },
            })
          )
        )
      }
    } catch (err) {
      console.error('[BoardNotifications] Keyword fan-out failed:', err)
    }

    // Email notifications (use sendBoardChangeEmail)
    if (emailSubscribers.length > 0) {
      const { sendBoardChangeEmail } = await import('~~/server/utils/email')

      // Get user emails
      const userIds = emailSubscribers.map(s => s.userId)
      const users = await queryRows(
        `SELECT id, name, email, notification_preferences FROM team_members WHERE id = ANY($1)`,
        [userIds]
      )

      await Promise.allSettled(
        users.map(user => {
          // Check user-level email preferences
          const prefs = user.notification_preferences || {}
          const prefKey = getEmailPrefKey(event.type)
          if (prefKey && prefs[prefKey] === false) return Promise.resolve()

          return sendBoardChangeEmail({
            to: user.email,
            name: user.name,
            boardName,
            actorName,
            action: getActionDescription(event.type, event.changes),
            itemTitle: taskTitle,
            boardUrl: `${process.env.APP_URL || 'http://localhost:3000'}/agency/boards/${event.boardId}`,
            itemUrl: event.taskId
              ? `${process.env.APP_URL || 'http://localhost:3000'}/agency/boards/${event.boardId}?task=${event.taskId}`
              : undefined,
          })
        })
      )
    }
  } catch (error) {
    console.error('[BoardNotifications] Failed to notify subscribers:', error)
  }
}

/**
 * Build human-readable notification title and message from an event.
 */
function buildNotificationContent(
  type: string,
  actorName: string,
  boardName: string,
  taskTitle: string,
  changes?: Record<string, any>
): { title: string; message: string } {
  switch (type) {
    case 'task_updated':
      return {
        title: 'Item Updated',
        message: `${actorName} updated "${taskTitle}" on ${boardName}`,
      }

    case 'task_created':
      return {
        title: 'New Item',
        message: `${actorName} created "${taskTitle}" on ${boardName}`,
      }

    case 'task_deleted':
      return {
        title: 'Item Deleted',
        message: `${actorName} deleted "${taskTitle}" from ${boardName}`,
      }

    case 'status_changed': {
      const from = changes?.oldStatusName || 'unknown'
      const to = changes?.newStatusName || 'unknown'
      return {
        title: 'Status Changed',
        message: `${actorName} moved "${taskTitle}" from ${from} to ${to}`,
      }
    }

    case 'cell_updated':
      return {
        title: 'Column Value Updated',
        message: `${actorName} updated a value on "${taskTitle}" in ${boardName}`,
      }

    case 'group_updated':
      return {
        title: 'Group Updated',
        message: `${actorName} updated a group on ${boardName}`,
      }

    case 'column_updated':
      return {
        title: 'Column Updated',
        message: `${actorName} updated a column on ${boardName}`,
      }

    default:
      return {
        title: 'Board Activity',
        message: `${actorName} made changes on ${boardName}`,
      }
  }
}

/**
 * Map board event type to notification type.
 */
function mapEventToNotificationType(eventType: string): string {
  const map: Record<string, string> = {
    task_updated: 'task_status_changed',
    task_created: 'system',
    task_deleted: 'system',
    status_changed: 'task_status_changed',
    cell_updated: 'task_status_changed',
    group_updated: 'system',
    column_updated: 'system',
  }
  return map[eventType] || 'system'
}

/**
 * Get email preference key for an event type.
 */
function getEmailPrefKey(eventType: string): string | null {
  const map: Record<string, string> = {
    task_updated: 'email_board_changes',
    task_created: 'email_board_changes',
    task_deleted: 'email_board_changes',
    status_changed: 'email_board_changes',
    cell_updated: 'email_board_changes',
    group_updated: 'email_board_changes',
    column_updated: 'email_board_changes',
  }
  return map[eventType] || null
}

/**
 * Get a short action description for email.
 */
function getActionDescription(type: string, changes?: Record<string, any>): string {
  switch (type) {
    case 'task_updated':
      return 'updated an item'
    case 'task_created':
      return 'created a new item'
    case 'task_deleted':
      return 'deleted an item'
    case 'status_changed': {
      const to = changes?.newStatusName
      return to ? `changed status to "${to}"` : 'changed the status'
    }
    case 'cell_updated':
      return 'updated a column value'
    default:
      return 'made changes'
  }
}

/**
 * Notify a user when they're added as a member of a board (department).
 * Skips self-add. Returns notified=false with reason for visibility/testing.
 */
export interface NotifyBoardMemberAddedParams {
  memberId: string
  boardId: string
  boardName: string
  actorId: string
}

export type NotifyBoardMemberAddedResult =
  | { notified: true }
  | { notified: false; reason: 'self_add' | 'member_not_found' }

export async function notifyBoardMemberAdded(
  params: NotifyBoardMemberAddedParams
): Promise<NotifyBoardMemberAddedResult> {
  if (params.memberId === params.actorId) {
    return { notified: false, reason: 'self_add' }
  }

  const actor = await queryOne(`SELECT name FROM team_members WHERE id = $1`, [params.actorId])
  const member = await queryOne(
    `SELECT name, email, notification_preferences FROM team_members WHERE id = $1`,
    [params.memberId]
  )

  if (!member) {
    return { notified: false, reason: 'member_not_found' }
  }

  const adderName = actor?.name || 'Someone'

  await createNotification({
    userId: params.memberId,
    type: 'board_member_added',
    title: `Added to ${params.boardName}`,
    message: `${adderName} added you to the "${params.boardName}" board`,
    link: `/agency/boards/${params.boardId}`,
    actorId: params.actorId,
    metadata: { boardId: params.boardId, boardName: params.boardName },
  })

  const prefs = member.notification_preferences || {}
  if (prefs.email_board_member_added !== false) {
    await sendBoardMemberAddedEmail({
      to: member.email,
      name: member.name,
      boardName: params.boardName,
      adderName,
      boardUrl: `${baseUrl}/agency/boards/${params.boardId}`,
    })
  }

  return { notified: true }
}
