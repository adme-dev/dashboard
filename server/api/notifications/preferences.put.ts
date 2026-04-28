/**
 * Update Notification Preferences
 * PUT /api/notifications/preferences
 */

import { queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

const ALLOWED_KEYS = [
  'email_task_assigned',
  'email_task_mentioned',
  'email_task_due',
  'email_approval_request',
  'email_weekly_digest',
  'email_board_member_added',
  'email_brief_assigned',
  'email_brief_status',
  'email_brief_comment',
  'inapp_task_assigned',
  'inapp_task_mentioned',
  'inapp_task_status',
  'inapp_task_comment',
  'inapp_task_due',
  'inapp_approval',
  'inapp_board_member_added',
  'inapp_brief_assigned',
  'inapp_brief_status',
  'inapp_brief_comment',
  'inapp_chat_mention',
  'inapp_chat_dm'
]

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const body = await readBody(event)
  const { preferences } = body

  if (!preferences || typeof preferences !== 'object') {
    throw createError({
      statusCode: 400,
      statusMessage: 'Preferences object is required'
    })
  }

  // Filter to only allowed keys and validate values are booleans
  const sanitizedPreferences: Record<string, boolean> = {}
  for (const key of ALLOWED_KEYS) {
    if (key in preferences) {
      if (typeof preferences[key] !== 'boolean') {
        throw createError({
          statusCode: 400,
          statusMessage: `Preference ${key} must be a boolean`
        })
      }
      sanitizedPreferences[key] = preferences[key]
    }
  }

  try {
    // Get current preferences
    const current = await queryOne(`
      SELECT notification_preferences
      FROM team_members
      WHERE id = $1
    `, [user.id])

    // Merge with existing preferences
    const merged = {
      ...(current?.notification_preferences || {}),
      ...sanitizedPreferences
    }

    // Update preferences
    const result = await queryOne(`
      UPDATE team_members
      SET notification_preferences = $2
      WHERE id = $1
      RETURNING notification_preferences
    `, [user.id, JSON.stringify(merged)])

    return {
      success: true,
      preferences: result?.notification_preferences || merged
    }
  } catch (error) {
    console.error('Failed to update notification preferences:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to update notification preferences'
    })
  }
})
