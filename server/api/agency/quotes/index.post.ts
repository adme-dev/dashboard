/**
 * Create a new quote
 * Requires pricing create permission (sales role, sales department, or admin)
 */

import { queryOne } from '~~/server/utils/db'
import { requirePricingAccess, logActivity } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  // Check pricing access
  const user = await requirePricingAccess(event, 'quote', 'create')

  const body = await readBody(event)

  // Validate required fields
  if (!body.title) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Title is required'
    })
  }

  try {
    // Create the quote (quote_number is auto-generated)
    const quote = await queryOne(`
      INSERT INTO quotes (
        brief_id,
        client_id,
        project_id,
        title,
        description,
        valid_from,
        valid_until,
        status,
        discount_percent,
        tax_percent,
        currency,
        terms,
        payment_terms,
        notes,
        client_notes,
        created_by,
        assigned_to
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      RETURNING *
    `, [
      body.briefId || null,
      body.clientId || null,
      body.projectId || null,
      body.title,
      body.description || null,
      body.validFrom || new Date().toISOString().split('T')[0],
      body.validUntil || null,
      body.status || 'draft',
      body.discountPercent || 0,
      body.taxPercent || 0,
      body.currency || 'USD',
      body.terms || null,
      body.paymentTerms || null,
      body.notes || null,
      body.clientNotes || null,
      user.id,
      body.assignedTo || user.id
    ])

    // Log activity
    await logActivity({
      userId: user.id,
      action: 'create',
      resourceType: 'quote',
      resourceId: quote.id,
      newValues: { title: body.title, quoteNumber: quote.quote_number },
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
        createdAt: quote.created_at,
        updatedAt: quote.updated_at,
      }
    }
  } catch (error) {
    console.error('Failed to create quote:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to create quote'
    })
  }
})
