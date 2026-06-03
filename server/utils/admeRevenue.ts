/**
 * ADME net-revenue model.
 *
 * The agency invoices clients the GROSS amount (their own services + passthrough
 * media spend that flows straight to Facebook/Google). The number the business
 * actually measures against the "Get Out" target is ADME's MARGIN:
 *   • owned services (production, marketing, digital, social, video, IT/web): 100%
 *   • media passthrough (Facebook/Google/matching):                          16%
 *   • printing:                                                              33%
 *
 * This module classifies invoice revenue by Xero account code into those
 * buckets and computes the margin. The code→bucket mapping and keep-rates are
 * configurable because the real Xero codes must be confirmed by reconciliation
 * against a known month before they're trusted.
 *
 * NOTE: the default code map below is the dashboard's pre-existing (unverified)
 * category map. It is a STARTING POINT for reconciliation, not ground truth.
 */

export type AdmeBucket = 'media' | 'printing' | 'owned' | 'excluded'

export interface AdmeRevenueRules {
  /** Xero account code → bucket. Codes not listed fall to `defaultBucket`. */
  bucketByCode: Record<string, AdmeBucket>
  /** Bucket → fraction of ex-GST revenue ADME keeps (0..1). */
  keepByBucket: Record<AdmeBucket, number>
  /** Bucket applied to any account code not in `bucketByCode`. */
  defaultBucket: AdmeBucket
}

export const DEFAULT_ADME_RULES: AdmeRevenueRules = {
  bucketByCode: {
    // 220 "Sales - Media" = ADME's media billing (commission applies).
    '220': 'media',
    // 330 "Direct Costs: Media Other (Reimb Exp)" = pure Facebook/Google
    // passthrough reimbursed by the client — ADME keeps 0%. NOT 16%.
    '330': 'excluded',
    '205': 'printing',
    '210': 'owned', '215': 'owned', '216': 'owned',
    '217': 'owned', '219': 'owned', '225': 'owned',
  },
  keepByBucket: { media: 0.16, printing: 0.33, owned: 1, excluded: 0 },
  defaultBucket: 'owned',
}

export interface CodeAmount {
  code: string
  name?: string
  exGst: number
  gst?: number
}

export interface CodeLine extends CodeAmount {
  bucket: AdmeBucket
  keepPct: number
  /** exGst * keepPct — ADME's share of this code's revenue. */
  contribution: number
  /** true when the code wasn't explicitly mapped (fell to default). */
  unmapped: boolean
}

export interface BucketTotal {
  exGst: number
  contribution: number
  codeCount: number
}

export interface AdmeRevenueResult {
  byCode: CodeLine[]
  byBucket: Record<AdmeBucket, BucketTotal>
  grossExGst: number
  gst: number
  grossInclGst: number
  admeMargin: number
}

const round2 = (n: number) => Math.round(n * 100) / 100

export function classifyCode(
  code: string,
  rules: AdmeRevenueRules = DEFAULT_ADME_RULES,
): { bucket: AdmeBucket; keepPct: number; unmapped: boolean } {
  const mapped = rules.bucketByCode[code]
  const bucket = mapped ?? rules.defaultBucket
  return { bucket, keepPct: rules.keepByBucket[bucket] ?? 0, unmapped: mapped == null }
}

export function computeAdmeRevenue(
  codes: CodeAmount[],
  rules: AdmeRevenueRules = DEFAULT_ADME_RULES,
): AdmeRevenueResult {
  const emptyBucket = (): BucketTotal => ({ exGst: 0, contribution: 0, codeCount: 0 })
  const byBucket: Record<AdmeBucket, BucketTotal> = {
    media: emptyBucket(),
    printing: emptyBucket(),
    owned: emptyBucket(),
    excluded: emptyBucket(),
  }

  const byCode: CodeLine[] = []
  let grossExGst = 0
  let gst = 0
  let admeMargin = 0

  for (const c of codes) {
    const exGst = Number.isFinite(c.exGst) ? c.exGst : 0
    const codeGst = Number.isFinite(c.gst as number) ? (c.gst as number) : 0
    const { bucket, keepPct, unmapped } = classifyCode(c.code, rules)
    const contribution = exGst * keepPct

    byCode.push({
      code: c.code,
      name: c.name,
      exGst: round2(exGst),
      gst: round2(codeGst),
      bucket,
      keepPct,
      contribution: round2(contribution),
      unmapped,
    })

    const b = byBucket[bucket]
    b.exGst += exGst
    b.contribution += contribution
    b.codeCount += 1

    grossExGst += exGst
    gst += codeGst
    admeMargin += contribution
  }

  for (const k of Object.keys(byBucket) as AdmeBucket[]) {
    byBucket[k].exGst = round2(byBucket[k].exGst)
    byBucket[k].contribution = round2(byBucket[k].contribution)
  }

  return {
    byCode: byCode.sort((a, b) => b.exGst - a.exGst),
    byBucket,
    grossExGst: round2(grossExGst),
    gst: round2(gst),
    grossInclGst: round2(grossExGst + gst),
    admeMargin: round2(admeMargin),
  }
}
