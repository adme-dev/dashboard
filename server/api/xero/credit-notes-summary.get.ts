import { createError } from 'h3'
import { xeroFetch } from '../../utils/xeroClient'
import { getActiveTokenForSession } from '../../utils/tokenStore'
import { getSelectedTenant } from '../../utils/session'
import { cachedFetch } from '../../utils/kv'
import { dedupedXeroCall } from '../../utils/xeroRateLimit'

/**
 * Sales credit notes (Type=ACCRECCREDIT) that are AUTHORISED — i.e.
 * issued and active, with a remaining unapplied balance owed back to
 * the customer (or available to apply against future invoices).
 *
 *   GET /api/xero/credit-notes-summary
 *   → { total, count, byContact: [{ name, total, count }] }
 *
 * Used on /invoices to derive a Net AR view (open AR minus outstanding
 * credit notes) and surface unapplied customer credits that should be
 * applied or refunded.
 *
 * Cached 5 minutes — credit notes don't churn minute-to-minute.
 */
export default eventHandler(async (event) => {
  const token = await getActiveTokenForSession(event)
  const tenantId = await getSelectedTenant(event)
  if (!tenantId) {
    throw createError({ statusCode: 400, statusMessage: 'No organization selected' })
  }

  const cacheKey = `xero-report:${tenantId}:credit-notes-summary`

  return cachedFetch(event, cacheKey, 300, async () => {
    // Paginate the same way as invoices — 5 pages × 100 = 500 ceiling
    // is plenty (most agencies have <50 active credit notes at any time).
    async function fetchAllPages(maxPages = 5) {
      const all: any[] = []
      for (let page = 1; page <= maxPages; page++) {
        const params = new URLSearchParams({
          where: 'Type=="ACCRECCREDIT"&&Status=="AUTHORISED"',
          order: 'Date DESC',
          page: String(page),
          pageSize: '100',
        })
        const body = await dedupedXeroCall(
          `credit-notes:${tenantId}:p${page}`,
          `credit-notes-p${page}`,
          () => xeroFetch<any>({
            accessToken: token.access_token!,
            tenantId,
            path: `CreditNotes?${params.toString()}`,
          })
        )
        const notes = body?.creditNotes || []
        all.push(...notes)
        if (notes.length < 100) return all
      }
      return all
    }

    const notes = await fetchAllPages()

    const active = notes
      .map((cn: any) => ({
        id: cn.creditNoteID,
        number: cn.creditNoteNumber,
        contact: cn.contact?.name ?? 'Unknown',
        contactId: cn.contact?.contactID ?? null,
        date: typeof cn.date === 'string' ? cn.date.slice(0, 10) : null,
        total: Number(cn.total) || 0,
        // remainingCredit = unapplied portion; this is the live liability.
        remainingCredit: Number(cn.remainingCredit) || 0,
        currency: cn.currencyCode || 'AUD',
      }))
      .filter((cn) => cn.remainingCredit > 0)

    const total = active.reduce((s, cn) => s + cn.remainingCredit, 0)
    const count = active.length

    const byContactMap = new Map<string, { name: string; total: number; count: number }>()
    for (const cn of active) {
      const entry = byContactMap.get(cn.contact) ?? { name: cn.contact, total: 0, count: 0 }
      entry.total += cn.remainingCredit
      entry.count += 1
      byContactMap.set(cn.contact, entry)
    }
    const byContact = Array.from(byContactMap.values())
      .sort((a, b) => b.total - a.total)
      .slice(0, 8)
      .map((c) => ({ ...c, total: Math.round(c.total) }))

    return {
      total: Math.round(total),
      count,
      byContact,
      notes: active.sort((a, b) => b.remainingCredit - a.remainingCredit).slice(0, 50),
    }
  })
})
