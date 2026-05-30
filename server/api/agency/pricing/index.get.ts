/**
 * List job pricing records with filtering
 * Requires job pricing view permission (sales role, sales department, or admin)
 */

import { queryRows, queryOne } from '~~/server/utils/db'
import { requirePricingAccess } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  // Check pricing access
  await requirePricingAccess(event, 'job_pricing', 'view')

  const query = getQuery(event)

  // Build dynamic query with filters
  const conditions: string[] = []
  const params: any[] = []
  let idx = 1

  if (query.clientId) {
    conditions.push(`jp.client_id = $${idx}`)
    params.push(query.clientId)
    idx++
  }

  if (query.briefId) {
    conditions.push(`jp.brief_id = $${idx}`)
    params.push(query.briefId)
    idx++
  }

  if (query.projectId) {
    conditions.push(`jp.project_id = $${idx}`)
    params.push(query.projectId)
    idx++
  }

  if (query.quoteId) {
    conditions.push(`jp.quote_id = $${idx}`)
    params.push(query.quoteId)
    idx++
  }

  if (query.isActive !== undefined) {
    conditions.push(`jp.is_active = $${idx}`)
    params.push(query.isActive === 'true')
    idx++
  }

  if (query.pricingType) {
    conditions.push(`jp.pricing_type = $${idx}`)
    params.push(query.pricingType)
    idx++
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

  // Pagination
  const limit = Math.min(Number(query.limit) || 50, 100)
  const offset = Number(query.offset) || 0

  try {
    // Get total count
    const countResult = await queryOne(`
      SELECT COUNT(*) as total
      FROM job_pricing jp
      ${whereClause}
    `, params)

    // Get job pricing with related data
    const pricing = await queryRows(`
      SELECT
        jp.*,
        c.name as client_name,
        c.contact_email as client_email,
        b.title as brief_title,
        b.reference_number as brief_reference,
        p.name as project_name,
        q.quote_number,
        q.title as quote_title,
        approver.name as approver_name
      FROM job_pricing jp
      LEFT JOIN agency_clients c ON jp.client_id = c.id
      LEFT JOIN briefs b ON jp.brief_id = b.id
      LEFT JOIN projects p ON jp.project_id = p.id
      LEFT JOIN quotes q ON jp.quote_id = q.id
      LEFT JOIN team_members approver ON jp.approved_by = approver.id
      ${whereClause}
      ORDER BY jp.created_at DESC
      LIMIT $${idx} OFFSET $${idx + 1}
    `, [...params, limit, offset])

    return {
      pricing: pricing.map(jp => ({
        id: jp.id,
        briefId: jp.brief_id,
        quoteId: jp.quote_id,
        projectId: jp.project_id,
        clientId: jp.client_id,
        pricingType: jp.pricing_type,
        agreedTotal: Number(jp.agreed_total),
        currency: jp.currency,
        hourlyRate: jp.hourly_rate ? Number(jp.hourly_rate) : null,
        monthlyRetainer: jp.monthly_retainer ? Number(jp.monthly_retainer) : null,
        hoursIncluded: jp.hours_included,
        overageRate: jp.overage_rate ? Number(jp.overage_rate) : null,
        invoicedAmount: Number(jp.invoiced_amount),
        paidAmount: Number(jp.paid_amount),
        remainingAmount: Number(jp.remaining_amount),
        isActive: jp.is_active,
        approvedAt: jp.approved_at,
        approvedBy: jp.approved_by,
        notes: jp.notes,
        createdAt: jp.created_at,
        updatedAt: jp.updated_at,
        // Related data
        client: jp.client_id ? {
          id: jp.client_id,
          name: jp.client_name,
          email: jp.client_email,
        } : null,
        brief: jp.brief_id ? {
          id: jp.brief_id,
          title: jp.brief_title,
          referenceNumber: jp.brief_reference,
        } : null,
        project: jp.project_id ? {
          id: jp.project_id,
          name: jp.project_name,
        } : null,
        quote: jp.quote_id ? {
          id: jp.quote_id,
          quoteNumber: jp.quote_number,
          title: jp.quote_title,
        } : null,
        approver: jp.approved_by ? {
          id: jp.approved_by,
          name: jp.approver_name,
        } : null,
      })),
      pagination: {
        total: Number(countResult?.total) || 0,
        limit,
        offset,
        hasMore: offset + pricing.length < Number(countResult?.total),
      }
    }
  } catch (error) {
    console.error('Failed to fetch job pricing:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch job pricing'
    })
  }
})
