/**
 * GET /api/xero/credit-notes
 *
 * Surfaces credit notes issued to / received from clients so the agency
 * dashboard can show a "credits issued this month" tile plus YTD totals.
 * Without these, headline revenue is overstated because refunds/credits
 * aren't netted out.
 *
 * Xero docs: https://developer.xero.com/documentation/api/accounting/creditnotes
 */

import { createError } from 'h3'
import { xeroFetch } from '../../utils/xeroClient'
import { getActiveTokenForSession } from '../../utils/tokenStore'
import { getSelectedTenant } from '../../utils/session'
import { cachedFetch } from '../../utils/kv'
import { dedupedXeroCall } from '../../utils/xeroRateLimit'

function ensureDate(d: Date) {
  return d.toISOString().slice(0, 10)
}

function dtExpr(d: Date) {
  return `DateTime(${d.getUTCFullYear()},${String(d.getUTCMonth() + 1).padStart(2, '0')},${String(d.getUTCDate()).padStart(2, '0')})`
}

export default eventHandler(async (event) => {
  const token = await getActiveTokenForSession(event)
  const tenantId = await getSelectedTenant(event)
  if (!tenantId) {
    throw createError({ statusCode: 400, statusMessage: 'No organization selected' })
  }

  const q = getQuery(event)
  const today = new Date()
  const fromStr = typeof q.from === 'string' ? q.from : ensureDate(new Date(today.getFullYear(), 0, 1))
  const toStr = typeof q.to === 'string' ? q.to : ensureDate(today)
  const from = new Date(fromStr)
  const to = new Date(toStr)

  const cacheKey = `xero:credit-notes:${tenantId}:${fromStr}:${toStr}`

  return cachedFetch(event, cacheKey, 600, async () => {
    const accessToken = token.access_token!
    const params = new URLSearchParams({
      where: `Date>=${dtExpr(from)}&&Date<=${dtExpr(to)}`,
      order: 'Date DESC',
      page: '1',
      pageSize: '500',
    })

    const body = await dedupedXeroCall(
      `credit-notes:${tenantId}:${fromStr}:${toStr}`,
      'credit-notes',
      () => xeroFetch<any>({ accessToken, tenantId, path: `CreditNotes?${params.toString()}` })
    )

    const notes = (body?.creditNotes ?? []) as any[]

    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)
    const monthStartStr = ensureDate(monthStart)

    let issuedYtd = 0
    let issuedCount = 0
    let issuedMonth = 0
    let issuedMonthCount = 0
    let receivedYtd = 0
    let receivedCount = 0

    const issuedByContact = new Map<string, { name: string; total: number; count: number }>()
    const recent: Array<{ id: string; number: string; date: string; contact: string; total: number; type: string; status: string }> = []

    for (const cn of notes) {
      const total = Number(cn.total) || 0
      const type = cn.type ?? ''
      const isIssued = type === 'ACCRECCREDIT' // credit to customer (reduces our revenue)
      const isReceived = type === 'ACCPAYCREDIT' // credit from supplier
      const date: string = typeof cn.date === 'string' ? cn.date.slice(0, 10) : ''
      const contact = cn.contact?.name ?? 'Unknown'

      if (isIssued) {
        issuedYtd += total
        issuedCount += 1
        if (date >= monthStartStr) {
          issuedMonth += total
          issuedMonthCount += 1
        }
        const existing = issuedByContact.get(contact) ?? { name: contact, total: 0, count: 0 }
        existing.total += total
        existing.count += 1
        issuedByContact.set(contact, existing)
      } else if (isReceived) {
        receivedYtd += total
        receivedCount += 1
      }

      if (recent.length < 20) {
        recent.push({
          id: cn.creditNoteID ?? '',
          number: cn.creditNoteNumber ?? '',
          date,
          contact,
          total,
          type,
          status: cn.status ?? '',
        })
      }
    }

    const topContacts = Array.from(issuedByContact.values())
      .sort((a, b) => b.total - a.total)
      .slice(0, 5)
      .map(c => ({ ...c, total: Math.round(c.total * 100) / 100 }))

    return {
      range: { from: fromStr, to: toStr },
      summary: {
        issuedYtdTotal: Math.round(issuedYtd * 100) / 100,
        issuedYtdCount: issuedCount,
        issuedMonthTotal: Math.round(issuedMonth * 100) / 100,
        issuedMonthCount,
        receivedYtdTotal: Math.round(receivedYtd * 100) / 100,
        receivedYtdCount: receivedCount,
      },
      topContacts,
      recent,
    }
  })
})
