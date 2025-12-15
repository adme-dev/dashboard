/**
 * Update Client
 * Updates client details
 */

import { queryOne } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  await requireAuth(event)

  const id = getRouterParam(event, 'id')
  const body = await readBody(event)

  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Client ID is required'
    })
  }

  // Build dynamic update query
  const allowedFields = [
    'name',
    'billing_type',
    'retainer_amount',
    'payment_terms',
    'hourly_rate',
    'media_commission_rate',
    'xero_contact_id',
    'notes',
    'is_active'
  ]

  // Map camelCase to snake_case
  const fieldMapping: Record<string, string> = {
    name: 'name',
    billingType: 'billing_type',
    retainerAmount: 'retainer_amount',
    paymentTerms: 'payment_terms',
    hourlyRate: 'hourly_rate',
    mediaCommissionRate: 'media_commission_rate',
    xeroContactId: 'xero_contact_id',
    notes: 'notes',
    isActive: 'is_active'
  }

  const updates: string[] = []
  const values: any[] = []
  let paramIndex = 1

  for (const [camelKey, snakeKey] of Object.entries(fieldMapping)) {
    if (body[camelKey] !== undefined) {
      updates.push(`${snakeKey} = $${paramIndex}`)
      values.push(body[camelKey])
      paramIndex++
    }
  }

  if (updates.length === 0) {
    throw createError({
      statusCode: 400,
      statusMessage: 'No valid fields to update'
    })
  }

  // Add updated_at
  updates.push(`updated_at = NOW()`)

  // Add id parameter
  values.push(id)

  try {
    const sql = `
      UPDATE agency_clients
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `

    const client = await queryOne(sql, values)

    if (!client) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Client not found'
      })
    }

    return {
      success: true,
      client: {
        id: client.id,
        name: client.name,
        xeroContactId: client.xero_contact_id,
        billingType: client.billing_type,
        retainerAmount: client.retainer_amount ? Number(client.retainer_amount) : null,
        paymentTerms: client.payment_terms,
        hourlyRate: client.hourly_rate ? Number(client.hourly_rate) : null,
        mediaCommissionRate: client.media_commission_rate ? Number(client.media_commission_rate) : null,
        isActive: client.is_active,
        notes: client.notes,
        createdAt: client.created_at,
        updatedAt: client.updated_at
      }
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to update client:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to update client'
    })
  }
})
