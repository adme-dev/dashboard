/** Delete an own draft for scoped staff; Finance may also cancel unpaid invoices. */
import { transaction } from '~~/server/utils/db'
import { requireInvoiceAccess } from '~~/server/utils/clientScoping'
import { assertInvoiceRowAccess, lockInvoiceForEdit } from '~~/server/utils/invoiceRowAccess'

export default defineEventHandler(async (event) => {
  const access = await requireInvoiceAccess(event, true)
  const invoiceId = getRouterParam(event, 'id')
  if (!invoiceId) throw createError({ statusCode: 400, statusMessage: 'Invoice ID is required' })
  const hardDelete = getQuery(event).hard === 'true'

  try {
    await assertInvoiceRowAccess(invoiceId, access, true)
    return await transaction(async (client) => {
      // The lock and own-draft/assignment recheck precede child deletions and cancellation.
      const invoice = await lockInvoiceForEdit(client, invoiceId, access)
      if (Number(invoice.amount_paid) > 0) {
        throw createError({ statusCode: 400, statusMessage: 'Cannot delete an invoice that has payments recorded. Void or credit it instead.' })
      }
      const scopeParams = [invoiceId, access.clientIds === 'all', access.user.id]
      if (hardDelete) {
        if (invoice.status !== 'draft') {
          throw createError({ statusCode: 400, statusMessage: 'Only draft invoices can be permanently deleted. Cancel the invoice instead.' })
        }
        await client.query('DELETE FROM invoice_line_items WHERE invoice_id = $1', [invoiceId])
        await client.query('DELETE FROM invoice_payments WHERE invoice_id = $1', [invoiceId])
        const deleted = await client.query(`DELETE FROM invoices WHERE id = $1 AND status = 'draft'
          AND ($2::boolean OR created_by = $3) RETURNING id`, scopeParams)
        if (!deleted.rows[0]) throw createError({ statusCode: 403, statusMessage: 'Invoice unavailable for deletion' })
        return { success: true, message: 'Invoice permanently deleted', deleted: true }
      }
      const cancelled = await client.query(`UPDATE invoices SET status = 'cancelled', updated_at = NOW()
        WHERE id = $1 AND ($2::boolean OR (status = 'draft' AND created_by = $3)) RETURNING id`, scopeParams)
      if (!cancelled.rows[0]) throw createError({ statusCode: 403, statusMessage: 'Invoice unavailable for cancellation' })
      return { success: true, message: 'Invoice cancelled successfully', cancelled: true }
    })
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to delete invoice:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to delete invoice' })
  }
})
