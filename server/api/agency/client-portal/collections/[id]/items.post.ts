/**
 * Add Items to Collection
 * POST /api/agency/client-portal/collections/:id/items
 *
 * Body:
 * - deliverableIds: Array of deliverable IDs to add
 */

import { queryOne, queryRows, transaction } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const collectionId = getRouterParam(event, 'id')
  const body = await readBody(event)

  const { deliverableIds } = body

  if (!collectionId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Collection ID is required'
    })
  }

  if (!deliverableIds || !Array.isArray(deliverableIds) || deliverableIds.length === 0) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Deliverable IDs array is required'
    })
  }

  try {
    // Check collection exists
    const collection = await queryOne(`
      SELECT id, client_id, item_count FROM deliverable_collections WHERE id = $1
    `, [collectionId])

    if (!collection) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Collection not found'
      })
    }

    // Get current max sort order
    const maxOrder = await queryOne(`
      SELECT COALESCE(MAX(sort_order), 0) as max_order FROM collection_items WHERE collection_id = $1
    `, [collectionId])

    let currentOrder = Number(maxOrder?.max_order || 0)
    const addedItems: any[] = []

    await transaction(async (client) => {
      for (const deliverableId of deliverableIds) {
        // Verify deliverable exists and belongs to same client
        const deliverable = await client.query(`
          SELECT id, title, client_id FROM client_deliverables WHERE id = $1
        `, [deliverableId])

        if (deliverable.rows.length === 0) {
          continue // Skip invalid IDs
        }

        if (deliverable.rows[0].client_id !== collection.client_id) {
          continue // Skip deliverables from other clients
        }

        // Check if already in collection
        const existing = await client.query(`
          SELECT id FROM collection_items WHERE collection_id = $1 AND deliverable_id = $2
        `, [collectionId, deliverableId])

        if (existing.rows.length > 0) {
          continue // Skip duplicates
        }

        currentOrder++

        // Add to collection
        const result = await client.query(`
          INSERT INTO collection_items (collection_id, deliverable_id, sort_order, added_by)
          VALUES ($1, $2, $3, $4)
          RETURNING id
        `, [collectionId, deliverableId, currentOrder, user.id])

        addedItems.push({
          id: result.rows[0].id,
          deliverableId,
          title: deliverable.rows[0].title,
          sortOrder: currentOrder
        })
      }
    })

    // Get updated collection
    const updated = await queryOne(`
      SELECT item_count FROM deliverable_collections WHERE id = $1
    `, [collectionId])

    return {
      success: true,
      addedCount: addedItems.length,
      items: addedItems,
      collection: {
        id: collectionId,
        itemCount: updated?.item_count || 0
      }
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to add items to collection:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to add items to collection'
    })
  }
})
