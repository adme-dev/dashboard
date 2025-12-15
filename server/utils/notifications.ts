/**
 * Notification Utilities
 * Helper functions for creating in-app notifications
 */

import { queryOne, queryRows } from '~~/server/utils/db'
import { sendTaskAssignedEmail, sendMentionEmail, sendApprovalRequestEmail, sendDueReminderEmail } from '~~/server/utils/email'

export type NotificationType =
  | 'task_assigned'
  | 'task_mentioned'
  | 'task_comment'
  | 'task_status_changed'
  | 'task_due_soon'
  | 'task_overdue'
  | 'approval_requested'
  | 'approval_completed'
  | 'invitation_received'
  | 'team_update'
  | 'system'

interface CreateNotificationParams {
  userId: string
  type: NotificationType
  title: string
  message: string
  link?: string
  actorId?: string
  metadata?: Record<string, any>
  sendEmail?: boolean
}

interface NotifyTaskAssignedParams {
  taskId: string
  taskTitle: string
  assigneeId: string
  assignerId: string
  projectName?: string
  dueDate?: Date
}

interface NotifyMentionParams {
  taskId: string
  taskTitle: string
  mentionedUserId: string
  mentionerId: string
  commentSnippet: string
}

interface NotifyApprovalRequestParams {
  taskId: string
  taskTitle: string
  approverId: string
  requesterId: string
  stepName: string
}

interface NotifyDueReminderParams {
  taskId: string
  taskTitle: string
  assigneeId: string
  dueDate: Date
  isOverdue: boolean
}

/**
 * Create a notification for a user
 */
export async function createNotification(params: CreateNotificationParams) {
  try {
    const notification = await queryOne(`
      INSERT INTO notifications (user_id, type, title, message, link, actor_id, metadata)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, created_at
    `, [
      params.userId,
      params.type,
      params.title,
      params.message,
      params.link || null,
      params.actorId || null,
      params.metadata ? JSON.stringify(params.metadata) : null
    ])

    return notification
  } catch (error) {
    console.error('Failed to create notification:', error)
    throw error
  }
}

/**
 * Create notifications for multiple users
 */
export async function createBulkNotifications(
  userIds: string[],
  params: Omit<CreateNotificationParams, 'userId'>
) {
  const results = await Promise.allSettled(
    userIds.map(userId => createNotification({ ...params, userId }))
  )

  const successful = results.filter(r => r.status === 'fulfilled').length
  const failed = results.filter(r => r.status === 'rejected').length

  if (failed > 0) {
    console.warn(`Bulk notification: ${successful} succeeded, ${failed} failed`)
  }

  return { successful, failed }
}

/**
 * Notify user when assigned to a task
 */
export async function notifyTaskAssigned(params: NotifyTaskAssignedParams) {
  // Get assigner details
  const assigner = await queryOne(`
    SELECT name, email FROM team_members WHERE id = $1
  `, [params.assignerId])

  // Get assignee details
  const assignee = await queryOne(`
    SELECT name, email FROM team_members WHERE id = $1
  `, [params.assigneeId])

  if (!assigner || !assignee) return

  // Create in-app notification
  await createNotification({
    userId: params.assigneeId,
    type: 'task_assigned',
    title: 'New Task Assigned',
    message: `${assigner.name} assigned you to "${params.taskTitle}"`,
    link: `/agency/tasks/${params.taskId}`,
    actorId: params.assignerId,
    metadata: {
      taskId: params.taskId,
      taskTitle: params.taskTitle,
      projectName: params.projectName
    }
  })

  // Send email notification
  await sendTaskAssignedEmail({
    to: assignee.email,
    assigneeName: assignee.name,
    taskTitle: params.taskTitle,
    assignerName: assigner.name,
    projectName: params.projectName,
    dueDate: params.dueDate,
    taskUrl: `${process.env.APP_URL || 'http://localhost:3000'}/agency/tasks/${params.taskId}`
  })
}

/**
 * Notify user when mentioned in a task/comment
 */
export async function notifyMention(params: NotifyMentionParams) {
  // Get mentioner details
  const mentioner = await queryOne(`
    SELECT name, email FROM team_members WHERE id = $1
  `, [params.mentionerId])

  // Get mentioned user details
  const mentioned = await queryOne(`
    SELECT name, email FROM team_members WHERE id = $1
  `, [params.mentionedUserId])

  if (!mentioner || !mentioned) return

  // Create in-app notification
  await createNotification({
    userId: params.mentionedUserId,
    type: 'task_mentioned',
    title: 'You were mentioned',
    message: `${mentioner.name} mentioned you in "${params.taskTitle}"`,
    link: `/agency/tasks/${params.taskId}`,
    actorId: params.mentionerId,
    metadata: {
      taskId: params.taskId,
      taskTitle: params.taskTitle,
      commentSnippet: params.commentSnippet.substring(0, 100)
    }
  })

  // Send email notification
  await sendMentionEmail({
    to: mentioned.email,
    mentionedName: mentioned.name,
    mentionerName: mentioner.name,
    taskTitle: params.taskTitle,
    commentSnippet: params.commentSnippet,
    taskUrl: `${process.env.APP_URL || 'http://localhost:3000'}/agency/tasks/${params.taskId}`
  })
}

/**
 * Notify user when approval is requested
 */
export async function notifyApprovalRequest(params: NotifyApprovalRequestParams) {
  // Get requester details
  const requester = await queryOne(`
    SELECT name, email FROM team_members WHERE id = $1
  `, [params.requesterId])

  // Get approver details
  const approver = await queryOne(`
    SELECT name, email FROM team_members WHERE id = $1
  `, [params.approverId])

  if (!requester || !approver) return

  // Create in-app notification
  await createNotification({
    userId: params.approverId,
    type: 'approval_requested',
    title: 'Approval Requested',
    message: `${requester.name} requested your approval for "${params.taskTitle}"`,
    link: `/agency/tasks/${params.taskId}`,
    actorId: params.requesterId,
    metadata: {
      taskId: params.taskId,
      taskTitle: params.taskTitle,
      stepName: params.stepName
    }
  })

  // Send email notification
  await sendApprovalRequestEmail({
    to: approver.email,
    approverName: approver.name,
    requesterName: requester.name,
    taskTitle: params.taskTitle,
    stepName: params.stepName,
    taskUrl: `${process.env.APP_URL || 'http://localhost:3000'}/agency/tasks/${params.taskId}`
  })
}

/**
 * Notify user about upcoming or overdue task
 */
export async function notifyDueReminder(params: NotifyDueReminderParams) {
  // Get assignee details
  const assignee = await queryOne(`
    SELECT name, email FROM team_members WHERE id = $1
  `, [params.assigneeId])

  if (!assignee) return

  const type = params.isOverdue ? 'task_overdue' : 'task_due_soon'
  const title = params.isOverdue ? 'Task Overdue' : 'Task Due Soon'
  const message = params.isOverdue
    ? `"${params.taskTitle}" is overdue`
    : `"${params.taskTitle}" is due ${formatRelativeDate(params.dueDate)}`

  // Create in-app notification
  await createNotification({
    userId: params.assigneeId,
    type,
    title,
    message,
    link: `/agency/tasks/${params.taskId}`,
    metadata: {
      taskId: params.taskId,
      taskTitle: params.taskTitle,
      dueDate: params.dueDate.toISOString(),
      isOverdue: params.isOverdue
    }
  })

  // Send email notification
  await sendDueReminderEmail({
    to: assignee.email,
    assigneeName: assignee.name,
    taskTitle: params.taskTitle,
    dueDate: params.dueDate,
    isOverdue: params.isOverdue,
    taskUrl: `${process.env.APP_URL || 'http://localhost:3000'}/agency/tasks/${params.taskId}`
  })
}

/**
 * Notify about task status change
 */
export async function notifyTaskStatusChanged(
  taskId: string,
  taskTitle: string,
  oldStatus: string,
  newStatus: string,
  changedById: string,
  watcherIds: string[]
) {
  const changer = await queryOne(`
    SELECT name FROM team_members WHERE id = $1
  `, [changedById])

  if (!changer) return

  await createBulkNotifications(watcherIds, {
    type: 'task_status_changed',
    title: 'Task Status Updated',
    message: `${changer.name} moved "${taskTitle}" from ${oldStatus} to ${newStatus}`,
    link: `/agency/tasks/${taskId}`,
    actorId: changedById,
    metadata: {
      taskId,
      taskTitle,
      oldStatus,
      newStatus
    }
  })
}

/**
 * Helper to format relative date
 */
function formatRelativeDate(date: Date): string {
  const now = new Date()
  const diffMs = date.getTime() - now.getTime()
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 0) return 'today'
  if (diffDays === 1) return 'tomorrow'
  if (diffDays > 1 && diffDays <= 7) return `in ${diffDays} days`
  return date.toLocaleDateString()
}
