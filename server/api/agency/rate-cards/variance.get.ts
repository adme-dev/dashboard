import { requireAuth } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'
import { matchLineItems } from '~~/server/utils/rateCardMatcher'
import { createXeroClient } from '~~/server/utils/xeroClient'
import { getActiveTokenForSession } from '~~/server/utils/tokenStore'
import { getSelectedTenant } from '~~/server/utils/session'
import { cachedFetch } from '~~/server/utils/kv'
import { dedupedXeroCall } from '~~/server/utils/xeroRateLimit'
import { ensureDateString } from '~~/server/utils/xeroDataFetcher'

export default eventHandler(async (event) => {
  await requireAuth(event)

  const token = await getActiveTokenForSession(event)
  const tenantId = getSelectedTenant(event)
  if (!tenantId) {
    throw createError({ statusCode: 400, statusMessage: 'No organization selected' })
  }

  const cacheKey = `xero-report:${tenantId}:rate-card-variance`

  return cachedFetch(event, cacheKey, 300, async () => {
    // 1. Fetch rate card items
    const rateCardRows = await queryRows(`
      SELECT i.id, i.service_name, i.price, i.price_unit, c.name AS category_name
      FROM rate_card_items i
      JOIN rate_card_categories c ON c.id = i.category_id
      WHERE i.is_active = true
    `)

    if (rateCardRows.length === 0) {
      return {
        flaggedInvoices: [],
        summary: { totalInvoicesScanned: 0, totalFlagged: 0, totalPotentialLoss: 0, topOffenders: [] },
        error: 'No rate card items configured. Import a rate card first.',
      }
    }

    const rateCardItems = rateCardRows.map(r => ({
      id: r.id,
      serviceName: r.service_name,
      price: Number(r.price),
      priceUnit: r.price_unit,
      categoryName: r.category_name,
    }))

    // 2. Fetch recent Xero ACCREC invoices (AUTHORISED + PAID)
    const client = await createXeroClient({ tokenSet: token, event })
    const dateKey = ensureDateString(new Date())

    const [authorisedBody, paidBody] = await Promise.all([
      dedupedXeroCall(
        `variance-accrec-authorised:${tenantId}:${dateKey}`,
        'variance-authorised',
        async () => {
          const { body } = await (client.accountingApi.getInvoices as any)(
            tenantId,
            undefined,
            'Type=="ACCREC"&&Status=="AUTHORISED"',
            'Date DESC',
            undefined, undefined, undefined, undefined,
            1, undefined, undefined, undefined,
            200
          )
          return body
        }
      ),
      dedupedXeroCall(
        `variance-accrec-paid:${tenantId}:${dateKey}`,
        'variance-paid',
        async () => {
          const { body } = await (client.accountingApi.getInvoices as any)(
            tenantId,
            undefined,
            'Type=="ACCREC"&&Status=="PAID"',
            'Date DESC',
            undefined, undefined, undefined, undefined,
            1, undefined, undefined, undefined,
            200
          )
          return body
        }
      ),
    ])

    const allInvoices = [
      ...(authorisedBody?.invoices || []),
      ...(paidBody?.invoices || []),
    ]

    // 3. Match each invoice's line items against rate card
    const flaggedInvoices: any[] = []

    for (const inv of allInvoices) {
      const lineItems = (inv.lineItems || []).map((li: any) => ({
        description: li.description || '',
        unitAmount: Number(li.unitAmount || 0),
        quantity: Number(li.quantity || 1),
      }))

      const flagged = matchLineItems(lineItems, rateCardItems)

      for (const item of flagged) {
        flaggedInvoices.push({
          invoiceId: inv.invoiceID,
          invoiceNumber: inv.invoiceNumber,
          contact: inv.contact?.name || 'Unknown',
          date: inv.date,
          status: inv.status,
          lineItem: {
            description: item.description,
            charged: item.charged,
            quantity: item.quantity,
          },
          rateCardItem: {
            serviceName: item.match.serviceName,
            price: item.match.price,
            unit: item.match.priceUnit,
            category: item.match.categoryName,
            confidence: item.match.confidence,
          },
          variance: item.variance,
          potentialLoss: item.potentialLoss,
        })
      }
    }

    // Sort by variance (worst first)
    flaggedInvoices.sort((a, b) => a.variance - b.variance)

    // 4. Build summary
    const totalPotentialLoss = flaggedInvoices.reduce((sum, f) => sum + f.potentialLoss, 0)

    // Top offenders by contact
    const contactMap = new Map<string, { contact: string; flagCount: number; totalLoss: number }>()
    for (const f of flaggedInvoices) {
      const existing = contactMap.get(f.contact) || { contact: f.contact, flagCount: 0, totalLoss: 0 }
      existing.flagCount++
      existing.totalLoss += f.potentialLoss
      contactMap.set(f.contact, existing)
    }
    const topOffenders = Array.from(contactMap.values())
      .sort((a, b) => b.totalLoss - a.totalLoss)
      .slice(0, 10)

    return {
      flaggedInvoices,
      summary: {
        totalInvoicesScanned: allInvoices.length,
        totalFlagged: flaggedInvoices.length,
        totalPotentialLoss: Math.round(totalPotentialLoss * 100) / 100,
        topOffenders,
      },
    }
  })
})
