/**
 * Update a quote
 * Requires pricing edit permission
 */

import { queryOne } from '~~/server/utils/db'
import { requirePricingAccess, logActivity } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  // Check pricing access
  const user = await requirePricingAccess(event, 'quote', 'edit')

  const quoteId = getRouterParam(event, 'id')
  const body = await readBody(event)

  if (!quoteId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Quote ID is required'
    })
  }

  try {
    // Check if quote exists
    const existing = await queryOne('SELECT * FROM quotes WHERE id = $1', [quoteId])

    if (!existing) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Quote not found'
      })
    }

    // Build update query dynamically
    const updates: string[] = []
    const params: any[] = []
    let idx = 1

    const updateFields = [
      { key: 'title', column: 'title' },
      { key: 'description', column: 'description' },
      { key: 'briefId', column: 'brief_id' },
      { key: 'clientId', column: 'client_id' },
      { key: 'projectId', column: 'project_id' },
      { key: 'validFrom', column: 'valid_from' },
      { key: 'validUntil', column: 'valid_until' },
      { key: 'status', column: 'status' },
      { key: 'discountPercent', column: 'discount_percent' },
      { key: 'taxPercent', column: 'tax_percent' },
      { key: 'currency', column: 'currency' },
      { key: 'terms', column: 'terms' },
      { key: 'paymentTerms', column: 'payment_terms' },
      { key: 'notes', column: 'notes' },
      { key: 'clientNotes', column: 'client_notes' },
      { key: 'assignedTo', column: 'assigned_to' },
    ]

    for (const field of updateFields) {
      if (body[field.key] !== undefined) {
        updates.push(`${field.column} = $${idx}`)
        params.push(body[field.key])
        idx++
      }
    }

    // Handle special status transitions
    if (body.status === 'sent' && existing.status !== 'sent') {
      updates.push(`sent_at = NOW()`)
    }
    if (body.status === 'accepted' && existing.status !== 'accepted') {
      updates.push(`accepted_at = NOW()`)
    }
    if (body.status === 'rejected' && existing.status !== 'rejected') {
      updates.push(`rejected_at = NOW()`)
      if (body.rejectionReason) {
        updates.push(`rejection_reason = $${idx}`)
        params.push(body.rejectionReason)
        idx++
      }
    }

    if (updates.length === 0) {
      throw createError({
        statusCode: 400,
        statusMessage: 'No fields to update'
      })
    }

    params.push(quoteId)

    const quote = await queryOne(`
      UPDATE quotes
      SET ${updates.join(', ')}, updated_at = NOW()
      WHERE id = $${idx}
      RETURNING *
    `, params)

    // Log activity
    await logActivity({
      userId: user.id,
      action: 'update',
      resourceType: 'quote',
      resourceId: quote.id,
      oldValues: { status: existing.status },
      newValues: { status: quote.status },
      event
    })

    return {
      quote: {
        id: quote.id,
        quoteNumber: quote.quote_number,
        briefId: quote.brief_id,
        clientId: quote.client_id,
        projectId: quote.project_id,
        title: quote.title,
        description: quote.description,
        validFrom: quote.valid_from,
        validUntil: quote.valid_until,
        status: quote.status,
        sentAt: quote.sent_at,
        viewedAt: quote.viewed_at,
        acceptedAt: quote.accepted_at,
        rejectedAt: quote.rejected_at,
        rejectionReason: quote.rejection_reason,
        subtotal: Number(quote.subtotal),
        discountPercent: Number(quote.discount_percent),
        discountAmount: Number(quote.discount_amount),
        taxPercent: Number(quote.tax_percent),
        taxAmount: Number(quote.tax_amount),
        total: Number(quote.total),
        currency: quote.currency,
        paymentTerms: quote.payment_terms,
        version: quote.version,
        createdBy: quote.created_by,
        assignedTo: quote.assigned_to,
        approvedBy: quote.approved_by,
        approvedAt: quote.approved_at,
        createdAt: quote.created_at,
        updatedAt: quote.updated_at,
      }
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to update quote:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to update quote'
    })
  }
})
