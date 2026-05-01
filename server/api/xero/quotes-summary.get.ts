import { createError } from 'h3'
import { xeroFetch } from '../../utils/xeroClient'
import { getActiveTokenForSession } from '../../utils/tokenStore'
import { getSelectedTenant } from '../../utils/session'
import { cachedFetch } from '../../utils/kv'
import { dedupedXeroCall } from '../../utils/xeroRateLimit'

/**
 * Active quote pipeline — quotes that are DRAFT, SENT, or ACCEPTED but
 * not yet INVOICED or DECLINED. Sits next to AR on the /invoices page
 * to show forward-looking revenue (work won/quoted but not yet billed).
 *
 *   GET /api/xero/quotes-summary
 *   → { total, count, byStatus: { draft, sent, accepted } }
 *
 * Cached 5 minutes — quotes don't change minute-to-minute.
 */
export default eventHandler(async (event) => {
  const token = await getActiveTokenForSession(event)
  const tenantId = await getSelectedTenant(event)
  if (!tenantId) {
    throw createError({ statusCode: 400, statusMessage: 'No organization selected' })
  }

  const cacheKey = `xero-report:${tenantId}:quotes-summary`

  return cachedFetch(event, cacheKey, 300, async () => {
    const fetchByStatus = (status: 'DRAFT' | 'SENT' | 'ACCEPTED') => dedupedXeroCall(
      `quotes-${status.toLowerCase()}:${tenantId}`,
      `quotes-${status.toLowerCase()}`,
      () => xeroFetch<any>({
        accessToken: token.access_token!,
        tenantId,
        path: `Quotes?Status=${status}`,
      })
    )

    const [draftBody, sentBody, acceptedBody] = await Promise.all([
      fetchByStatus('DRAFT'),
      fetchByStatus('SENT'),
      fetchByStatus('ACCEPTED'),
    ])

    const summarize = (body: any) => {
      const quotes = body?.quotes || []
      const total = quotes.reduce((sum: number, q: any) => sum + (Number(q?.total) || 0), 0)
      return { count: quotes.length, total }
    }

    const draft = summarize(draftBody)
    const sent = summarize(sentBody)
    const accepted = summarize(acceptedBody)

    return {
      total: draft.total + sent.total + accepted.total,
      count: draft.count + sent.count + accepted.count,
      byStatus: { draft, sent, accepted },
    }
  })
})
