/**
 * GET /api/xero/get-out/revenue-reconciliation?month=YYYY-MM&mediaKeep=0.16&printingKeep=0.33
 *
 * READ-ONLY accuracy harness. For a chosen month it pulls live Xero ACCREC
 * invoices (with line items + tracking), derives ex-GST/GST per line from the
 * invoice's LineAmountTypes, groups revenue by Xero account code (and by the
 * 'Media' tracking option), then applies the ADME margin rules to compute
 * ADME net revenue — laid next to the gross billings and the Get Out target.
 *
 * Purpose: prove the model reconciles to the spreadsheet (~$158,033 ADME margin
 * vs ~$342k gross, −$1,224 vs target) and reveal the true account-code split so
 * the disputed media/printing commission rate can be set from evidence. The
 * keep-rates are overridable via query so the operator can dial them in live.
 *
 * Nothing here writes. It does not change any existing card.
 */

import { defineEventHandler, createError, getQuery } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { xeroFetch } from '~~/server/utils/xeroClient'
import { getActiveTokenForSession } from '~~/server/utils/tokenStore'
import { getSelectedTenant } from '~~/server/utils/session'
import { toXeroDateTime } from '~~/server/utils/xeroDataFetcher'
import { loadGetOutConfig, summariseConfig } from '~~/server/utils/getOutConfig'
import { computeAdmeRevenue, DEFAULT_ADME_RULES, type CodeAmount } from '~~/server/utils/admeRevenue'

function n(v: unknown): number {
  if (v == null) return 0
  const x = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(x) ? x : 0
}

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const token = await getActiveTokenForSession(event)
  const tenantIdRaw = await getSelectedTenant(event)
  if (!tenantIdRaw) throw createError({ statusCode: 400, statusMessage: 'No organization selected' })
  if (!token) throw createError({ statusCode: 401, statusMessage: 'Not authenticated with Xero' })
  const tenantId = tenantIdRaw
  const accessToken = token.access_token!

  const q = getQuery(event)

  // ── Resolve month: ?month=YYYY-MM, default = last complete month ──
  const now = new Date()
  let year: number
  let month: number // 1-12
  const m = typeof q.month === 'string' ? /^(\d{4})-(\d{2})$/.exec(q.month) : null
  if (m) {
    year = Number(m[1]); month = Number(m[2])
  } else {
    // last complete calendar month
    const d = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    year = d.getFullYear(); month = d.getMonth() + 1
  }
  const monthStart = new Date(year, month - 1, 1)
  const nextMonthStart = new Date(year, month, 1)
  const monthLabel = monthStart.toLocaleString('en-AU', { month: 'long', year: 'numeric' })

  // ── Overridable keep-rates (so the operator can find what lands on $158,033) ──
  const rules = {
    ...DEFAULT_ADME_RULES,
    keepByBucket: {
      ...DEFAULT_ADME_RULES.keepByBucket,
      media: q.mediaKeep != null ? n(q.mediaKeep) : DEFAULT_ADME_RULES.keepByBucket.media,
      printing: q.printingKeep != null ? n(q.printingKeep) : DEFAULT_ADME_RULES.keepByBucket.printing,
    },
  }

  // ── Xero chart of accounts: code → name (one call) ──
  const accountName: Record<string, string> = {}
  try {
    const acctBody = await xeroFetch<any>({ accessToken, tenantId, path: 'Accounts' })
    for (const a of (acctBody?.accounts ?? [])) {
      if (a?.code) accountName[String(a.code)] = String(a.name ?? a.code)
    }
  } catch (err: any) {
    console.warn('[revenue-reconciliation] accounts fetch failed:', err?.message)
  }

  // ── Live invoices for the month (paged, with line items) ──
  const where = `Type=="ACCREC"&&Date>=${toXeroDateTime(monthStart)}&&Date<${toXeroDateTime(nextMonthStart)}&&Status!="DRAFT"&&Status!="DELETED"&&Status!="VOIDED"`
  const invoices: any[] = []
  let truncated = false
  for (let page = 1; page <= 15; page++) {
    const params = new URLSearchParams({ where, order: 'Date DESC', page: String(page), pageSize: '100' })
    const body = await xeroFetch<any>({ accessToken, tenantId, path: `Invoices?${params.toString()}` })
    const batch = body?.invoices ?? []
    invoices.push(...batch)
    if (batch.length < 100) break
    if (page === 15) truncated = true
  }

  // ── Aggregate ex-GST / GST per account code + per Media tracking option ──
  const perCode = new Map<string, { exGst: number; gst: number }>()
  const perTracking = new Map<string, number>()
  let grossExGst = 0
  let grossGst = 0

  // Optional line-level drill-down for one account code (accuracy investigation).
  const detailCode = typeof q.detailCode === 'string' ? q.detailCode : null
  const lineDetail: Array<{ contact: string; invoice: string; description: string; trackingMedia: string | null; taxType: string | null; exGst: number }> = []

  for (const inv of invoices) {
    const lat = String(inv?.lineAmountTypes ?? '').toUpperCase()
    const inclusive = lat.includes('INCL')
    for (const li of (inv?.lineItems ?? [])) {
      const lineAmount = n(li?.lineAmount)
      const taxAmount = n(li?.taxAmount)
      const exGst = inclusive ? lineAmount - taxAmount : lineAmount
      const gst = taxAmount
      const code = String(li?.accountCode ?? '(none)')
      const media = (li?.tracking ?? []).find((t: any) => /media/i.test(String(t?.name ?? '')))?.option ?? null

      const cur = perCode.get(code) ?? { exGst: 0, gst: 0 }
      cur.exGst += exGst; cur.gst += gst
      perCode.set(code, cur)

      grossExGst += exGst; grossGst += gst

      if (media) perTracking.set(String(media), (perTracking.get(String(media)) ?? 0) + exGst)

      if (detailCode && code === detailCode && lineDetail.length < 300) {
        lineDetail.push({
          contact: String(inv?.contact?.name ?? ''),
          invoice: String(inv?.invoiceNumber ?? ''),
          description: String(li?.description ?? '').slice(0, 120),
          trackingMedia: media ? String(media) : null,
          taxType: li?.taxType ? String(li.taxType) : null,
          exGst: Math.round(exGst * 100) / 100,
        })
      }
    }
  }
  lineDetail.sort((a, b) => b.exGst - a.exGst)

  // ── Classify + compute ADME margin ──
  const codes: CodeAmount[] = [...perCode.entries()].map(([code, v]) => ({
    code,
    name: accountName[code] ?? code,
    exGst: v.exGst,
    gst: v.gst,
  }))
  const result = computeAdmeRevenue(codes, rules)

  // ── Target + position ──
  const config = await loadGetOutConfig(tenantId)
  const target = summariseConfig(config).totalCents / 100
  const round2 = (x: number) => Math.round(x * 100) / 100

  return {
    month: { year, month, label: monthLabel },
    rulesUsed: { keepByBucket: rules.keepByBucket, bucketByCode: rules.bucketByCode, defaultBucket: rules.defaultBucket },
    invoiceCount: invoices.length,
    truncated,
    gross: {
      exGst: round2(grossExGst),
      gst: round2(grossGst),
      inclGst: round2(grossExGst + grossGst),
    },
    admeMargin: result.admeMargin,
    byBucket: result.byBucket,
    byCode: result.byCode,
    topTrackingMedia: [...perTracking.entries()]
      .map(([option, exGst]) => ({ option, exGst: round2(exGst) }))
      .sort((a, b) => b.exGst - a.exGst)
      .slice(0, 25),
    target: round2(target),
    position: round2(result.admeMargin - target),
    detailCode,
    lineDetail: detailCode ? lineDetail : undefined,
    note: 'Read-only reconciliation. Tune ?mediaKeep= / ?printingKeep= to match the spreadsheet ADME total. Pass ?detailCode=220 for line-level drill-down.',
  }
})
