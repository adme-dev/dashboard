import { createError, readBody } from 'h3'
import { xeroFetch } from '../../../utils/xeroClient'
import { getActiveTokenForSession } from '../../../utils/tokenStore'
import { getSelectedTenant } from '../../../utils/session'
import { dedupedXeroCall } from '../../../utils/xeroRateLimit'
import { sendInvoiceReminderEmail } from '../../../utils/email'
import { execute, queryRows } from '../../../utils/db'

/**
 * POST /api/xero/invoices/bulk-reminder
 *
 *   { invoiceIds: string[], force?: boolean }
 *
 * Sends a dunning email per invoice in series (respects Xero rate
 * limits) and returns a per-invoice result summary so the UI can show
 * "8 sent, 2 skipped (recently reminded), 1 failed (no email)".
 *
 * Sequential, not parallel — Xero's tenant rate limit is 5 concurrent
 * and we want clean retry behaviour. ~500ms per invoice realistic.
 *
 * Body cap: 50 invoices per call to bound CF Pages handler runtime
 * under the 30s wall-clock limit.
 */
export default eventHandler(async (event) => {
  const user = (event.context as any).user
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Authentication required' })
  }

  const body = await readBody<{ invoiceIds?: string[]; force?: boolean }>(event)
  const ids = Array.isArray(body?.invoiceIds) ? body!.invoiceIds.filter((id) => typeof id === 'string') : []
  const force = !!body?.force

  if (ids.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'invoiceIds is required.' })
  }
  if (ids.length > 50) {
    throw createError({ statusCode: 400, statusMessage: 'Up to 50 invoices per call. Run a second batch for the rest.' })
  }

  const token = await getActiveTokenForSession(event)
  const tenantId = await getSelectedTenant(event)
  if (!tenantId) {
    throw createError({ statusCode: 400, statusMessage: 'No organization selected' })
  }

  // Pre-load dedup state for the whole batch in one query — much faster
  // than per-invoice round trips.
  const recentMap = new Map<string, string>()
  if (!force) {
    const recent = await queryRows<{ invoice_id: string; last_sent: string }>(
      `SELECT invoice_id, MAX(sent_at)::text AS last_sent
       FROM invoice_reminders
       WHERE invoice_id = ANY($1::text[])
         AND sent_at > NOW() - INTERVAL '3 days'
         AND status = 'sent'
       GROUP BY invoice_id`,
      [ids]
    )
    for (const r of recent) recentMap.set(r.invoice_id, r.last_sent)
  }

  type Outcome = { invoiceId: string; status: 'sent' | 'skipped' | 'failed'; reason?: string; sentTo?: string }
  const results: Outcome[] = []

  for (const invoiceId of ids) {
    if (recentMap.has(invoiceId)) {
      results.push({ invoiceId, status: 'skipped', reason: 'reminded within last 3 days' })
      continue
    }

    try {
      const [invoiceBody, onlineBody] = await Promise.all([
        dedupedXeroCall(
          `invoice-detail-bulk:${tenantId}:${invoiceId}`,
          'invoice-detail-bulk',
          () => xeroFetch<any>({
            accessToken: token.access_token!,
            tenantId,
            path: `Invoices/${invoiceId}`,
          })
        ),
        dedupedXeroCall(
          `invoice-online-url-bulk:${tenantId}:${invoiceId}`,
          'invoice-online-url-bulk',
          () => xeroFetch<any>({
            accessToken: token.access_token!,
            tenantId,
            path: `Invoices/${invoiceId}/OnlineInvoice`,
          })
        ).catch(() => null),
      ])

      const inv = invoiceBody?.invoices?.[0]
      if (!inv) {
        results.push({ invoiceId, status: 'failed', reason: 'invoice not found' })
        continue
      }

      const amountDue = Number(inv.amountDue) || 0
      if (amountDue <= 0) {
        results.push({ invoiceId, status: 'skipped', reason: 'no balance to chase' })
        continue
      }

      const contactEmail = inv.contact?.emailAddress as string | undefined
      if (!contactEmail) {
        results.push({ invoiceId, status: 'failed', reason: 'contact has no email in Xero' })
        await execute(
          `INSERT INTO invoice_reminders
             (invoice_id, invoice_number, contact_name, contact_email, amount_due, currency,
              template_kind, sent_by, status, error_message)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            invoiceId,
            inv.invoiceNumber || null,
            inv.contact?.name || null,
            '',
            amountDue,
            inv.currencyCode || 'AUD',
            'bulk',
            user.id,
            'failed',
            'no contact email',
          ]
        )
        continue
      }

      const dueDateRaw = (inv.dueDate || inv.date) as string | undefined
      const dueDate = dueDateRaw ? dueDateRaw.slice(0, 10) : 'soon'
      let daysOverdue = 0
      if (dueDateRaw) {
        const due = new Date(dueDateRaw.slice(0, 10))
        daysOverdue = Math.max(0, Math.floor((Date.now() - due.getTime()) / 86400000))
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

      if (result.ok) {
        results.push({ invoiceId, status: 'sent', sentTo: contactEmail })
      } else {
        results.push({ invoiceId, status: 'failed', reason: result.error || 'send failed' })
      }
    } catch (err: any) {
      results.push({ invoiceId, status: 'failed', reason: err?.statusMessage || err?.message || 'unknown error' })
    }
  }

  const tally = {
    sent: results.filter((r) => r.status === 'sent').length,
    skipped: results.filter((r) => r.status === 'skipped').length,
    failed: results.filter((r) => r.status === 'failed').length,
  }

  return { ok: true, tally, results }
})
