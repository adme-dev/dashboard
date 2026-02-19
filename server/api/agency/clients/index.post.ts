/**
 * Create Agency Client
 * POST /api/agency/clients
 */

import { queryOne } from '~~/server/utils/db'
import { requireAuth, requireRole } from '~~/server/utils/auth'

interface CreateClientBody {
  name: string
  billingType?: 'hourly' | 'retainer' | 'project' | 'mixed'
  retainerAmount?: number
  paymentTerms?: number
  hourlyRate?: number
  mediaCommissionRate?: number
  notes?: string
  contactEmail?: string
  contactPhone?: string
  address?: string
}

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)

  // Only admins and owners can create clients
  await requireRole(event, ['owner', 'admin', 'sales'])

  const body = await readBody<CreateClientBody>(event)

  if (!body.name?.trim()) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Client name is required'
    })
  }

  // Validate billing type
  const validBillingTypes = ['hourly', 'retainer', 'project', 'mixed']
  if (body.billingType && !validBillingTypes.includes(body.billingType)) {
    throw createError({
      statusCode: 400,
      statusMessage: `Invalid billing type. Must be one of: ${validBillingTypes.join(', ')}`
    })
  }

  // Validate retainer amount if billing type is retainer
  if (body.billingType === 'retainer' && (!body.retainerAmount || body.retainerAmount <= 0)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Retainer amount is required for retainer billing type'
    })
  }

  try {
    // Check for duplicate name
    const existing = await queryOne(
      `SELECT id FROM agency_clients WHERE LOWER(name) = LOWER($1)`,
      [body.name.trim()]
    )

    if (existing) {
      throw createError({
        statusCode: 409,
        statusMessage: 'A client with this name already exists'
      })
    }

    const client = await queryOne(`
      INSERT INTO agency_clients (
        name, billing_type, retainer_amount, payment_terms,
        hourly_rate, media_commission_rate, notes,
        contact_email, contact_phone, address, is_active
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, true)
      RETURNING *
    `, [
      body.name.trim(),
      body.billingType || 'project',
      body.retainerAmount || null,
      body.paymentTerms || 30,
      body.hourlyRate || null,
      body.mediaCommissionRate || null,
      body.notes?.trim() || null,
      body.contactEmail?.trim() || null,
      body.contactPhone?.trim() || null,
      body.address?.trim() || null
    ])

    return {
      id: client.id,
      name: client.name,
      billingType: client.billing_type,
      retainerAmount: client.retainer_amount ? Number(client.retainer_amount) : null,
      paymentTerms: client.payment_terms,
      hourlyRate: client.hourly_rate ? Number(client.hourly_rate) : null,
      mediaCommissionRate: client.media_commission_rate ? Number(client.media_commission_rate) : null,
      notes: client.notes,
      contactEmail: client.contact_email,
      contactPhone: client.contact_phone,
      address: client.address,
      isActive: client.is_active,
      createdAt: client.created_at,
      updatedAt: client.updated_at
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to create client:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to create client'
    })
  }
})
