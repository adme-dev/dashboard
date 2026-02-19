/**
 * Update Retainer Agreement
 * PUT /api/agency/retainers/:clientId
 *
 * Updates the retainer settings for a specific client
 */

import { queryOne } from '~~/server/utils/db'
import { requireAuth, requireRole } from '~~/server/utils/auth'

interface UpdateRetainerBody {
  retainerAmount?: number
  billingType?: 'retainer' | 'hybrid' | 'project'
}

export default defineEventHandler(async (event) => {
  await requireAuth(event)

  // Only admins, owners, and sales can manage retainers
  await requireRole(event, ['owner', 'admin', 'sales'])

  const clientId = getRouterParam(event, 'clientId')
  const body = await readBody<UpdateRetainerBody>(event)

  if (!clientId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Client ID is required'
    })
  }

  // Build dynamic update
  const fields: string[] = []
  const values: any[] = []
  let idx = 1

  if (body.retainerAmount !== undefined) {
    if (body.retainerAmount < 0) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Retainer amount cannot be negative'
      })
    }
    fields.push(`retainer_amount = $${idx}`)
    values.push(body.retainerAmount)
    idx++
  }

  if (body.billingType !== undefined) {
    if (!['retainer', 'hybrid', 'project'].includes(body.billingType)) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Valid billing type is required (retainer, hybrid, or project)'
      })
    }
    fields.push(`billing_type = $${idx}`)
    values.push(body.billingType)
    idx++
  }

  if (fields.length === 0) {
    throw createError({
      statusCode: 400,
      statusMessage: 'No fields to update'
    })
  }

  values.push(clientId)

  try {
    const updated = await queryOne(`
      UPDATE agency_clients
      SET ${fields.join(', ')}, updated_at = NOW()
      WHERE id = $${idx}
      RETURNING
        id,
        name,
        retainer_amount,
        billing_type,
        is_active,
        updated_at
    `, values)

    if (!updated) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Client not found'
      })
    }

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
