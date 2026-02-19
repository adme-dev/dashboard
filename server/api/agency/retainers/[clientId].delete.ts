/**
 * Remove Retainer Agreement
 * DELETE /api/agency/retainers/:clientId
 *
 * Removes the retainer agreement from a client (sets to project billing with $0 retainer)
 */

import { queryOne } from '~~/server/utils/db'
import { requireAuth, requireRole } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)

  // Only admins, owners, and sales can manage retainers
  await requireRole(event, ['owner', 'admin', 'sales'])

  const clientId = getRouterParam(event, 'clientId')

  if (!clientId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Client ID is required'
    })
  }

  try {
    // Check if client exists
    const client = await queryOne(
      `SELECT id, name, billing_type, retainer_amount FROM agency_clients WHERE id = $1`,
      [clientId]
    )

    if (!client) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Client not found'
      })
    }

    if (client.billing_type === 'project' && Number(client.retainer_amount) === 0) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Client does not have a retainer agreement'
      })
    }

    // Remove retainer - set to project billing with $0 retainer
    const updated = await queryOne(`
      UPDATE agency_clients
      SET
        retainer_amount = 0,
        billing_type = 'project',
        updated_at = NOW()
      WHERE id = $1
      RETURNING
        id,
        name,
        retainer_amount,
        billing_type,
        updated_at
    `, [clientId])

    return {
      success: true,
      message: 'Retainer agreement removed successfully',
      client: {
        id: updated.id,
        name: updated.name,
        retainerAmount: Number(updated.retainer_amount),
        billingType: updated.billing_type,
        updatedAt: updated.updated_at
      }
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to remove retainer:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to remove retainer agreement'
    })
  }
})
