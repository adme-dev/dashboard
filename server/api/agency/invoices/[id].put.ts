/**
 * Update invoice
 * PUT /api/agency/invoices/:id
 */

import { transaction } from '~~/server/utils/db'
import { requireInvoiceAccess } from '~~/server/utils/clientScoping'
import { assertInvoiceRowAccess, lockInvoiceForEdit, assertInvoiceDraftChanges, assertInvoiceReferences } from '~~/server/utils/invoiceRowAccess'

export default defineEventHandler(async (event) => {
  const access = await requireInvoiceAccess(event, true)
  const id = getRouterParam(event, 'id')
  const body = await readBody(event)

  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invoice ID is required'
    })
  }

  try {
    await assertInvoiceRowAccess(id, access, true)
    assertInvoiceDraftChanges(access, body)
    return await transaction(async (client) => {
      const queryOne = async (sql: string, params?: any[]) => (await client.query(sql, params)).rows[0]
      const queryRows = async (sql: string, params?: any[]) => (await client.query(sql, params)).rows
      const queryCount = async (sql: string, params?: any[]) => client.query(sql, params)
      const existing = await lockInvoiceForEdit(client, id, access)

      const {
        clientId,
        projectId,
        issueDate,
        dueDate,
        taxRate,
        discountAmount,
        discountPercent,
        paymentTerms,
        notes,
        terms,
        footer,
        status,
        lineItems
      } = body

      if (access.clientIds !== 'all') {
        const targetClient = clientId ?? existing.client_id
        // Recheck target assignment in the same transaction, including a client move.
        const assigned = await queryOne(`SELECT cta.client_id FROM client_team_assignments cta
          JOIN agency_clients c ON c.id = cta.client_id
          WHERE cta.team_member_id = $1 AND cta.client_id = $2 AND c.is_active = TRUE`, [access.user.id, targetClient])
        if (!assigned) throw createError({ statusCode: 403, statusMessage: 'Client access denied' })
        await assertInvoiceReferences(client, targetClient, { projectId: projectId !== undefined ? projectId : existing.project_id })
        const references = lineItems !== undefined ? lineItems : await queryRows('SELECT project_id, time_entry_id FROM invoice_line_items WHERE invoice_id = $1', [id])
        for (const item of references) {
          await assertInvoiceReferences(client, targetClient, {
            projectId: item.projectId || item.project_id,
            timeEntryId: item.timeEntryId || item.time_entry_id
          })
        }
      }

      // Update invoice
      const updated = await queryOne(`
        UPDATE invoices SET
          client_id = COALESCE($2, client_id),
          project_id = $3,
          issue_date = COALESCE($4, issue_date),
          due_date = COALESCE($5, due_date),
          tax_rate = COALESCE($6, tax_rate),
          discount_amount = COALESCE($7, discount_amount),
          discount_percent = COALESCE($8, discount_percent),
          payment_terms = COALESCE($9, payment_terms),
          notes = $10,
          terms = $11,
          footer = $12,
          status = COALESCE($13, status),
          updated_at = NOW()
        WHERE id = $1 AND ($14::boolean OR (status = 'draft' AND created_by = $15))
        RETURNING *
      `, [
        id,
        clientId,
        projectId !== undefined ? projectId : existing.project_id,
        issueDate,
        dueDate,
        taxRate,
        discountAmount,
        discountPercent,
        paymentTerms,
        notes !== undefined ? notes : existing.notes,
        terms !== undefined ? terms : existing.terms,
        footer !== undefined ? footer : existing.footer,
        status,
        access.clientIds === 'all',
        access.user.id
      ])
      if (!updated) throw createError({ statusCode: 403, statusMessage: 'Invoice unavailable for editing' })

      // Update line items if provided
      if (lineItems !== undefined) {
        // Delete existing line items
        await queryCount('DELETE FROM invoice_line_items WHERE invoice_id = $1', [id])

        // Insert new line items
        for (let i = 0; i < lineItems.length; i++) {
          const item = lineItems[i]
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
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          `, [
            id,
            item.description,
            item.quantity || 1,
            item.unitPrice || item.unit_price || 0,
            item.itemType || item.item_type || 'service',
            item.taxable !== false,
            item.timeEntryId || item.time_entry_id || null,
            item.projectId || item.project_id || null,
            i
          ])
        }
      }

      // Fetch updated invoice
      const fullInvoice = await queryOne(`
        SELECT
          i.*,
          c.name as client_name,
          p.name as project_name
        FROM invoices i
        JOIN agency_clients c ON i.client_id = c.id
        LEFT JOIN projects p ON i.project_id = p.id
        WHERE i.id = $1
      `, [id])

      const items = await queryRows(`
        SELECT * FROM invoice_line_items
        WHERE invoice_id = $1
        ORDER BY sort_order
      `, [id])

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
          discountAmount: Number(fullInvoice.discount_amount || 0),
          totalAmount: Number(fullInvoice.total_amount || 0),
          amountPaid: Number(fullInvoice.amount_paid || 0),
          amountDue: Number(fullInvoice.total_amount || 0) - Number(fullInvoice.amount_paid || 0),
          currency: fullInvoice.currency,
          status: fullInvoice.status,
          paymentTerms: fullInvoice.payment_terms,
          notes: fullInvoice.notes,
          terms: fullInvoice.terms,
          footer: fullInvoice.footer,
          updatedAt: fullInvoice.updated_at,
          lineItems: items.map(item => ({
            id: item.id,
            description: item.description,
            quantity: Number(item.quantity),
            unitPrice: Number(item.unit_price),
            amount: Number(item.quantity) * Number(item.unit_price),
            itemType: item.item_type,
            taxable: item.taxable
          }))
        }
      }
    })
  } catch (error: any) {
    console.error('Failed to update invoice:', error)
    if (error.statusCode) throw error
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to update invoice'
    })
  }
})
