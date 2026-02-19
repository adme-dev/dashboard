/**
 * Delete/Deactivate Client Portal User
 * DELETE /api/agency/client-portal/users/:id
 *
 * Query params:
 * - hard: If true, permanently delete (default: false, soft deactivate)
 */

import { queryOne } from '~~/server/utils/db'
import { requireAuth, requireRole } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  await requireRole(event, ['owner', 'admin'])

  const userId = getRouterParam(event, 'id')
  const query = getQuery(event)
  const hardDelete = query.hard === 'true'

  if (!userId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'User ID is required'
    })
  }

  try {
    // Check user exists
    const existing = await queryOne(`
      SELECT id, email, name, status, is_primary_contact
      FROM client_users WHERE id = $1
    `, [userId])

    if (!existing) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Client user not found'
      })
    }

    // Warn if primary contact
    if (existing.is_primary_contact && hardDelete) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Cannot permanently delete primary contact. Assign another primary contact first or use soft delete.'
      })
    }

    if (hardDelete) {
      // Permanently delete
      await queryOne(`
        DELETE FROM client_users WHERE id = $1 RETURNING id
      `, [userId])

      return {
        success: true,
        action: 'deleted',
        message: `User ${existing.email} has been permanently deleted`
      }
    } else {
      // Soft deactivate
      const user = await queryOne(`
        UPDATE client_users
        SET status = 'deactivated', updated_at = NOW()
        WHERE id = $1
        RETURNING id, email, status
      `, [userId])

      return {
        success: true,
        action: 'deactivated',
        message: `User ${existing.email} has been deactivated`,
        user: {
          id: user.id,
          email: user.email,
          status: user.status
        }
      }
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to delete client user:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to delete client user'
    })
  }
})
