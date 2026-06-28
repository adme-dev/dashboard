/**
 * Brief Notification Utilities
 * Handles in-app notifications and email for brief events
 */

import { queryRows, queryOne } from '~~/server/utils/db'
import { createNotification, createBulkNotifications } from '~~/server/utils/notifications'
import { getAppUrl } from '~~/server/utils/appUrl'
import { sendBriefStatusEmail, sendBriefCommentEmail, sendBriefAssignedEmail } from '~~/server/utils/email'

const formatStatus = (s: string) =>
  s.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')

/**
 * Notify watchers when a brief's status changes
 */
export async function notifyBriefStatusChanged(params: {
  briefId: string
  briefTitle: string
  referenceNumber: string
  oldStatus: string
  newStatus: string
  actorId: string
}) {
  try {
    // Get watchers with notify_on_status_change flag (exclude actor)
    const watchers = await queryRows(`
      SELECT bw.user_id, tm.name, tm.email, tm.notification_preferences
      FROM brief_watchers bw
      JOIN team_members tm ON bw.user_id = tm.id
      WHERE bw.brief_id = $1
        AND bw.user_id != $2
        AND (bw.notify_on_status_change IS NULL OR bw.notify_on_status_change = true)
    `, [params.briefId, params.actorId])

    if (watchers.length === 0) return

    // Get actor name
    const actor = await queryOne('SELECT name FROM team_members WHERE id = $1', [params.actorId])
    const actorName = actor?.name || 'Someone'

    // Create in-app notifications
    await createBulkNotifications(
      watchers.map(w => w.user_id),
      {
        type: 'brief_status_changed',
        title: 'Brief Status Updated',
        message: `${actorName} changed "${params.briefTitle}" from ${formatStatus(params.oldStatus)} to ${formatStatus(params.newStatus)}`,
        link: `/agency/briefs/${params.briefId}`,
        actorId: params.actorId,
        metadata: {
          briefId: params.briefId,
          referenceNumber: params.referenceNumber,
          oldStatus: params.oldStatus,
          newStatus: params.newStatus
        }
      }
    )

    // Send emails to watchers who have email enabled
    for (const watcher of watchers) {
      const prefs = watcher.notification_preferences || {}
      if (prefs.email_brief_status !== false) {
        await sendBriefStatusEmail({
          to: watcher.email,
          name: watcher.name,
          briefTitle: params.briefTitle,
          referenceNumber: params.referenceNumber,
          actorName,
          oldStatus: params.oldStatus,
          newStatus: params.newStatus,
          briefUrl: `${getAppUrl()}/agency/briefs/${params.briefId}`
        })
      }
    }
  } catch (error) {
    console.error('[BriefNotifications] Failed to notify status change:', error)
  }
}

/**
 * Notify watchers when a comment is added to a brief
 */
export async function notifyBriefCommented(params: {
  briefId: string
  briefTitle: string
  referenceNumber: string
  commenterId: string
  commentSnippet: string
  isInternal?: boolean
}) {
  try {
    // Get watchers with notify_on_comment flag (exclude commenter)
    const watchers = await queryRows(`
      SELECT bw.user_id, tm.name, tm.email, tm.notification_preferences
      FROM brief_watchers bw
      JOIN team_members tm ON bw.user_id = tm.id
      WHERE bw.brief_id = $1
        AND bw.user_id != $2
        AND (bw.notify_on_comment IS NULL OR bw.notify_on_comment = true)
    `, [params.briefId, params.commenterId])

    if (watchers.length === 0) return

    // Get commenter name
    const commenter = await queryOne('SELECT name FROM team_members WHERE id = $1', [params.commenterId])
    const commenterName = commenter?.name || 'Someone'

    const prefix = params.isInternal ? '[Internal] ' : ''

    // Create in-app notifications
    await createBulkNotifications(
      watchers.map(w => w.user_id),
      {
        type: 'brief_commented',
        title: `${prefix}New Comment on Brief`,
        message: `${commenterName} commented on "${params.briefTitle}"`,
        link: `/agency/briefs/${params.briefId}`,
        actorId: params.commenterId,
        metadata: {
          briefId: params.briefId,
          referenceNumber: params.referenceNumber,
          commentSnippet: params.commentSnippet.substring(0, 100),
          isInternal: params.isInternal || false
        }
      }
    )

    // Send emails
    for (const watcher of watchers) {
      const prefs = watcher.notification_preferences || {}
      if (prefs.email_brief_comment !== false) {
        await sendBriefCommentEmail({
          to: watcher.email,
          name: watcher.name,
          briefTitle: params.briefTitle,
          referenceNumber: params.referenceNumber,
          commenterName,
          commentSnippet: params.commentSnippet.substring(0, 200),
          isInternal: params.isInternal || false,
          briefUrl: `${getAppUrl()}/agency/briefs/${params.briefId}`
        })
      }
    }
  } catch (error) {
    console.error('[BriefNotifications] Failed to notify comment:', error)
  }
}

/**
 * Notify a user when they are assigned to a brief
 */
export async function notifyBriefAssigned(params: {
  briefId: string
  briefTitle: string
  referenceNumber: string
  assigneeId: string
  assignerId: string
}) {
  try {
    // Get assigner and assignee details
    const assigner = await queryOne('SELECT name FROM team_members WHERE id = $1', [params.assignerId])
    const assignee = await queryOne('SELECT name, email, notification_preferences FROM team_members WHERE id = $1', [params.assigneeId])

    if (!assignee) return

    const assignerName = assigner?.name || 'Someone'

    // Create in-app notification
    await createNotification({
      userId: params.assigneeId,
      type: 'brief_assigned',
      title: 'Brief Assigned to You',
      message: `${assignerName} assigned you to brief "${params.briefTitle}"`,
      link: `/agency/briefs/${params.briefId}`,
      actorId: params.assignerId,
      metadata: {
        briefId: params.briefId,
        referenceNumber: params.referenceNumber
      }
    })

    // Send email
    const prefs = assignee.notification_preferences || {}
    if (prefs.email_brief_assigned !== false) {
      await sendBriefAssignedEmail({
        to: assignee.email,
        name: assignee.name,
        briefTitle: params.briefTitle,
        referenceNumber: params.referenceNumber,
        assignerName,
        briefUrl: `${getAppUrl()}/agency/briefs/${params.briefId}`
      })
    }
  } catch (error) {
    console.error('[BriefNotifications] Failed to notify assignment:', error)
  }
}

/**
 * Notify on brief assignee change. Wraps notifyBriefAssigned with the
 * skip-unchanged / skip-unassign / skip-self guards every caller needs.
 */
export interface NotifyBriefAssigneeChangedParams {
  briefId: string
  briefTitle: string
  referenceNumber: string
  oldAssigneeId: string | null
  newAssigneeId: string | null
  actorId: string
}

export type NotifyBriefAssigneeChangedResult =
  | { notified: true }
  | { notified: false; reason: 'unchanged' | 'unassigned' | 'self_assignment' }

export async function notifyBriefAssigneeChanged(
  params: NotifyBriefAssigneeChangedParams
): Promise<NotifyBriefAssigneeChangedResult> {
  if (params.oldAssigneeId === params.newAssigneeId) {
    return { notified: false, reason: 'unchanged' }
  }
  if (!params.newAssigneeId) {
    return { notified: false, reason: 'unassigned' }
  }
  if (params.newAssigneeId === params.actorId) {
    return { notified: false, reason: 'self_assignment' }
  }

  await notifyBriefAssigned({
    briefId: params.briefId,
    briefTitle: params.briefTitle,
    referenceNumber: params.referenceNumber,
    assigneeId: params.newAssigneeId,
    assignerId: params.actorId,
  })
  return { notified: true }
}

/**
 * Notify the brief owner + watchers when a brief is converted into a project (G5).
 * The conversion previously emitted nothing — work materialised silently. Fire-and-forget:
 * never throws into the conversion path.
 */
export async function notifyBriefConverted(params: {
  briefId: string
  briefTitle: string
  referenceNumber: string
  projectId: string
  projectName: string
  tasksCreated: number
  ownerId: string | null
  actorId: string
}) {
  try {
    // Recipients = brief owner + watchers (notify_on_update), minus the converter.
    const recipientIds = new Set<string>()
    if (params.ownerId && params.ownerId !== params.actorId) recipientIds.add(params.ownerId)
    const watchers = await queryRows(`
      SELECT bw.user_id
      FROM brief_watchers bw
      WHERE bw.brief_id = $1
        AND bw.user_id != $2
        AND (bw.notify_on_update IS NULL OR bw.notify_on_update = true)
    `, [params.briefId, params.actorId])
    for (const w of watchers) recipientIds.add(w.user_id)
    if (recipientIds.size === 0) return

    const taskSuffix = params.tasksCreated > 0
      ? ` with ${params.tasksCreated} task${params.tasksCreated === 1 ? '' : 's'}`
      : ''

    await createBulkNotifications(
      [...recipientIds],
      {
        type: 'brief_converted',
        title: 'Brief Converted to Project',
        message: `"${params.briefTitle}" is now project "${params.projectName}"${taskSuffix}`,
        link: `/agency/briefs/${params.briefId}`,
        actorId: params.actorId,
        metadata: {
          briefId: params.briefId,
          referenceNumber: params.referenceNumber,
          projectId: params.projectId,
          tasksCreated: params.tasksCreated,
        }
      }
    )
  } catch (error) {
    console.error('[BriefNotifications] Failed to notify conversion:', error)
  }
}

/**
 * Notify watchers/admins when a brief is submitted
 */
export async function notifyBriefSubmitted(params: {
  briefId: string
  briefTitle: string
  referenceNumber: string
  submitterId: string
  templateName: string
}) {
  try {
    // Get watchers (exclude submitter)
    const watchers = await queryRows(`
      SELECT bw.user_id, tm.name, tm.email, tm.notification_preferences
      FROM brief_watchers bw
      JOIN team_members tm ON bw.user_id = tm.id
      WHERE bw.brief_id = $1
        AND bw.user_id != $2
        AND (bw.notify_on_update IS NULL OR bw.notify_on_update = true)
    `, [params.briefId, params.submitterId])

    if (watchers.length === 0) return

    // Get submitter name
    const submitter = await queryOne('SELECT name FROM team_members WHERE id = $1', [params.submitterId])
    const submitterName = submitter?.name || 'Someone'

    // Create in-app notifications
    await createBulkNotifications(
      watchers.map(w => w.user_id),
      {
        type: 'brief_submitted',
        title: 'New Brief Submitted',
        message: `${submitterName} submitted "${params.briefTitle}" (${params.templateName})`,
        link: `/agency/briefs/${params.briefId}`,
        actorId: params.submitterId,
        metadata: {
          briefId: params.briefId,
          referenceNumber: params.referenceNumber,
          templateName: params.templateName
        }
      }
    )
  } catch (error) {
    console.error('[BriefNotifications] Failed to notify submission:', error)
  }
}
