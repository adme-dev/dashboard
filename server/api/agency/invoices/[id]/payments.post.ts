/**
 * Record payment for invoice
 * POST /api/agency/invoices/:id/payments
 */

import { queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const id = getRouterParam(event, 'id')
  const body = await readBody(event)

  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invoice ID is required'
    })
  }

  const {
    amount,
    paymentDate,
    paymentMethod,
    referenceNumber,
    transactionId,
    notes
  } = body

  if (!amount || amount <= 0) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Valid payment amount is required'
    })
  }

  try {
    // Get invoice
    const invoice = await queryOne('SELECT * FROM invoices WHERE id = $1', [id])

    if (!invoice) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Invoice not found'
      })
    }

    if (invoice.status === 'cancelled') {
      throw createError({
        statusCode: 400,
        statusMessage: 'Cannot add payment to cancelled invoice'
      })
    }

    if (invoice.status === 'paid') {
      throw createError({
        statusCode: 400,
        statusMessage: 'Invoice is already fully paid'
      })
    }

    // Check if payment exceeds amount due
    const amountDue = Number(invoice.total_amount) - Number(invoice.amount_paid || 0)
    if (amount > amountDue) {
      throw createError({
        statusCode: 400,
        statusMessage: `Payment amount exceeds amount due ($${amountDue.toFixed(2)})`
      })
    }

    // Create payment
    const payment = await queryOne(`
      INSERT INTO invoice_payments (
        invoice_id,
        amount,
        payment_date,
        payment_method,
        reference_number,
        transaction_id,
        notes,
        recorded_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `, [
      id,
      amount,
      paymentDate || new Date().toISOString().split('T')[0],
      paymentMethod || null,
      referenceNumber || null,
      transactionId || null,
      notes || null,
      user.id
    ])

    // Get updated invoice
    const updatedInvoice = await queryOne(`
      SELECT
        i.*,
        c.name as client_name
      FROM invoices i
      JOIN agency_clients c ON i.client_id = c.id
      WHERE i.id = $1
    `, [id])

    return {
      payment: {
        id: payment.id,
        amount: Number(payment.amount),
        paymentDate: payment.payment_date,
        paymentMethod: payment.payment_method,
        referenceNumber: payment.reference_number,
        createdAt: payment.created_at
      },
      invoice: {
        id: updatedInvoice.id,
        invoiceNumber: updatedInvoice.invoice_number,
        totalAmount: Number(updatedInvoice.total_amount),
        amountPaid: Number(updatedInvoice.amount_paid),
        amountDue: Number(updatedInvoice.total_amount) - Number(updatedInvoice.amount_paid),
        status: updatedInvoice.status,
        paidDate: updatedInvoice.paid_date
      }
    }
  } catch (error: any) {
    console.error('Failed to record payment:', error)
    if (error.statusCode) throw error
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to record payment'
    })
  }
})
