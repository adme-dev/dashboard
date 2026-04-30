import { createError, readBody } from 'h3'
import { xeroFetch } from '../../../../utils/xeroClient'
import { getActiveTokenForSession } from '../../../../utils/tokenStore'
import { getSelectedTenant } from '../../../../utils/session'
import { dedupedXeroCall } from '../../../../utils/xeroRateLimit'
import { sendInvoiceReminderEmail } from '../../../../utils/email'
import { execute, queryOne } from '../../../../utils/db'

/**
 * POST /api/xero/invoices/{id}/send-reminder
 *
 * Sends a dunning email to the invoice's contact and logs it in
 * `invoice_reminders` so we can show "Last reminded N days ago" and
 * prevent accidental double-sends. Optional body:
 *
 *   { force?: boolean }   // bypass the 3-day dedup guard
 *
 * Pulls the invoice, contact email, and OnlineInvoiceUrl directly from
 * Xero so the link in the email is always live.
 */
export default eventHandler(async (event) => {
  const user = (event.context as any).user
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Authentication required' })
  }

  const invoiceId = getRouterParam(event, 'id')
  if (!invoiceId) {
    throw createError({ statusCode: 400, statusMessage: 'Invoice ID is required' })
  }

  const body = await readBody<{ force?: boolean }>(event).catch(() => ({}))
  const force = !!body?.force

  // Dedup guard: don't re-send within 3 days unless force=true.
  if (!force) {
    const recent = await queryOne<{ sent_at: string }>(
      `SELECT sent_at FROM invoice_reminders
       WHERE invoice_id = $1
         AND sent_at > NOW() - INTERVAL '3 days'
         AND status = 'sent'
       ORDER BY sent_at DESC LIMIT 1`,
      [invoiceId]
    )
    if (recent) {
      throw createError({
        statusCode: 409,
        statusMessage: 'A reminder was sent recently. Pass force=true to send again.',
        data: { lastSentAt: recent.sent_at },
      })
    }
  }

  const token = await getActiveTokenForSession(event)
  const tenantId = await getSelectedTenant(event)
  if (!tenantId) {
    throw createError({ statusCode: 400, statusMessage: 'No organization selected' })
  }

  // Pull invoice + online URL in parallel — both are cheap fetches.
  const [invoiceBody, onlineBody] = await Promise.all([
    dedupedXeroCall(
      `invoice-detail-for-reminder:${tenantId}:${invoiceId}`,
      'invoice-detail-for-reminder',
      () => xeroFetch<any>({
        accessToken: token.access_token!,
        tenantId,
        path: `Invoices/${invoiceId}`,
      })
    ),
    dedupedXeroCall(
      `invoice-online-url-for-reminder:${tenantId}:${invoiceId}`,
      'invoice-online-url-for-reminder',
      () => xeroFetch<any>({
        accessToken: token.access_token!,
        tenantId,
        path: `Invoices/${invoiceId}/OnlineInvoice`,
      })
    ).catch(() => null), // online URL is optional — draft / voided invoices won't have one
  ])

  const inv = invoiceBody?.invoices?.[0]
  if (!inv) {
    throw createError({ statusCode: 404, statusMessage: 'Invoice not found in Xero' })
  }

  const amountDue = Number(inv.amountDue) || 0
  if (amountDue <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Invoice has no balance to chase.' })
  }

  const contactEmail = inv.contact?.emailAddress as string | undefined
  if (!contactEmail) {
    throw createError({
      statusCode: 422,
      statusMessage: 'Contact has no email on file in Xero — add one before sending a reminder.',
    })
  }

  const dueDateRaw = (inv.dueDate || inv.date) as string | undefined
  const dueDate = dueDateRaw ? dueDateRaw.slice(0, 10) : 'soon'

  const today = new Date()
  let daysOverdue = 0
  if (dueDateRaw) {
    const due = new Date(dueDateRaw.slice(0, 10))
    const diffDays = Math.floor((today.getTime() - due.getTime()) / 86400000)
    daysOverdue = Math.max(0, diffDays)
  }

  const payUrl = onlineBody?.onlineInvoices?.[0]?.onlineInvoiceUrl ?? null

  const result = await sendInvoiceReminderEmail({
    to: contactEmail,
    contactName: inv.contact?.name || 'there',
    invoiceNumber: inv.invoiceNumber || invoiceId,
    amountDue,
    currency: inv.currencyCode || 'AUD',
    dueDate,
    daysOverdue,
    payUrl,
    event,
  })

  // Log every attempt (success and failure) so the user has a paper trail.
  await execute(
    `INSERT INTO invoice_reminders
       (invoice_id, invoice_number, contact_name, contact_email, amount_due, currency,
        template_kind, sent_by, status, error_message)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      invoiceId,
      inv.invoiceNumber || null,
      inv.contact?.name || null,
      contactEmail,
      amountDue,
      inv.currencyCode || 'AUD',
      daysOverdue === 0 ? 'gentle' : daysOverdue <= 7 ? 'firm-7' : daysOverdue <= 30 ? 'firm-30' : 'final',
      user.id,
      result.ok ? 'sent' : 'failed',
      result.ok ? null : (result.error || 'Unknown error'),
    ]
  )

  if (!result.ok) {
    throw createError({
      statusCode: 502,
      statusMessage: `Email send failed: ${result.error || 'Unknown error'}`,
    })
  }

  return {
    ok: true,
    sentTo: contactEmail,
    daysOverdue,
    payUrl,
  }
})
