/**
 * Delete Collection
 * DELETE /api/agency/client-portal/collections/:id
 */

import { queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const collectionId = getRouterParam(event, 'id')

  if (!collectionId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Collection ID is required'
    })
  }

  try {
    // Check collection exists
    const existing = await queryOne(`
      SELECT id, name FROM deliverable_collections WHERE id = $1
    `, [collectionId])

    if (!existing) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Collection not found'
      })
    }

    // Delete collection (cascade will remove collection_deliverables)
    await queryOne(`
      DELETE FROM deliverable_collections WHERE id = $1 RETURNING id
    `, [collectionId])

    return {
      success: true,
      message: `Collection "${existing.name}" deleted successfully`
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to delete collection:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to delete collection'
    })
  }
})
