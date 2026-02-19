/**
 * Remove Item from Collection
 * DELETE /api/agency/client-portal/collections/:id/items/:deliverableId
 */

import { queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const collectionId = getRouterParam(event, 'id')
  const deliverableId = getRouterParam(event, 'deliverableId')

  if (!collectionId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Collection ID is required'
    })
  }

  if (!deliverableId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Deliverable ID is required'
    })
  }

  try {
    // Check item exists in collection
    const existing = await queryOne(`
      SELECT cd.id, d.name as deliverable_name
      FROM collection_deliverables cd
      JOIN client_deliverables d ON cd.deliverable_id = d.id
      WHERE cd.collection_id = $1 AND cd.deliverable_id = $2
    `, [collectionId, deliverableId])

    if (!existing) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Item not found in collection'
      })
    }

    // Remove item from collection
    await queryOne(`
      DELETE FROM collection_deliverables
      WHERE collection_id = $1 AND deliverable_id = $2
      RETURNING id
    `, [collectionId, deliverableId])

    return {
      success: true,
      message: `"${existing.deliverable_name}" removed from collection`
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to remove item from collection:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to remove item from collection'
    })
  }
})
