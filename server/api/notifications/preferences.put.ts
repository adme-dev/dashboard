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

function validateQuietHours(input: any): { valid: boolean; reason?: string } {
  if (input === null) return { valid: true }
  if (typeof input !== 'object') return { valid: false, reason: 'must be an object or null' }
  if (typeof input.enabled !== 'boolean') return { valid: false, reason: 'enabled must be a boolean' }
  if (typeof input.startMinute !== 'number' || input.startMinute < 0 || input.startMinute > 1439) {
    return { valid: false, reason: 'startMinute must be 0..1439' }
  }
  if (typeof input.endMinute !== 'number' || input.endMinute < 0 || input.endMinute > 1439) {
    return { valid: false, reason: 'endMinute must be 0..1439' }
  }
  if (typeof input.timezone !== 'string' || !input.timezone) {
    return { valid: false, reason: 'timezone (IANA) is required' }
  }
  if (!Array.isArray(input.daysOfWeek) || !input.daysOfWeek.every((d: any) => typeof d === 'number' && d >= 0 && d <= 6)) {
    return { valid: false, reason: 'daysOfWeek must be an array of 0..6' }
  }
  return { valid: true }
}

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const body = await readBody(event)
  const { preferences, autoSubscribeOnParticipation, quietHours } = body

  if (!preferences && autoSubscribeOnParticipation === undefined && quietHours === undefined) {
    throw createError({
      statusCode: 400,
      statusMessage: 'preferences, autoSubscribeOnParticipation, or quietHours is required'
    })
  }

  // Filter to only allowed keys and validate values are booleans
  const sanitizedPreferences: Record<string, boolean> = {}
  if (preferences && typeof preferences === 'object') {
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
  }

  if (autoSubscribeOnParticipation !== undefined && typeof autoSubscribeOnParticipation !== 'boolean') {
    throw createError({
      statusCode: 400,
      statusMessage: 'autoSubscribeOnParticipation must be a boolean'
    })
  }

  if (quietHours !== undefined) {
    const v = validateQuietHours(quietHours)
    if (!v.valid) {
      throw createError({ statusCode: 400, statusMessage: `quietHours invalid: ${v.reason}` })
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

    // Build dynamic UPDATE based on which fields were provided
    const sets: string[] = ['notification_preferences = $2']
    const values: any[] = [user.id, JSON.stringify(merged)]
    let idx = 3
    if (autoSubscribeOnParticipation !== undefined) {
      sets.push(`auto_subscribe_on_participation = $${idx}`)
      values.push(autoSubscribeOnParticipation)
      idx++
    }
    if (quietHours !== undefined) {
      sets.push(`quiet_hours = $${idx}`)
      values.push(quietHours === null ? null : JSON.stringify(quietHours))
      idx++
    }

    const result = await queryOne(`
      UPDATE team_members
      SET ${sets.join(', ')}
      WHERE id = $1
      RETURNING notification_preferences, auto_subscribe_on_participation, quiet_hours
    `, values)

    return {
      success: true,
      preferences: result?.notification_preferences || merged,
      autoSubscribeOnParticipation: result?.auto_subscribe_on_participation ?? true,
      quietHours: result?.quiet_hours || null,
    }
  } catch (error) {
    console.error('Failed to update notification preferences:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to update notification preferences'
    })
  }
})
