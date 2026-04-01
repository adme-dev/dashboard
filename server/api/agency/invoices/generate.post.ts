/**
 * Generate invoice from time entries
 * POST /api/agency/invoices/generate
 */

import { queryOne, queryRows } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'
import { requireInvoiceAccess } from '~~/server/utils/clientScoping'

export default defineEventHandler(async (event) => {
  const { user, clientIds } = await requireInvoiceAccess(event)
  const body = await readBody(event)

  const {
    clientId,
    projectId,
    startDate,
    endDate,
    includeUnbilled = true,
    taxRate = 0,
    paymentTerms = 'net_30',
    groupBy = 'entry', // 'entry', 'date', 'project', 'user'
    notes
  } = body

  if (!clientId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Client ID is required'
    })
  }

  if (clientIds !== 'all') {
    if (!clientIds.includes(clientId)) {
      throw createError({ statusCode: 403, statusMessage: 'Not assigned to this client' })
    }
  }

  try {
    // Build query conditions
    const conditions: string[] = ['te.billable = true']
    const params: any[] = []
    let idx = 1

    // Filter by client (via project)
    conditions.push(`p.client_id = $${idx}`)
    params.push(clientId)
    idx++

    if (projectId) {
      conditions.push(`te.project_id = $${idx}`)
      params.push(projectId)
      idx++
    }

    if (startDate) {
      conditions.push(`te.date >= $${idx}`)
      params.push(startDate)
      idx++
    }

    if (endDate) {
      conditions.push(`te.date <= $${idx}`)
      params.push(endDate)
      idx++
    }

    if (includeUnbilled) {
      // Only include entries not already on an invoice
      conditions.push('NOT EXISTS (SELECT 1 FROM invoice_line_items ili WHERE ili.time_entry_id = te.id)')
    }

    const whereClause = conditions.join(' AND ')

    // Get time entries
    let timeEntries: any[] = []

    if (groupBy === 'entry') {
      // Individual entries
      timeEntries = await queryRows(`
        SELECT
          te.id,
          te.date,
          te.hours,
          te.hourly_rate,
          te.description,
          te.project_id,
          p.name as project_name,
          tm.name as user_name
        FROM time_entries te
        JOIN projects p ON te.project_id = p.id
        LEFT JOIN team_members tm ON te.user_id = tm.id
        WHERE ${whereClause}
        ORDER BY te.date, p.name
      `, params)
    } else if (groupBy === 'date') {
      // Group by date
      timeEntries = await queryRows(`
        SELECT
          te.date,
          SUM(te.hours) as hours,
          AVG(te.hourly_rate) as hourly_rate,
          STRING_AGG(DISTINCT p.name, ', ') as project_name,
          'Work on ' || TO_CHAR(te.date, 'Mon DD, YYYY') as description
        FROM time_entries te
        JOIN projects p ON te.project_id = p.id
        WHERE ${whereClause}
        GROUP BY te.date
        ORDER BY te.date
      `, params)
    } else if (groupBy === 'project') {
      // Group by project
      timeEntries = await queryRows(`
        SELECT
          te.project_id,
          p.name as project_name,
          SUM(te.hours) as hours,
          AVG(te.hourly_rate) as hourly_rate,
          'Project: ' || p.name as description,
          MIN(te.date) as start_date,
          MAX(te.date) as end_date
        FROM time_entries te
        JOIN projects p ON te.project_id = p.id
        WHERE ${whereClause}
        GROUP BY te.project_id, p.name
        ORDER BY p.name
      `, params)
    } else if (groupBy === 'user') {
      // Group by user
      timeEntries = await queryRows(`
        SELECT
          te.user_id,
          tm.name as user_name,
          SUM(te.hours) as hours,
          AVG(te.hourly_rate) as hourly_rate,
          'Work by ' || tm.name as description
        FROM time_entries te
        JOIN projects p ON te.project_id = p.id
        LEFT JOIN team_members tm ON te.user_id = tm.id
        WHERE ${whereClause}
        GROUP BY te.user_id, tm.name
        ORDER BY tm.name
      `, params)
    }

    if (timeEntries.length === 0) {
      throw createError({
        statusCode: 400,
        statusMessage: 'No billable time entries found for the specified criteria'
      })
    }

    // Get client info
    const client = await queryOne(`
      SELECT name, email, billing_address, phone
      FROM agency_clients
      WHERE id = $1
    `, [clientId])

    if (!client) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Client not found'
      })
    }

    // Calculate due date
    const issueDate = new Date()
    const daysToAdd = paymentTerms === 'net_15' ? 15 :
                      paymentTerms === 'net_30' ? 30 :
                      paymentTerms === 'net_45' ? 45 :
                      paymentTerms === 'net_60' ? 60 :
                      paymentTerms === 'due_on_receipt' ? 0 : 30
    const dueDate = new Date(issueDate)
    dueDate.setDate(dueDate.getDate() + daysToAdd)

    // Create invoice
    const invoice = await queryOne(`
      INSERT INTO invoices (
        client_id,
        project_id,
        issue_date,
        due_date,
        tax_rate,
        payment_terms,
        notes,
        billing_name,
        billing_email,
        billing_address,
        created_by,
        status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'draft')
      RETURNING *
    `, [
      clientId,
      projectId || null,
      issueDate.toISOString().split('T')[0],
      dueDate.toISOString().split('T')[0],
      taxRate,
      paymentTerms,
      notes || null,
      client.name,
      client.email,
      client.billing_address,
      user.id
    ])

    // Create line items from time entries
    for (let i = 0; i < timeEntries.length; i++) {
      const entry = timeEntries[i]
      const hours = Number(entry.hours)
      const rate = Number(entry.hourly_rate)

      let description = entry.description || ''
      if (groupBy === 'entry' && entry.date) {
        description = `${entry.project_name} - ${entry.description || 'Work'} (${new Date(entry.date).toLocaleDateString()})`
      } else if (groupBy === 'project' && entry.start_date && entry.end_date) {
        description = `${entry.project_name} (${new Date(entry.start_date).toLocaleDateString()} - ${new Date(entry.end_date).toLocaleDateString()})`
      }

      await queryOne(`
        INSERT INTO invoice_line_items (
          invoice_id,
          description,
          quantity,
          unit_price,
          item_type,
          taxable,
          time_entry_id,
          project_id,
          sort_order
        ) VALUES ($1, $2, $3, $4, 'service', true, $5, $6, $7)
      `, [
        invoice.id,
        description,
        hours,
        rate,
        groupBy === 'entry' ? entry.id : null,
        entry.project_id || projectId || null,
        i
      ])
    }

    // Fetch complete invoice
    const fullInvoice = await queryOne(`
      SELECT
        i.*,
        c.name as client_name,
        p.name as project_name
      FROM invoices i
      JOIN agency_clients c ON i.client_id = c.id
      LEFT JOIN projects p ON i.project_id = p.id
      WHERE i.id = $1
    `, [invoice.id])

    const lineItems = await queryRows(`
      SELECT * FROM invoice_line_items
      WHERE invoice_id = $1
      ORDER BY sort_order
    `, [invoice.id])

    return {
      invoice: {
        id: fullInvoice.id,
        invoiceNumber: fullInvoice.invoice_number,
        clientId: fullInvoice.client_id,
        clientName: fullInvoice.client_name,
        projectId: fullInvoice.project_id,
        projectName: fullInvoice.project_name,
        issueDate: fullInvoice.issue_date,
        dueDate: fullInvoice.due_date,
        subtotal: Number(fullInvoice.subtotal || 0),
        taxRate: Number(fullInvoice.tax_rate || 0),
        taxAmount: Number(fullInvoice.tax_amount || 0),
        totalAmount: Number(fullInvoice.total_amount || 0),
        currency: fullInvoice.currency,
        status: fullInvoice.status,
        paymentTerms: fullInvoice.payment_terms,
        createdAt: fullInvoice.created_at,
        lineItems: lineItems.map(item => ({
          id: item.id,
          description: item.description,
          quantity: Number(item.quantity),
          unitPrice: Number(item.unit_price),
          amount: Number(item.quantity) * Number(item.unit_price),
          itemType: item.item_type
        }))
      },
      entriesIncluded: timeEntries.length,
      totalHours: timeEntries.reduce((sum, e) => sum + Number(e.hours), 0)
    }
  } catch (error: any) {
    console.error('Failed to generate invoice:', error)
    if (error.statusCode) throw error
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to generate invoice'
    })
  }
})
