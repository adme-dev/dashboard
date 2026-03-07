/**
 * Get a single quote with all details
 * Requires pricing view permission
 */

import { queryOne, queryRows } from '~~/server/utils/db'
import { requirePricingAccess } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  // Check pricing access
  await requirePricingAccess(event, 'quote', 'view')

  const quoteId = getRouterParam(event, 'id')

  if (!quoteId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Quote ID is required'
    })
  }

  try {
    // Get quote with related data
    const quote = await queryOne(`
      SELECT
        q.*,
        c.name as client_name,
        c.email as client_email,
        c.company as client_company,
        b.title as brief_title,
        b.reference_number as brief_reference,
        p.name as project_name,
        creator.name as creator_name,
        creator.email as creator_email,
        assignee.name as assignee_name,
        assignee.email as assignee_email,
        approver.name as approver_name,
        parent.quote_number as parent_quote_number
      FROM quotes q
      LEFT JOIN agency_clients c ON q.client_id = c.id
      LEFT JOIN briefs b ON q.brief_id = b.id
      LEFT JOIN projects p ON q.project_id = p.id
      LEFT JOIN team_members creator ON q.created_by = creator.id
      LEFT JOIN team_members assignee ON q.assigned_to = assignee.id
      LEFT JOIN team_members approver ON q.approved_by = approver.id
      LEFT JOIN quotes parent ON q.parent_quote_id = parent.id
      WHERE q.id = $1
    `, [quoteId])

    if (!quote) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Quote not found'
      })
    }

    // Get line items
    const lineItems = await queryRows(`
      SELECT *
      FROM quote_line_items
      WHERE quote_id = $1
      ORDER BY sort_order, created_at
    `, [quoteId])

    // Get tasks linked to line items
    const lineItemIds = lineItems.map((li: any) => li.id)
    let linkedTasksMap = new Map<string, any[]>()
    if (lineItemIds.length > 0) {
      try {
        const linkedTasks = await queryRows(`
          SELECT t.id, t.title, t.quote_line_item_id,
                 ts.name AS status_name, ts.color AS status_color,
                 t.actual_hours, t.estimated_hours
          FROM tasks t
          JOIN task_statuses ts ON t.status_id = ts.id
          WHERE t.quote_line_item_id = ANY($1::uuid[])
          ORDER BY t.created_at
        `, [lineItemIds])
        for (const lt of linkedTasks) {
          const key = lt.quote_line_item_id
          if (!linkedTasksMap.has(key)) linkedTasksMap.set(key, [])
          linkedTasksMap.get(key)!.push({
            id: lt.id,
            title: lt.title,
            statusName: lt.status_name,
            statusColor: lt.status_color,
            actualHours: lt.actual_hours ? Number(lt.actual_hours) : null,
            estimatedHours: lt.estimated_hours ? Number(lt.estimated_hours) : null,
          })
        }
      } catch { /* graceful degradation */ }
    }

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
        terms: quote.terms,
        paymentTerms: quote.payment_terms,
        notes: quote.notes,
        clientNotes: quote.client_notes,
        version: quote.version,
        parentQuoteId: quote.parent_quote_id,
        createdBy: quote.created_by,
        assignedTo: quote.assigned_to,
        approvedBy: quote.approved_by,
        approvedAt: quote.approved_at,
        createdAt: quote.created_at,
        updatedAt: quote.updated_at,
        // Related data
        client: quote.client_id ? {
          id: quote.client_id,
          name: quote.client_name,
          email: quote.client_email,
          company: quote.client_company,
        } : null,
        brief: quote.brief_id ? {
          id: quote.brief_id,
          title: quote.brief_title,
          referenceNumber: quote.brief_reference,
        } : null,
        project: quote.project_id ? {
          id: quote.project_id,
          name: quote.project_name,
        } : null,
        creator: quote.created_by ? {
          id: quote.created_by,
          name: quote.creator_name,
          email: quote.creator_email,
        } : null,
        assignee: quote.assigned_to ? {
          id: quote.assigned_to,
          name: quote.assignee_name,
          email: quote.assignee_email,
        } : null,
        approver: quote.approved_by ? {
          id: quote.approved_by,
          name: quote.approver_name,
        } : null,
        parentQuote: quote.parent_quote_id ? {
          id: quote.parent_quote_id,
          quoteNumber: quote.parent_quote_number,
        } : null,
        xero: quote.xero_quote_id ? {
          quoteId: quote.xero_quote_id,
          quoteNumber: quote.xero_quote_number,
          status: quote.xero_status,
          syncedAt: quote.xero_synced_at,
          invoiceId: quote.xero_invoice_id,
        } : null,
        lineItems: lineItems.map(item => ({
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
          linkedTasks: linkedTasksMap.get(item.id) || [],
        })),
      }
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to fetch quote:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch quote'
    })
  }
})
