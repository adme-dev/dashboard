/**
 * Get a single job pricing record
 * Requires job pricing view permission
 */

import { queryOne } from '~~/server/utils/db'
import { requirePricingAccess } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  // Check pricing access
  await requirePricingAccess(event, 'job_pricing', 'view')

  const pricingId = getRouterParam(event, 'id')

  if (!pricingId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Pricing ID is required'
    })
  }

  try {
    const pricing = await queryOne(`
      SELECT
        jp.*,
        c.name as client_name,
        c.email as client_email,
        c.company as client_company,
        b.title as brief_title,
        b.reference_number as brief_reference,
        b.status as brief_status,
        p.name as project_name,
        q.quote_number,
        q.title as quote_title,
        q.total as quote_total,
        approver.name as approver_name,
        approver.email as approver_email
      FROM job_pricing jp
      LEFT JOIN agency_clients c ON jp.client_id = c.id
      LEFT JOIN briefs b ON jp.brief_id = b.id
      LEFT JOIN projects p ON jp.project_id = p.id
      LEFT JOIN quotes q ON jp.quote_id = q.id
      LEFT JOIN team_members approver ON jp.approved_by = approver.id
      WHERE jp.id = $1
    `, [pricingId])

    if (!pricing) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Job pricing not found'
      })
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
        invoicedAmount: Number(pricing.invoiced_amount),
        paidAmount: Number(pricing.paid_amount),
        remainingAmount: Number(pricing.remaining_amount),
        isActive: pricing.is_active,
        approvedAt: pricing.approved_at,
        approvedBy: pricing.approved_by,
        notes: pricing.notes,
        createdAt: pricing.created_at,
        updatedAt: pricing.updated_at,
        // Related data
        client: pricing.client_id ? {
          id: pricing.client_id,
          name: pricing.client_name,
          email: pricing.client_email,
          company: pricing.client_company,
        } : null,
        brief: pricing.brief_id ? {
          id: pricing.brief_id,
          title: pricing.brief_title,
          referenceNumber: pricing.brief_reference,
          status: pricing.brief_status,
        } : null,
        project: pricing.project_id ? {
          id: pricing.project_id,
          name: pricing.project_name,
        } : null,
        quote: pricing.quote_id ? {
          id: pricing.quote_id,
          quoteNumber: pricing.quote_number,
          title: pricing.quote_title,
          total: pricing.quote_total ? Number(pricing.quote_total) : null,
        } : null,
        approver: pricing.approved_by ? {
          id: pricing.approved_by,
          name: pricing.approver_name,
          email: pricing.approver_email,
        } : null,
      }
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to fetch job pricing:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch job pricing'
    })
  }
})
