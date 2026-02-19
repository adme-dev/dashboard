/**
 * Delete Deliverable
 * DELETE /api/agency/client-portal/deliverables/:id
 *
 * Query params:
 * - hard: If true, permanently delete (default: false, archive)
 */

import { queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)

  const deliverableId = getRouterParam(event, 'id')
  const query = getQuery(event)
  const hardDelete = query.hard === 'true'

  if (!deliverableId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Deliverable ID is required'
    })
  }

  try {
    // Check deliverable exists
    const existing = await queryOne(`
      SELECT id, title, status FROM client_deliverables WHERE id = $1
    `, [deliverableId])

    if (!existing) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Deliverable not found'
      })
    }

    if (hardDelete) {
      // Remove from collections first
      await queryOne(`
        DELETE FROM collection_items WHERE deliverable_id = $1
      `, [deliverableId])

      // Permanently delete
      await queryOne(`
        DELETE FROM client_deliverables WHERE id = $1 RETURNING id
      `, [deliverableId])

      return {
        success: true,
        action: 'deleted',
        message: `Deliverable "${existing.title}" has been permanently deleted`
      }
    } else {
      // Archive
      const deliverable = await queryOne(`
        UPDATE client_deliverables
        SET status = 'archived', is_visible_to_client = false, updated_at = NOW()
        WHERE id = $1
        RETURNING id, title, status
      `, [deliverableId])

      return {
        success: true,
        action: 'archived',
        message: `Deliverable "${existing.title}" has been archived`,
        deliverable: {
          id: deliverable.id,
          title: deliverable.title,
          status: deliverable.status
        }
      }
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to delete deliverable:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to delete deliverable'
    })
  }
})
