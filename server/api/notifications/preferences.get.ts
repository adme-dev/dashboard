/**
 * Get Notification Preferences
 * GET /api/notifications/preferences
 */

import { queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'
import { DEFAULT_NOTIFICATION_PREFERENCES } from '~~/shared/utils/notificationPreferences'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)

  try {
    const result = await queryOne(`
      SELECT notification_preferences, auto_subscribe_on_participation, quiet_hours, auto_ack_assignments
      FROM team_members
      WHERE id = $1
    `, [user.id])

    // Merge with defaults to ensure all keys exist
    const preferences = {
      ...DEFAULT_NOTIFICATION_PREFERENCES,
      ...(result?.notification_preferences || {})
    }

    return {
      preferences,
      autoSubscribeOnParticipation: result?.auto_subscribe_on_participation ?? false,
      quietHours: result?.quiet_hours || null,
      autoAckAssignments: result?.auto_ack_assignments ?? false,
    }
  } catch (error) {
    console.error('Failed to fetch notification preferences:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch notification preferences'
    })
  }
})
