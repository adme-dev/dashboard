/**
 * Update a quote line item
 */

import { queryOne } from '~~/server/utils/db'
import { requirePricingAccess } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  // Check pricing access
  await requirePricingAccess(event, 'quote', 'edit')

  const quoteId = getRouterParam(event, 'id')
  const itemId = getRouterParam(event, 'itemId')
  const body = await readBody(event)

  if (!quoteId || !itemId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Quote ID and Item ID are required'
    })
  }

  // Get the quote to check status
  const quote = await queryOne(
    'SELECT id, status FROM quotes WHERE id = $1',
    [quoteId]
  )

  if (!quote) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Quote not found'
    })
  }

  // Check if quote can be modified
  if (['accepted', 'rejected'].includes(quote.status)) {
    throw createError({
      statusCode: 400,
      statusMessage: `Cannot modify a ${quote.status} quote`
    })
  }

  // Get the line item
  const existingItem = await queryOne(
    'SELECT * FROM quote_line_items WHERE id = $1 AND quote_id = $2',
    [itemId, quoteId]
  )

  if (!existingItem) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Line item not found'
    })
  }

  // Calculate line total
  const quantity = body.quantity !== undefined ? body.quantity : existingItem.quantity
  const unitPrice = body.unitPrice !== undefined ? body.unitPrice : existingItem.unit_price
  const discountPercent = body.discountPercent !== undefined ? body.discountPercent : existingItem.discount_percent
  const lineTotal = quantity * unitPrice * (1 - (discountPercent || 0) / 100)

  // Update line item
  const updated = await queryOne(`
    UPDATE quote_line_items
    SET
      item_type = COALESCE($1, item_type),
      name = COALESCE($2, name),
      description = COALESCE($3, description),
      quantity = COALESCE($4, quantity),
      unit = COALESCE($5, unit),
      unit_price = COALESCE($6, unit_price),
      discount_percent = COALESCE($7, discount_percent),
      line_total = $8,
      is_optional = COALESCE($9, is_optional),
      is_included = COALESCE($10, is_included),
      estimated_hours = COALESCE($11, estimated_hours),
      hourly_rate = COALESCE($12, hourly_rate),
      updated_at = NOW()
    WHERE id = $13 AND quote_id = $14
    RETURNING *
  `, [
    body.itemType || body.item_type || null,
    body.name || null,
    body.description,
    quantity,
    body.unit,
    unitPrice,
    discountPercent,
    lineTotal,
    body.isOptional !== undefined ? body.isOptional : null,
    body.isIncluded !== undefined ? body.isIncluded : null,
    body.estimatedHours || body.estimated_hours || null,
    body.hourlyRate || body.hourly_rate || null,
    itemId,
    quoteId
  ])

  // Update quote totals
  await queryOne(`
    UPDATE quotes
    SET
      subtotal = (
        SELECT COALESCE(SUM(line_total), 0)
        FROM quote_line_items
        WHERE quote_id = $1 AND is_included = true
      ),
      updated_at = NOW()
    WHERE id = $1
    RETURNING *
  `, [quoteId])

  // Recalculate total
  await queryOne(`
    UPDATE quotes
    SET
      total = subtotal - (subtotal * discount_percent / 100) + ((subtotal - (subtotal * discount_percent / 100)) * tax_percent / 100),
      discount_amount = subtotal * discount_percent / 100,
      tax_amount = (subtotal - (subtotal * discount_percent / 100)) * tax_percent / 100
    WHERE id = $1
  `, [quoteId])

  return {
    lineItem: {
      id: updated.id,
      quoteId: updated.quote_id,
      itemType: updated.item_type,
      name: updated.name,
      description: updated.description,
      quantity: Number(updated.quantity),
      unit: updated.unit,
      unitPrice: Number(updated.unit_price),
      discountPercent: Number(updated.discount_percent),
      lineTotal: Number(updated.line_total),
      isOptional: updated.is_optional,
      isIncluded: updated.is_included,
      estimatedHours: updated.estimated_hours ? Number(updated.estimated_hours) : null,
      hourlyRate: updated.hourly_rate ? Number(updated.hourly_rate) : null,
      updatedAt: updated.updated_at
    }
  }
})
