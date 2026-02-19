/**
 * Create/Update Retainer Agreement
 * POST /api/agency/retainers
 *
 * Updates the retainer settings for a client (retainer_amount, billing_type)
 */

import { queryOne } from '~~/server/utils/db'
import { requireAuth, requireRole } from '~~/server/utils/auth'

interface RetainerBody {
  clientId: string
  retainerAmount: number
  billingType: 'retainer' | 'hybrid' | 'project'
  hoursIncluded?: number
  rolloverEnabled?: boolean
  maxRolloverHours?: number
}

export default defineEventHandler(async (event) => {
  await requireAuth(event)

  // Only admins, owners, and sales can manage retainers
  await requireRole(event, ['owner', 'admin', 'sales'])

  const body = await readBody<RetainerBody>(event)

  if (!body.clientId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Client ID is required'
    })
  }

  if (body.retainerAmount === undefined || body.retainerAmount < 0) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Valid retainer amount is required'
    })
  }

  if (!body.billingType || !['retainer', 'hybrid', 'project'].includes(body.billingType)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Valid billing type is required (retainer, hybrid, or project)'
    })
  }

  try {
    // Check if client exists
    const client = await queryOne(
      `SELECT id, name FROM agency_clients WHERE id = $1`,
      [body.clientId]
    )

    if (!client) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Client not found'
      })
    }

    // Update client's retainer settings
    const updated = await queryOne(`
      UPDATE agency_clients
      SET
        retainer_amount = $1,
        billing_type = $2,
        updated_at = NOW()
      WHERE id = $3
      RETURNING
        id,
        name,
        retainer_amount,
        billing_type,
        is_active,
        updated_at
    `, [body.retainerAmount, body.billingType, body.clientId])

    return {
      success: true,
      message: 'Retainer agreement updated successfully',
      retainer: {
        clientId: updated.id,
        clientName: updated.name,
        retainerAmount: Number(updated.retainer_amount),
        billingType: updated.billing_type,
        isActive: updated.is_active,
        updatedAt: updated.updated_at
      }
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to update retainer:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to update retainer agreement'
    })
  }
})
