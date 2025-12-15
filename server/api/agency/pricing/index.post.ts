/**
 * Create job pricing manually
 */

import { queryOne, queryRows } from '~~/server/utils/db'
import { requirePricingAccess } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  // Check pricing access
  await requirePricingAccess(event, 'job_pricing', 'create')

  const body = await readBody(event)

  // Validate required fields
  if (!body.agreedTotal && body.agreedTotal !== 0) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Agreed total is required'
    })
  }

  // At least one of client, project, or brief should be provided
  if (!body.clientId && !body.projectId && !body.briefId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'At least one of clientId, projectId, or briefId is required'
    })
  }

  // Create job pricing record
  const pricing = await queryOne(`
    INSERT INTO job_pricing (
      brief_id,
      quote_id,
      project_id,
      client_id,
      pricing_type,
      agreed_total,
      currency,
      hourly_rate,
      monthly_retainer,
      hours_included,
      overage_rate,
      notes,
      is_active,
      approved_by,
      approved_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW()
    )
    RETURNING *
  `, [
    body.briefId || body.brief_id || null,
    body.quoteId || body.quote_id || null,
    body.projectId || body.project_id || null,
    body.clientId || body.client_id || null,
    body.pricingType || body.pricing_type || 'fixed',
    body.agreedTotal || body.agreed_total,
    body.currency || 'USD',
    body.hourlyRate || body.hourly_rate || null,
    body.monthlyRetainer || body.monthly_retainer || null,
    body.hoursIncluded || body.hours_included || null,
    body.overageRate || body.overage_rate || null,
    body.notes || null,
    body.isActive !== undefined ? body.isActive : true,
    body.approvedBy || body.approved_by || null
  ])

  // Fetch related data
  let client = null
  let project = null

  if (pricing.client_id) {
    client = await queryOne(
      'SELECT id, name FROM agency_clients WHERE id = $1',
      [pricing.client_id]
    )
  }

  if (pricing.project_id) {
    project = await queryOne(
      'SELECT id, name FROM projects WHERE id = $1',
      [pricing.project_id]
    )
  }

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
      invoicedAmount: Number(pricing.invoiced_amount || 0),
      paidAmount: Number(pricing.paid_amount || 0),
      remainingAmount: Number(pricing.remaining_amount || 0),
      isActive: pricing.is_active,
      approvedAt: pricing.approved_at,
      approvedBy: pricing.approved_by,
      notes: pricing.notes,
      createdAt: pricing.created_at,
      updatedAt: pricing.updated_at,
      client,
      project
    }
  }
})
