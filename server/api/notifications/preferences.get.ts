/**
 * Get Notification Preferences
 * GET /api/notifications/preferences
 */

import { queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

const DEFAULT_PREFERENCES = {
  // Email notifications
  email_task_assigned: true,
  email_task_mentioned: true,
  email_task_due: true,
  email_approval_request: true,
  email_weekly_digest: false,
  email_board_member_added: true,
  email_brief_assigned: true,
  email_brief_status: true,
  email_brief_comment: true,
  // In-app notifications
  inapp_task_assigned: true,
  inapp_task_mentioned: true,
  inapp_task_status: true,
  inapp_task_comment: true,
  inapp_task_due: true,
  inapp_approval: true,
  inapp_board_member_added: true,
  inapp_brief_assigned: true,
  inapp_brief_status: true,
  inapp_brief_comment: true,
  inapp_chat_mention: true,
  inapp_chat_dm: true
}

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)

  try {
    const result = await queryOne(`
      SELECT notification_preferences, auto_subscribe_on_participation, quiet_hours
      FROM team_members
      WHERE id = $1
    `, [user.id])

    // Merge with defaults to ensure all keys exist
    const preferences = {
      ...DEFAULT_PREFERENCES,
      ...(result?.notification_preferences || {})
    }

    return {
      preferences,
      autoSubscribeOnParticipation: result?.auto_subscribe_on_participation ?? true,
      quietHours: result?.quiet_hours || null,
    }
  } catch (error) {
    console.error('Failed to fetch notification preferences:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch notification preferences'
    })
  }
})
