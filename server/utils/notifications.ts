/**
 * Notification Utilities
 * Helper functions for creating in-app notifications
 */

import { queryOne, queryRows } from '~~/server/utils/db'
import { getAppUrl } from '~~/server/utils/appUrl'
import { sendTaskAssignedEmail, sendMentionEmail, sendApprovalRequestEmail, sendDueReminderEmail } from '~~/server/utils/email'
import { autoSubscribeIfEnabled } from '~~/server/utils/subscriptions'
import { isWithinQuietHours } from '~~/server/utils/quietHours'
import { computeImportance } from '~~/server/utils/notificationImportance'

export type NotificationType =
  | 'task_assigned'
  | 'task_mentioned'
  | 'task_comment'
  | 'task_status_changed'
  | 'task_due_soon'
  | 'task_overdue'
  | 'approval_requested'
  | 'approval_completed'
  | 'approval_response'
  | 'team_update'
  | 'system'
  | 'ai_digest'
  | 'chat_mention'
  | 'chat_dm'
  | 'brief_status_changed'
  | 'brief_commented'
  | 'brief_assigned'
  | 'brief_submitted'
  | 'board_member_added'
  | 'anomaly_critical'
  | 'lead'
  | 'social_assigned'
  | 'social_sla_breach'
  | 'brief_actioned'

export type NotificationReason =
  | 'mentioned'
  | 'assigned'
  | 'watching_board'
  | 'watching_item'
  | 'direct'
  | 'lead_arrived'

interface CreateNotificationParams {
  userId: string
  type: NotificationType
  title: string
  message: string
  link?: string
  actorId?: string
  metadata?: Record<string, any>
  sendEmail?: boolean
  reason?: NotificationReason
}

export interface NotifyTaskAssignedParams {
  taskId: string
  taskTitle: string
  assigneeId: string
  assignerId: string
  projectName?: string
  dueDate?: Date
  userId?: string // Legacy compat
}

export interface NotifyMentionParams {
  taskId: string
  taskTitle: string
  mentionedUserId: string
  mentionerId: string
  commentSnippet: string
  userId?: string // Legacy compat
}

export interface NotifyApprovalRequestParams {
  taskId: string
  taskTitle: string
  approverId: string
  requesterId: string
  stepName: string
  userId?: string // Legacy compat
}

interface NotifyDueReminderParams {
  taskId: string
  taskTitle: string
  assigneeId: string
  dueDate: Date
  isOverdue: boolean
}

/**
 * Map notification type → user-controllable in-app preference key.
 * Types not in this map always create (system, chat, brief, invitation, digest, etc.)
 * because they're either critical or have their own opt-in/out elsewhere.
 */
const TYPE_TO_INAPP_PREF: Partial<Record<NotificationType, string>> = {
  task_assigned: 'inapp_task_assigned',
  task_mentioned: 'inapp_task_mentioned',
  task_comment: 'inapp_task_comment',
  task_status_changed: 'inapp_task_status',
  task_due_soon: 'inapp_task_due',
  task_overdue: 'inapp_task_due',
  approval_requested: 'inapp_approval',
  approval_completed: 'inapp_approval',
  approval_response: 'inapp_approval',
  board_member_added: 'inapp_board_member_added',
  brief_assigned: 'inapp_brief_assigned',
  brief_status_changed: 'inapp_brief_status',
  brief_commented: 'inapp_brief_comment',
  chat_mention: 'inapp_chat_mention',
  chat_dm: 'inapp_chat_dm',
  anomaly_critical: 'inapp_anomaly_critical',
}

/**
 * Create a notification for a user.
 *
 * Two gates, evaluated independently:
 *   - In-app: honours `inapp_*` keys in team_members.notification_preferences.
 *     If the recipient has explicitly disabled this type, no row is inserted
 *     (no inbox / bell / Activity Hub entry).
 *   - Web Push: fans out to every device the user has subscribed, regardless
 *     of in-app prefs. The user controls push via the per-device toggle in
 *     /settings/notifications, which adds/removes their push_subscriptions
 *     row. No subscription = no push. No VAPID env = no push.
 *
 * Why decoupled: a user may want a quiet inbox but still get push (or vice
 * versa). Coupling them — the previous behaviour — meant turning off any
 * inapp toggle silently turned off push for the same type, with no UI hint.
 */
export async function createNotification(params: CreateNotificationParams) {
  try {
    // 1. Web Push fan-out — independent of in-app prefs.
    //    Awaited inline so it joins the parent's await/waitUntil chain on
    //    Cloudflare Workers; un-awaited IIFEs get cancelled when the response
    //    returns. No-ops silently when VAPID env vars are unset or the user
    //    has no subs. Suppressed during quiet hours (Phase C) for low-signal
    //    reasons; mentions/assignments always push.
    try {
      const muted = await isWithinQuietHours(params.userId, params.reason)
      if (!muted) {
        const { sendWebPushToUser } = await import('~~/server/utils/webPush')
        await sendWebPushToUser(params.userId, {
          title: params.title,
          body: params.message,
          url: params.link || undefined,
          tag: params.type,
        })
      }
    } catch (err) {
      console.error('[Notifications] Web Push fan-out failed:', err)
    }

    // 2. In-app gate.
    const prefKey = TYPE_TO_INAPP_PREF[params.type]
    if (prefKey) {
      const row = await queryOne(
        `SELECT notification_preferences FROM team_members WHERE id = $1`,
        [params.userId]
      )
      const prefs = row?.notification_preferences || {}
      if (prefs[prefKey] === false) return null
    }

    const importanceScore = computeImportance({
      type: params.type,
      reason: params.reason,
      metadata: params.metadata,
    })

    let notification
    try {
      notification = await queryOne(`
        INSERT INTO notifications (user_id, type, title, message, link, actor_id, metadata, reason, importance_score)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING id, created_at
      `, [
        params.userId,
        params.type,
        params.title,
        params.message,
        params.link || null,
        params.actorId || null,
        params.metadata ? JSON.stringify(params.metadata) : null,
        params.reason || null,
        importanceScore
      ])
    } catch (err: any) {
      // Defensive fallback for partially-deployed schemas (e.g. when a deploy
      // ships before its migration). Retry with the legacy column set when
      // reason/importance_score don't exist on the target DB.
      const msg = String(err?.message || '')
      if (msg.includes('column "reason"') || msg.includes('column "importance_score"') || msg.includes('does not exist')) {
        console.warn('[Notifications] Falling back to legacy INSERT (Phase A reason/score columns missing on this DB):', msg)
        notification = await queryOne(`
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
          params.metadata ? JSON.stringify(params.metadata) : null,
        ])
      } else {
        throw err
      }
    }

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
    SELECT name, email, notification_preferences FROM team_members WHERE id = $1
  `, [params.assigneeId])

  if (!assigner || !assignee) return

  // Create in-app notification — wrapped so a failure here (schema skew,
  // legacy DB, etc.) doesn't block the email send below.
  try {
    await createNotification({
      userId: params.assigneeId,
      type: 'task_assigned',
      title: 'New Task Assigned',
      message: `${assigner.name} assigned you to "${params.taskTitle}"`,
      link: `/agency/tasks/${params.taskId}`,
      actorId: params.assignerId,
      reason: 'assigned',
      metadata: {
        taskId: params.taskId,
        taskTitle: params.taskTitle,
        projectName: params.projectName
      }
    })
  } catch (err) {
    console.error('[notifyTaskAssigned] createNotification failed (continuing with email):', err)
  }

  // Auto-subscribe the assignee at item level so they get follow-up activity.
  try {
    const taskRow = await queryOne(`SELECT department_id FROM tasks WHERE id = $1`, [params.taskId])
    if (taskRow?.department_id) {
      await autoSubscribeIfEnabled(params.assigneeId, taskRow.department_id, params.taskId)
    }
  } catch (err) {
    console.error('Auto-subscribe assignee failed:', err)
  }

  // Auto-acknowledge: if the assignee opted in, post a comment on their
  // behalf so the assigner knows they've been alerted. Phase E2 upgrades
  // this from a static "Got it" to a Groq-drafted contextual reply that
  // mentions the task title and the assigner's name. Falls back to the
  // static template on Groq failure.
  try {
    const ackPref = await queryOne(
      `SELECT auto_ack_assignments FROM team_members WHERE id = $1`,
      [params.assigneeId]
    )
    if (ackPref?.auto_ack_assignments === true) {
      let draft = `👋 Got it — thanks ${assigner.name}, I'll take a look.`
      try {
        const { generateGroqInsight, GROQ_MODELS } = await import('~~/server/utils/groqClient')
        const prompt = `Write a SHORT (max 18 words), professional acknowledgement message that "${assignee.name}" might send when assigned to "${params.taskTitle}" by ${assigner.name}. Be warm but business-like. No emoji except a single 👋 at the start. No preamble, just the message text.`
        const aiDraft = await generateGroqInsight(prompt, {
          model: GROQ_MODELS.LLAMA_8B,
          maxTokens: 60,
          temperature: 0.4,
          systemPrompt: 'You write short, professional acknowledgement comments. One sentence only. No quotes, no preamble.',
        })
        const cleaned = aiDraft.trim().replace(/^["']|["']$/g, '')
        if (cleaned && cleaned.length <= 200) draft = cleaned
      } catch {
        // Stay with static template
      }
      await queryOne(
        `INSERT INTO task_activities (task_id, user_id, activity_type, content)
         VALUES ($1, $2, 'comment', $3)
         RETURNING id`,
        [params.taskId, params.assigneeId, draft]
      )
    }
  } catch (err) {
    console.error('Auto-ack failed:', err)
  }

  // Send email notification (check preference)
  const prefs = assignee.notification_preferences || {}
  if (prefs.email_task_assigned !== false) {
    await sendTaskAssignedEmail({
      to: assignee.email,
      name: assignee.name,
      taskTitle: params.taskTitle,
      assignerName: assigner.name,
      projectName: params.projectName,
      dueDate: params.dueDate,
      taskUrl: `${getAppUrl()}/agency/tasks/${params.taskId}`
    })
  }
}

/**
 * Notify on assignee change. Wraps notifyTaskAssigned with the guards every
 * caller needs: skip on no-change, skip on unassign, skip on self-assignment.
 */
export interface NotifyTaskAssigneeChangedParams {
  taskId: string
  taskTitle: string
  oldAssigneeId: string | null
  newAssigneeId: string | null
  actorId: string
  dueDate?: Date
  projectName?: string
}

export type NotifyTaskAssigneeChangedResult =
  | { notified: true }
  | { notified: false; reason: 'unchanged' | 'unassigned' | 'self_assignment' }

export async function notifyTaskAssigneeChanged(
  params: NotifyTaskAssigneeChangedParams
): Promise<NotifyTaskAssigneeChangedResult> {
  if (params.oldAssigneeId === params.newAssigneeId) {
    return { notified: false, reason: 'unchanged' }
  }
  if (!params.newAssigneeId) {
    return { notified: false, reason: 'unassigned' }
  }
  if (params.newAssigneeId === params.actorId) {
    return { notified: false, reason: 'self_assignment' }
  }

  await notifyTaskAssigned({
    assigneeId: params.newAssigneeId,
    taskId: params.taskId,
    taskTitle: params.taskTitle,
    assignerId: params.actorId,
    dueDate: params.dueDate,
    projectName: params.projectName,
  })
  return { notified: true }
}

/**
 * Notify task stakeholders when a comment is added
 */
export async function notifyTaskComment(params: {
  taskId: string
  taskTitle: string
  commenterId: string
  assigneeId?: string | null
  reporterId?: string | null
  commentSnippet: string
}) {
  // Get commenter details
  const commenter = await queryOne(`
    SELECT name FROM team_members WHERE id = $1
  `, [params.commenterId])

  if (!commenter) return

  // Collect unique stakeholders to notify (exclude commenter)
  const toNotify = new Set<string>()
  if (params.assigneeId && params.assigneeId !== params.commenterId) {
    toNotify.add(params.assigneeId)
  }
  if (params.reporterId && params.reporterId !== params.commenterId) {
    toNotify.add(params.reporterId)
  }

  if (toNotify.size === 0) return

  // Create notifications for each stakeholder
  await createBulkNotifications(Array.from(toNotify), {
    type: 'task_comment',
    title: 'New Comment',
    message: `${commenter.name} commented on "${params.taskTitle}"`,
    link: `/agency/tasks/${params.taskId}`,
    actorId: params.commenterId,
    metadata: {
      taskId: params.taskId,
      taskTitle: params.taskTitle,
      commentSnippet: params.commentSnippet.substring(0, 100)
    }
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
    SELECT name, email, notification_preferences FROM team_members WHERE id = $1
  `, [params.mentionedUserId])

  if (!mentioner || !mentioned) return

  // Create in-app notification — wrapped so a failure here doesn't block
  // the mention email or auto-subscribe.
  try {
    await createNotification({
      userId: params.mentionedUserId,
      type: 'task_mentioned',
      title: 'You were mentioned',
      message: `${mentioner.name} mentioned you in "${params.taskTitle}"`,
      link: `/agency/tasks/${params.taskId}`,
      actorId: params.mentionerId,
      reason: 'mentioned',
      metadata: {
        taskId: params.taskId,
        taskTitle: params.taskTitle,
        commentSnippet: params.commentSnippet.substring(0, 100)
      }
    })
  } catch (err) {
    console.error('[notifyMention] createNotification failed (continuing with email):', err)
  }

  // Auto-subscribe the mentioned user at item level.
  try {
    const taskRow = await queryOne(`SELECT department_id FROM tasks WHERE id = $1`, [params.taskId])
    if (taskRow?.department_id) {
      await autoSubscribeIfEnabled(params.mentionedUserId, taskRow.department_id, params.taskId)
    }
  } catch (err) {
    console.error('Auto-subscribe mentioned user failed:', err)
  }

  // Send email notification (check preference)
  const prefs = mentioned.notification_preferences || {}
  if (prefs.email_task_mentioned !== false) {
    await sendMentionEmail({
      to: mentioned.email,
      name: mentioned.name,
      taskTitle: params.taskTitle,
      mentionerName: mentioner.name,
      commentSnippet: params.commentSnippet,
      taskUrl: `${getAppUrl()}/agency/tasks/${params.taskId}`
    })
  }
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
    SELECT name, email, notification_preferences FROM team_members WHERE id = $1
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

  // Send email notification (check preference)
  const prefs = approver.notification_preferences || {}
  if (prefs.email_approval_request !== false) {
    await sendApprovalRequestEmail({
      to: approver.email,
      name: approver.name,
      taskTitle: params.taskTitle,
      requesterName: requester.name,
      stepName: params.stepName,
      taskUrl: `${getAppUrl()}/agency/tasks/${params.taskId}`
    })
  }
}

/**
 * Notify user about upcoming or overdue task
 */
export async function notifyDueReminder(params: NotifyDueReminderParams) {
  // Get assignee details
  const assignee = await queryOne(`
    SELECT name, email, notification_preferences FROM team_members WHERE id = $1
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

  // Send email notification (check preference)
  const prefs = assignee.notification_preferences || {}
  if (prefs.email_task_due !== false) {
    await sendDueReminderEmail({
      to: assignee.email,
      name: assignee.name,
      taskTitle: params.taskTitle,
      dueDate: params.dueDate,
      daysRemaining: Math.ceil((params.dueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
      taskUrl: `${getAppUrl()}/agency/tasks/${params.taskId}`
    })
  }
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
 * Notify task owner when approval is completed
 */
export async function notifyApprovalCompleted(params: {
  taskId: string
  taskTitle: string
  requesterId: string
  responderId: string
  stepName: string
  status: 'approved' | 'rejected'
}) {
  // Get responder details
  const responder = await queryOne(`
    SELECT name FROM team_members WHERE id = $1
  `, [params.responderId])

  if (!responder) return

  // Create in-app notification for the requester
  const title = params.status === 'approved' ? 'Approval Granted' : 'Approval Rejected'
  const message = params.status === 'approved'
    ? `${responder.name} approved "${params.taskTitle}" at ${params.stepName}`
    : `${responder.name} rejected "${params.taskTitle}" at ${params.stepName}`

  await createNotification({
    userId: params.requesterId,
    type: 'approval_completed',
    title,
    message,
    link: `/agency/tasks/${params.taskId}`,
    actorId: params.responderId,
    metadata: {
      taskId: params.taskId,
      taskTitle: params.taskTitle,
      stepName: params.stepName,
      status: params.status
    }
  })
}

/**
 * Notify next approver when it's their turn
 */
export async function notifyNextApprover(params: {
  taskId: string
  taskTitle: string
  approverId: string
  stepName: string
}) {
  // Get approver details
  const approver = await queryOne(`
    SELECT name, email, notification_preferences FROM team_members WHERE id = $1
  `, [params.approverId])

  if (!approver) return

  // Create in-app notification
  await createNotification({
    userId: params.approverId,
    type: 'approval_requested',
    title: 'Your Approval Needed',
    message: `"${params.taskTitle}" is waiting for your approval at "${params.stepName}"`,
    link: `/agency/tasks/${params.taskId}`,
    metadata: {
      taskId: params.taskId,
      taskTitle: params.taskTitle,
      stepName: params.stepName
    }
  })

  // Send email notification (check preference)
  const prefs = approver.notification_preferences || {}
  if (prefs.email_approval_request !== false) {
    await sendApprovalRequestEmail({
      to: approver.email,
      name: approver.name,
      taskTitle: params.taskTitle,
      requesterName: 'System',
      stepName: params.stepName,
      taskUrl: `${getAppUrl()}/agency/tasks/${params.taskId}`
    })
  }
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
