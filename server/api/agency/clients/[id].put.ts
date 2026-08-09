/**
 * Update Client
 * Updates client details
 */

import { transaction } from '~~/server/utils/db'
import { requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'

export default defineEventHandler(async (event) => {
  // Editing billing type, rates, Xero link and active status is a sensitive
  // mutation — gate it to CLIENTS-permission staff (matches the page's Edit action).
  await requireRole(event, PERMISSIONS.CLIENTS)

  const id = getRouterParam(event, 'id')
  const body = await readBody(event)

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid client update'
    })
  }

  if (body.isActive !== undefined && typeof body.isActive !== 'boolean') {
    throw createError({
      statusCode: 400,
      statusMessage: 'isActive must be a boolean'
    })
  }

  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Client ID is required'
    })
  }

  // A client must always have a name — reject blanks rather than silently
  // persisting an empty string (the form's `*` is cosmetic, not enforced).
  if (body.name !== undefined && (typeof body.name !== 'string' || !body.name.trim())) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Client name cannot be empty'
    })
  }

  const leadCaptureModes = new Set([
    'analytics_only',
    'capture_only',
    'lightweight_crm',
    'full_crm',
    'external_crm'
  ])
  if (
    body.leadCaptureMode !== undefined
    && (typeof body.leadCaptureMode !== 'string' || !leadCaptureModes.has(body.leadCaptureMode))
  ) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid lead capture mode'
    })
  }

  // Build dynamic update query — camelCase (request) → snake_case (column).
  // This mapping is also the allowlist: only these fields can be updated.
  const fieldMapping: Record<string, string> = {
    name: 'name',
    billingType: 'billing_type',
    retainerAmount: 'retainer_amount',
    paymentTerms: 'payment_terms',
    hourlyRate: 'hourly_rate',
    mediaCommissionRate: 'media_commission_rate',
    xeroContactId: 'xero_contact_id',
    notes: 'notes',
    contactEmail: 'contact_email',
    contactPhone: 'contact_phone',
    address: 'address',
    isActive: 'is_active',
    reportingTimezone: 'reporting_timezone',
    leadCaptureMode: 'lead_capture_mode'
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

    const client = await transaction(async (db) => {
      const updated = await db.query(sql, values)
      const row = (updated as { rows?: any[] }).rows?.[0] ?? null

      // Deactivation invalidates every portal session atomically with the
      // client status change, so an already-issued cookie cannot survive a
      // successful deactivation commit.
      if (row?.is_active === false) {
        await db.query(`
          DELETE FROM client_sessions
          WHERE client_user_id IN (
            SELECT id FROM client_users WHERE client_id = $1
          )
        `, [id])
      }

      return row
    })

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
        contactEmail: client.contact_email,
        contactPhone: client.contact_phone,
        address: client.address,
        reportingTimezone: client.reporting_timezone,
        leadCaptureMode: client.lead_capture_mode || 'capture_only',
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
