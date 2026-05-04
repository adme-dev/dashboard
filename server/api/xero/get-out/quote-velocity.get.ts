/**
 * GET /api/xero/get-out/quote-velocity
 *
 * Quote pipeline velocity — how fast quotes typically move from `sent` to
 * `accepted` or `declined`, plus a forward-looking estimate of how many of
 * the currently-open `sent` quotes will likely close before end-of-month.
 *
 * Intent: pair with the existing "Open quotes" card so the operator sees
 * not just "I have $X in sent quotes" but "Y of those will probably close
 * by EOM, Z are likely cold and need a follow-up".
 *
 * Methodology:
 *   • Fetch all quotes (live Xero) — capped at first page (100) since we
 *     only need the recent close history.
 *   • Compute `avgSentToCloseDays` = mean of (close_date − sent_date) for
 *     the last N closed quotes (status ACCEPTED, INVOICED, DECLINED).
 *   • For open SENT quotes: predicted close-by-EOM = (sentDate + avg) <= EOM.
 *
 * Response shape:
 *   {
 *     velocity: { avgSentToCloseDays, sampleSize, acceptanceRate },
 *     openSent: { totalCount, totalValue, likelyByEom: { count, value } },
 *     ageBuckets: { fresh, warming, stale, dead }
 *   }
 */

import { defineEventHandler, createError } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { xeroFetch } from '~~/server/utils/xeroClient'
import { getActiveTokenForSession } from '~~/server/utils/tokenStore'
import { getSelectedTenant } from '~~/server/utils/session'
import { cachedFetch } from '~~/server/utils/kv'

function n(v: unknown): number {
  if (v == null) return 0
  const num = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(num) ? num : 0
}

function daysBetween(a: string, b: string): number {
  const aMs = new Date(a + 'T00:00:00Z').getTime()
  const bMs = new Date(b + 'T00:00:00Z').getTime()
  return Math.round((bMs - aMs) / 86_400_000)
}

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const token = await getActiveTokenForSession(event)
  const tenantId = await getSelectedTenant(event)
  if (!tenantId) throw createError({ statusCode: 400, statusMessage: 'No organization selected' })
  if (!token) throw createError({ statusCode: 401, statusMessage: 'Not authenticated with Xero' })

  return cachedFetch(event, `xero-get-out:${tenantId}:quote-velocity`, 600, async () => {
    const today = new Date()
    const todayStr = today.toISOString().slice(0, 10)
    const year = today.getFullYear()
    const month = today.getMonth() + 1
    const daysInMonth = new Date(year, month, 0).getDate()
    const monthEnd = `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`

    // Fetch a single page of quotes (100). For a typical agency this covers
    // months of history; if we need more we'd page. Keep it cheap.
    let quotes: any[] = []
    try {
      const body = await xeroFetch<any>({
        accessToken: token.access_token!,
        tenantId,
        path: 'Quotes?order=Date DESC',
      })
      quotes = body?.quotes ?? []
    } catch (err: any) {
      console.warn('[quote-velocity] fetch failed:', err?.statusMessage ?? err?.message)
    }

    // ── Velocity: avg sent → accepted/declined/invoiced ──
    // Xero status transitions are inferred from updatedDateUTC. Approximation:
    // for non-DRAFT/SENT quotes, use (updatedDate − date) as time-to-close.
    const closeDurations: number[] = []
    let acceptedCount = 0
    let declinedCount = 0
    for (const q of quotes) {
      const status = String(q.status ?? '').toUpperCase()
      const dateStr = q.date ? String(q.date).slice(0, 10) : null
      const updatedStr = q.updatedDateUtc
        ? String(q.updatedDateUtc).slice(0, 10)
        : (q.updatedDateUTC ? String(q.updatedDateUTC).slice(0, 10) : null)
      if (!dateStr || !updatedStr) continue
      if (status === 'ACCEPTED' || status === 'INVOICED') {
        const days = Math.max(0, daysBetween(dateStr, updatedStr))
        closeDurations.push(days)
        acceptedCount++
      } else if (status === 'DECLINED') {
        const days = Math.max(0, daysBetween(dateStr, updatedStr))
        closeDurations.push(days)
        declinedCount++
      }
    }
    const sampleSize = closeDurations.length
    const avgSentToCloseDays = sampleSize > 0
      ? Math.round(closeDurations.reduce((s, d) => s + d, 0) / sampleSize)
      : null
    const closedTotal = acceptedCount + declinedCount
    const acceptanceRate = closedTotal > 0
      ? Math.round((acceptedCount / closedTotal) * 1000) / 10
      : null

    // ── Open SENT quotes: age + likely-by-EOM prediction ──
    let openCount = 0
    let openValue = 0
    let likelyByEomCount = 0
    let likelyByEomValue = 0
    const ageBuckets = { fresh: 0, warming: 0, stale: 0, dead: 0 }
    const ageBucketsValue = { fresh: 0, warming: 0, stale: 0, dead: 0 }
    for (const q of quotes) {
      const status = String(q.status ?? '').toUpperCase()
      if (status !== 'SENT') continue
      const dateStr = q.date ? String(q.date).slice(0, 10) : null
      if (!dateStr) continue
      const total = n(q.total)
      const age = Math.max(0, daysBetween(dateStr, todayStr))
      openCount++
      openValue += total
      // Bucket by age
      if (age <= 7)        { ageBuckets.fresh++;   ageBucketsValue.fresh += total }
      else if (age <= 30)  { ageBuckets.warming++; ageBucketsValue.warming += total }
      else if (age <= 90)  { ageBuckets.stale++;   ageBucketsValue.stale += total }
      else                 { ageBuckets.dead++;    ageBucketsValue.dead += total }
      // Predicted close: if avg sent-to-close is known, expected close ≈
      // sentDate + avg. Likely-by-EOM if that date is on or before monthEnd.
      if (avgSentToCloseDays != null) {
        const expectedClose = new Date(new Date(dateStr + 'T00:00:00Z').getTime() + avgSentToCloseDays * 86_400_000)
          .toISOString().slice(0, 10)
        // Skip "dead" quotes from the optimistic projection
        if (age <= 90 && expectedClose <= monthEnd) {
          likelyByEomCount++
          likelyByEomValue += total
        }
      }
    }

    return {
      velocity: {
        avgSentToCloseDays,
        sampleSize,
        acceptanceRate,
        acceptedCount,
        declinedCount,
      },
      openSent: {
        totalCount: openCount,
        totalValue: Math.round(openValue * 100) / 100,
        likelyByEom: {
          count: likelyByEomCount,
          value: Math.round(likelyByEomValue * 100) / 100,
        },
      },
      ageBuckets: {
        fresh:   { count: ageBuckets.fresh,   value: Math.round(ageBucketsValue.fresh * 100) / 100 },
        warming: { count: ageBuckets.warming, value: Math.round(ageBucketsValue.warming * 100) / 100 },
        stale:   { count: ageBuckets.stale,   value: Math.round(ageBucketsValue.stale * 100) / 100 },
        dead:    { count: ageBuckets.dead,    value: Math.round(ageBucketsValue.dead * 100) / 100 },
      },
      methodology: 'Velocity = average days between Date and UpdatedDateUTC for closed quotes. Likely-by-EOM = sent quotes whose (sentDate + avg) <= month end.',
    }
  })
})
