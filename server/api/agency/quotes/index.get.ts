/**
 * List quotes with filtering and pagination
 * Requires pricing view permission (sales role, sales department, or admin)
 */

import { queryRows, queryOne } from '~~/server/utils/db'
import { requirePricingAccess } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  // Check pricing access
  const user = await requirePricingAccess(event, 'quote', 'view')

  const query = getQuery(event)

  // Build dynamic query with filters
  const conditions: string[] = []
  const params: any[] = []
  let idx = 1

  if (query.status) {
    conditions.push(`q.status = $${idx}`)
    params.push(query.status)
    idx++
  }

  if (query.clientId) {
    conditions.push(`q.client_id = $${idx}`)
    params.push(query.clientId)
    idx++
  }

  if (query.briefId) {
    conditions.push(`q.brief_id = $${idx}`)
    params.push(query.briefId)
    idx++
  }

  if (query.createdBy) {
    conditions.push(`q.created_by = $${idx}`)
    params.push(query.createdBy)
    idx++
  }

  if (query.assignedTo) {
    conditions.push(`q.assigned_to = $${idx}`)
    params.push(query.assignedTo)
    idx++
  }

  if (query.search) {
    conditions.push(`(q.title ILIKE $${idx} OR q.quote_number ILIKE $${idx})`)
    params.push(`%${query.search}%`)
    idx++
  }

  if (query.validOnly === 'true') {
    conditions.push(`q.valid_until >= CURRENT_DATE`)
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

  // Pagination
  const limit = Math.min(Number(query.limit) || 50, 100)
  const offset = Number(query.offset) || 0

  try {
    // Get total count
    const countResult = await queryOne(`
      SELECT COUNT(*) as total
      FROM quotes q
      ${whereClause}
    `, params)

    // Get quotes with related data
    const quotes = await queryRows(`
      SELECT
        q.*,
        c.name as client_name,
        c.email as client_email,
        b.title as brief_title,
        b.reference_number as brief_reference,
        creator.name as creator_name,
        assignee.name as assignee_name,
        approver.name as approver_name,
        COALESCE(items.item_count, 0) as line_item_count
      FROM quotes q
      LEFT JOIN agency_clients c ON q.client_id = c.id
      LEFT JOIN briefs b ON q.brief_id = b.id
      LEFT JOIN team_members creator ON q.created_by = creator.id
      LEFT JOIN team_members assignee ON q.assigned_to = assignee.id
      LEFT JOIN team_members approver ON q.approved_by = approver.id
      LEFT JOIN (
        SELECT quote_id, COUNT(*) as item_count
        FROM quote_line_items
        GROUP BY quote_id
      ) items ON q.id = items.quote_id
      ${whereClause}
      ORDER BY q.created_at DESC
      LIMIT $${idx} OFFSET $${idx + 1}
    `, [...params, limit, offset])

    return {
      quotes: quotes.map(q => ({
        id: q.id,
        quoteNumber: q.quote_number,
        briefId: q.brief_id,
        clientId: q.client_id,
        projectId: q.project_id,
        title: q.title,
        description: q.description,
        validFrom: q.valid_from,
        validUntil: q.valid_until,
        status: q.status,
        sentAt: q.sent_at,
        viewedAt: q.viewed_at,
        acceptedAt: q.accepted_at,
        rejectedAt: q.rejected_at,
        rejectionReason: q.rejection_reason,
        subtotal: Number(q.subtotal),
        discountPercent: Number(q.discount_percent),
        discountAmount: Number(q.discount_amount),
        taxPercent: Number(q.tax_percent),
        taxAmount: Number(q.tax_amount),
        total: Number(q.total),
        currency: q.currency,
        paymentTerms: q.payment_terms,
        version: q.version,
        parentQuoteId: q.parent_quote_id,
        createdBy: q.created_by,
        assignedTo: q.assigned_to,
        approvedBy: q.approved_by,
        approvedAt: q.approved_at,
        createdAt: q.created_at,
        updatedAt: q.updated_at,
        // Related data
        client: q.client_id ? {
          id: q.client_id,
          name: q.client_name,
          email: q.client_email,
        } : null,
        brief: q.brief_id ? {
          id: q.brief_id,
          title: q.brief_title,
          referenceNumber: q.brief_reference,
        } : null,
        creator: q.created_by ? {
          id: q.created_by,
          name: q.creator_name,
        } : null,
        assignee: q.assigned_to ? {
          id: q.assigned_to,
          name: q.assignee_name,
        } : null,
        approver: q.approved_by ? {
          id: q.approved_by,
          name: q.approver_name,
        } : null,
        lineItemCount: Number(q.line_item_count),
        xeroQuoteId: q.xero_quote_id || null,
        xeroQuoteNumber: q.xero_quote_number || null,
        xeroStatus: q.xero_status || null,
        xeroInvoiceId: q.xero_invoice_id || null,
      })),
      pagination: {
        total: Number(countResult?.total) || 0,
        limit,
        offset,
        hasMore: offset + quotes.length < Number(countResult?.total),
      }
    }
  } catch (error) {
    console.error('Failed to fetch quotes:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch quotes'
    })
  }
})
