/**
 * Delete a time entry
 * DELETE /api/agency/time/entries/:id
 */

import { queryOne, queryCount } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const entryId = getRouterParam(event, 'id')

  if (!entryId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Entry ID is required'
    })
  }

  // Get existing entry
  const existing = await queryOne(
    'SELECT * FROM time_entries WHERE id = $1',
    [entryId]
  )

  if (!existing) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Time entry not found'
    })
  }

  // Check permissions (user can delete own entries, managers can delete any)
  const isManager = ['admin', 'owner', 'lead'].includes(user.role || '')
  const isOwner = existing.user_id === user.id

  if (!isOwner && !isManager) {
    throw createError({
      statusCode: 403,
      statusMessage: 'You do not have permission to delete this entry'
    })
  }

  // Cannot delete approved/invoiced entries unless admin
  if (existing.invoiced) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Cannot delete invoiced time entries'
    })
  }

  if (existing.approved && !['admin', 'owner'].includes(user.role || '')) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Cannot delete approved time entries'
    })
  }

  // Delete the entry
  await queryCount(
    'DELETE FROM time_entries WHERE id = $1',
    [entryId]
  )

  return {
    success: true,
    message: 'Time entry deleted'
  }
})
