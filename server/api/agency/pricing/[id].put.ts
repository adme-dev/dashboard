/**
 * Update job pricing record
 * Requires job pricing edit permission
 */

import { queryOne } from '~~/server/utils/db'
import { requirePricingAccess, logActivity } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  // Check pricing access
  const user = await requirePricingAccess(event, 'job_pricing', 'edit')

  const pricingId = getRouterParam(event, 'id')
  const body = await readBody(event)

  if (!pricingId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Pricing ID is required'
    })
  }

  try {
    // Check if pricing exists
    const existing = await queryOne('SELECT * FROM job_pricing WHERE id = $1', [pricingId])

    if (!existing) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Job pricing not found'
      })
    }

    // Build update query dynamically
    const updates: string[] = []
    const params: any[] = []
    let idx = 1

    const updateFields = [
      { key: 'pricingType', column: 'pricing_type' },
      { key: 'agreedTotal', column: 'agreed_total' },
      { key: 'currency', column: 'currency' },
      { key: 'hourlyRate', column: 'hourly_rate' },
      { key: 'monthlyRetainer', column: 'monthly_retainer' },
      { key: 'hoursIncluded', column: 'hours_included' },
      { key: 'overageRate', column: 'overage_rate' },
      { key: 'invoicedAmount', column: 'invoiced_amount' },
      { key: 'paidAmount', column: 'paid_amount' },
      { key: 'isActive', column: 'is_active' },
      { key: 'notes', column: 'notes' },
    ]

    for (const field of updateFields) {
      if (body[field.key] !== undefined) {
        updates.push(`${field.column} = $${idx}`)
        params.push(body[field.key])
        idx++
      }
    }

    if (updates.length === 0) {
      throw createError({
        statusCode: 400,
        statusMessage: 'No fields to update'
      })
    }

    params.push(pricingId)

    const pricing = await queryOne(`
      UPDATE job_pricing
      SET ${updates.join(', ')}, updated_at = NOW()
      WHERE id = $${idx}
      RETURNING *
    `, params)

    // Log activity
    await logActivity({
      userId: user.id,
      action: 'update',
      resourceType: 'job_pricing',
      resourceId: pricing.id,
      oldValues: { agreedTotal: existing.agreed_total, isActive: existing.is_active },
      newValues: { agreedTotal: pricing.agreed_total, isActive: pricing.is_active },
      event
    })

    return {
      pricing: {
        id: pricing.id,
        briefId: pricing.brief_id,
        quoteId: pricing.quote_id,
        projectId: pricing.project_id,
        clientId: pricing.client_id,
        pricingType: pricing.pricing_type,
        agreedTotal: Number(pricing.agreed_total),
        currency: pricing.currency,
        hourlyRate: pricing.hourly_rate ? Number(pricing.hourly_rate) : null,
        monthlyRetainer: pricing.monthly_retainer ? Number(pricing.monthly_retainer) : null,
        hoursIncluded: pricing.hours_included,
        overageRate: pricing.overage_rate ? Number(pricing.overage_rate) : null,
        invoicedAmount: Number(pricing.invoiced_amount),
        paidAmount: Number(pricing.paid_amount),
        remainingAmount: Number(pricing.remaining_amount),
        isActive: pricing.is_active,
        approvedAt: pricing.approved_at,
        approvedBy: pricing.approved_by,
        notes: pricing.notes,
        createdAt: pricing.created_at,
        updatedAt: pricing.updated_at,
      }
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to update job pricing:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to update job pricing'
    })
  }
})
