/**
 * Add a line item to a quote
 * Requires pricing edit permission
 */

import { queryOne } from '~~/server/utils/db'
import { requirePricingAccess } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  // Check pricing access
  await requirePricingAccess(event, 'quote', 'edit')

  const quoteId = getRouterParam(event, 'id')
  const body = await readBody(event)

  if (!quoteId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Quote ID is required'
    })
  }

  if (!body.name || body.unitPrice === undefined) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Name and unit price are required'
    })
  }

  try {
    // Verify quote exists
    const quote = await queryOne('SELECT id FROM quotes WHERE id = $1', [quoteId])

    if (!quote) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Quote not found'
      })
    }

    // Calculate line total
    const quantity = Number(body.quantity) || 1
    const unitPrice = Number(body.unitPrice)
    const discountPercent = Number(body.discountPercent) || 0
    const lineTotal = quantity * unitPrice * (1 - discountPercent / 100)

    // Get next sort order
    const lastItem = await queryOne(`
      SELECT MAX(sort_order) as max_order
      FROM quote_line_items
      WHERE quote_id = $1
    `, [quoteId])

    const sortOrder = (lastItem?.max_order || 0) + 1

    // Create line item
    const item = await queryOne(`
      INSERT INTO quote_line_items (
        quote_id,
        item_type,
        name,
        description,
        quantity,
        unit,
        unit_price,
        discount_percent,
        line_total,
        estimated_hours,
        hourly_rate,
        media_platform,
        media_budget,
        agency_fee_percent,
        category,
        sort_order,
        is_optional,
        is_included
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
      RETURNING *
    `, [
      quoteId,
      body.itemType || 'service',
      body.name,
      body.description || null,
      quantity,
      body.unit || 'unit',
      unitPrice,
      discountPercent,
      lineTotal,
      body.estimatedHours || null,
      body.hourlyRate || null,
      body.mediaPlatform || null,
      body.mediaBudget || null,
      body.agencyFeePercent || null,
      body.category || null,
      body.sortOrder ?? sortOrder,
      body.isOptional ?? false,
      body.isIncluded ?? true
    ])

    return {
      lineItem: {
        id: item.id,
        quoteId: item.quote_id,
        itemType: item.item_type,
        name: item.name,
        description: item.description,
        quantity: Number(item.quantity),
        unit: item.unit,
        unitPrice: Number(item.unit_price),
        discountPercent: Number(item.discount_percent),
        lineTotal: Number(item.line_total),
        estimatedHours: item.estimated_hours ? Number(item.estimated_hours) : null,
        hourlyRate: item.hourly_rate ? Number(item.hourly_rate) : null,
        mediaPlatform: item.media_platform,
        mediaBudget: item.media_budget ? Number(item.media_budget) : null,
        agencyFeePercent: item.agency_fee_percent ? Number(item.agency_fee_percent) : null,
        category: item.category,
        sortOrder: item.sort_order,
        isOptional: item.is_optional,
        isIncluded: item.is_included,
        createdAt: item.created_at,
        updatedAt: item.updated_at,
      }
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to add line item:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to add line item'
    })
  }
})
