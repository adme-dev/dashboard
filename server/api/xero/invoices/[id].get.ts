import { createError } from 'h3'
import { createXeroClient } from '../../../utils/xeroClient'
import { getActiveTokenForSession } from '../../../utils/tokenStore'
import { getSelectedTenant } from '../../../utils/session'
import { cachedFetch } from '../../../utils/kv'
import { dedupedXeroCall } from '../../../utils/xeroRateLimit'

export default eventHandler(async (event) => {
  const invoiceId = getRouterParam(event, 'id')
  if (!invoiceId) {
    throw createError({ statusCode: 400, statusMessage: 'Invoice ID is required' })
  }

  const token = await getActiveTokenForSession(event)
  const tenantId = await getSelectedTenant(event)
  if (!tenantId) {
    throw createError({ statusCode: 400, statusMessage: 'No organization selected' })
  }

  const cacheKey = `xero-invoice:${tenantId}:${invoiceId}`

  return cachedFetch(event, cacheKey, 120, async () => {
    const client = await createXeroClient({ tokenSet: token, event })

    const body = await dedupedXeroCall(
      `invoice-detail:${tenantId}:${invoiceId}`,
      'invoice-detail',
      async () => {
        const { body } = await (client.accountingApi.getInvoice as any)(tenantId, invoiceId)
        return body
      }
    )

    const inv = body?.invoices?.[0]
    if (!inv) {
      throw createError({ statusCode: 404, statusMessage: 'Invoice not found' })
    }

    function iso(input?: string | Date | null): string | undefined {
      if (!input) return undefined
      if (typeof input === 'string') return input.slice(0, 10)
      if (input instanceof Date) return input.toISOString().slice(0, 10)
      return undefined
    }

    const contact = inv.contact || {}
    const addresses = contact.addresses || []
    const primaryAddress = addresses.find((a: any) => a.addressType === 'POBOX') || addresses[0]

    return {
      id: inv.invoiceID,
      number: inv.invoiceNumber,
      reference: inv.reference || null,
      status: inv.status,
      type: inv.type,
      contact: {
        name: contact.name || null,
        email: contact.emailAddress || null,
        phone: (contact.phones || []).find((p: any) => p.phoneNumber)?.phoneNumber || null,
        address: primaryAddress
          ? [primaryAddress.addressLine1, primaryAddress.addressLine2, primaryAddress.city, primaryAddress.region, primaryAddress.postalCode, primaryAddress.country].filter(Boolean).join(', ')
          : null
      },
      date: iso(inv.date),
      dueDate: iso(inv.dueDate),
      fullyPaidOnDate: iso(inv.fullyPaidOnDate),
      subtotal: Number(inv.subTotal ?? 0),
      totalTax: Number(inv.totalTax ?? 0),
      total: Number(inv.total ?? 0),
      amountDue: Number(inv.amountDue ?? 0),
      amountPaid: Number(inv.amountPaid ?? 0),
      amountCredited: Number(inv.amountCredited ?? 0),
      currency: inv.currencyCode || 'AUD',
      lineItems: (inv.lineItems || []).map((li: any) => ({
        description: li.description || '',
        quantity: Number(li.quantity ?? 0),
        unitAmount: Number(li.unitAmount ?? 0),
        lineAmount: Number(li.lineAmount ?? 0),
        accountCode: li.accountCode || null,
        taxType: li.taxType || null
      })),
      payments: (inv.payments || []).map((p: any) => ({
        date: iso(p.date),
        amount: Number(p.amount ?? 0),
        reference: p.reference || null
      })),
      creditNotes: (inv.creditNotes || []).map((cn: any) => ({
        number: cn.creditNoteNumber || null,
        date: iso(cn.date),
        total: Number(cn.total ?? 0)
      })),
      url: inv.invoiceID ? `https://go.xero.com/AccountsReceivable/View.aspx?InvoiceID=${inv.invoiceID}` : null
    }
  })
})
