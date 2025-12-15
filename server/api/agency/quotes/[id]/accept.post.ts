/**
 * Accept a quote and convert to job pricing
 * Requires pricing edit permission
 */

import { queryOne } from '~~/server/utils/db'
import { requirePricingAccess, logActivity } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  // Check pricing access
  const user = await requirePricingAccess(event, 'quote', 'edit')

  const quoteId = getRouterParam(event, 'id')

  if (!quoteId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Quote ID is required'
    })
  }

  try {
    // Get quote
    const quote = await queryOne('SELECT * FROM quotes WHERE id = $1', [quoteId])

    if (!quote) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Quote not found'
      })
    }

    if (quote.status === 'accepted') {
      throw createError({
        statusCode: 400,
        statusMessage: 'Quote is already accepted'
      })
    }

    if (quote.status === 'rejected' || quote.status === 'expired') {
      throw createError({
        statusCode: 400,
        statusMessage: `Cannot accept a ${quote.status} quote`
      })
    }

    // Use the conversion function
    const jobPricingId = await queryOne(`
      SELECT convert_quote_to_job_pricing($1, $2) as job_pricing_id
    `, [quoteId, user.id])

    // Get updated quote
    const updatedQuote = await queryOne('SELECT * FROM quotes WHERE id = $1', [quoteId])

    // Get job pricing record
    const jobPricing = await queryOne('SELECT * FROM job_pricing WHERE id = $1', [jobPricingId.job_pricing_id])

    // Log activity
    await logActivity({
      userId: user.id,
      action: 'accept',
      resourceType: 'quote',
      resourceId: quote.id,
      oldValues: { status: quote.status },
      newValues: { status: 'accepted', jobPricingId: jobPricingId.job_pricing_id },
      event
    })

    return {
      quote: {
        id: updatedQuote.id,
        quoteNumber: updatedQuote.quote_number,
        status: updatedQuote.status,
        acceptedAt: updatedQuote.accepted_at,
        total: Number(updatedQuote.total),
      },
      jobPricing: {
        id: jobPricing.id,
        quoteId: jobPricing.quote_id,
        briefId: jobPricing.brief_id,
        projectId: jobPricing.project_id,
        clientId: jobPricing.client_id,
        pricingType: jobPricing.pricing_type,
        agreedTotal: Number(jobPricing.agreed_total),
        currency: jobPricing.currency,
        isActive: jobPricing.is_active,
        approvedAt: jobPricing.approved_at,
        approvedBy: jobPricing.approved_by,
      }
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to accept quote:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to accept quote'
    })
  }
})
