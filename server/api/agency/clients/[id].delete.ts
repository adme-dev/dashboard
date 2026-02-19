/**
 * Delete/Deactivate Agency Client
 * DELETE /api/agency/clients/:id
 *
 * Soft-deletes (deactivates) a client. Clients with active projects cannot be deleted.
 */

import { queryOne, queryRows } from '~~/server/utils/db'
import { requireAuth, requireRole } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)

  // Only admins and owners can delete clients
  await requireRole(event, ['owner', 'admin'])

  const clientId = getRouterParam(event, 'id')

  if (!clientId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Client ID is required'
    })
  }

  try {
    // Check if client exists
    const client = await queryOne(
      `SELECT id, name, is_active FROM agency_clients WHERE id = $1`,
      [clientId]
    )

    if (!client) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Client not found'
      })
    }

    // Check for active projects
    const activeProjects = await queryRows(`
      SELECT id, name FROM projects
      WHERE client_id = $1 AND status IN ('active', 'draft')
      LIMIT 5
    `, [clientId])

    if (activeProjects.length > 0) {
      throw createError({
        statusCode: 400,
        statusMessage: `Cannot delete client with active projects. Please complete or cancel the following projects first: ${activeProjects.map(p => p.name).join(', ')}`
      })
    }

    // Check query param for hard delete vs soft delete
    const query = getQuery(event)
    const hardDelete = query.hard === 'true'

    if (hardDelete) {
      // Hard delete - only if no projects at all
      const projectCount = await queryOne(
        `SELECT COUNT(*) as count FROM projects WHERE client_id = $1`,
        [clientId]
      )

      if (Number(projectCount?.count) > 0) {
        throw createError({
          statusCode: 400,
          statusMessage: 'Cannot permanently delete client with project history. Use soft delete instead.'
        })
      }

      await queryOne(
        `DELETE FROM agency_clients WHERE id = $1 RETURNING id`,
        [clientId]
      )

      return {
        success: true,
        message: 'Client permanently deleted',
        deleted: true
      }
    } else {
      // Soft delete - deactivate the client
      await queryOne(`
        UPDATE agency_clients
        SET is_active = false, updated_at = NOW()
        WHERE id = $1
        RETURNING id
      `, [clientId])

      return {
        success: true,
        message: 'Client deactivated successfully',
        deactivated: true
      }
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to delete client:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to delete client'
    })
  }
})
