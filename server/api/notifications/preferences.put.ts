/**
 * Update Notification Preferences
 * PUT /api/notifications/preferences
 */

import { queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'
import { NOTIFICATION_PREFERENCE_KEYS } from '~~/shared/utils/notificationPreferences'

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
  const { preferences, autoSubscribeOnParticipation, quietHours, autoAckAssignments } = body

  if (
    !preferences &&
    autoSubscribeOnParticipation === undefined &&
    quietHours === undefined &&
    autoAckAssignments === undefined
  ) {
    throw createError({
      statusCode: 400,
      statusMessage: 'At least one preference field is required'
    })
  }

  // Filter to only allowed keys and validate values are booleans
  const sanitizedPreferences: Record<string, boolean> = {}
  if (preferences && typeof preferences === 'object') {
    for (const key of NOTIFICATION_PREFERENCE_KEYS) {
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

  if (autoAckAssignments !== undefined && typeof autoAckAssignments !== 'boolean') {
    throw createError({ statusCode: 400, statusMessage: 'autoAckAssignments must be a boolean' })
  }

  const hasNotificationPreferenceUpdates = Object.keys(sanitizedPreferences).length > 0
  if (
    !hasNotificationPreferenceUpdates
    && autoSubscribeOnParticipation === undefined
    && quietHours === undefined
    && autoAckAssignments === undefined
  ) {
    throw createError({ statusCode: 400, statusMessage: 'No recognized preference fields were provided' })
  }

  try {
    // Patch JSONB in the UPDATE itself so overlapping preference saves cannot
    // overwrite one another. Non-notification updates leave the JSON untouched.
    const sets: string[] = []
    const values: any[] = [user.id]
    let idx = 2
    if (hasNotificationPreferenceUpdates) {
      sets.push(`notification_preferences = COALESCE(notification_preferences, '{}'::jsonb) || $${idx}::jsonb`)
      values.push(JSON.stringify(sanitizedPreferences))
      idx++
    }
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
    if (autoAckAssignments !== undefined) {
      sets.push(`auto_ack_assignments = $${idx}`)
      values.push(autoAckAssignments)
      idx++
    }

    const result = await queryOne(`
      UPDATE team_members
      SET ${sets.join(', ')}
      WHERE id = $1
      RETURNING notification_preferences, auto_subscribe_on_participation, quiet_hours, auto_ack_assignments
    `, values)

    return {
      success: true,
      preferences: result?.notification_preferences || sanitizedPreferences,
      autoSubscribeOnParticipation: result?.auto_subscribe_on_participation ?? false,
      quietHours: result?.quiet_hours || null,
      autoAckAssignments: result?.auto_ack_assignments ?? false,
    }
  } catch (error) {
    console.error('Failed to update notification preferences:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to update notification preferences'
    })
  }
})
