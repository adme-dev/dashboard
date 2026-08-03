import { isIP } from 'node:net'

export type PerformanceEvidenceKind = 'field' | 'lab' | 'unavailable'
export type PerformanceEvidenceStatus = 'available' | 'partial' | 'unavailable'
export type PerformanceRating = 'good' | 'needs_improvement' | 'poor' | 'unavailable'

export interface PerformanceMetricEvidence {
  kind: PerformanceEvidenceKind
  value: number | null
  unit: 'ms' | 'score'
  rating: PerformanceRating
  source: 'crux_url' | 'crux_origin' | 'lighthouse' | 'unavailable'
}

export interface SearchAuthorityPerformanceEvidence {
  status: PerformanceEvidenceStatus
  reasonCode: string | null
  url: string
  strategy: 'mobile'
  observedAt: string
  providerAt: string | null
  providerVersion: string | null
  lcp: PerformanceMetricEvidence
  inp: PerformanceMetricEvidence
  cls: PerformanceMetricEvidence
  field: { lcp: PerformanceMetricEvidence, inp: PerformanceMetricEvidence, cls: PerformanceMetricEvidence }
  lab: { lcp: PerformanceMetricEvidence, inp: PerformanceMetricEvidence, cls: PerformanceMetricEvidence }
}

type Fetcher = (input: string | URL | Request, init?: RequestInit) => Promise<Response>

interface CollectPageSpeedInput {
  url: string
  ownedOrigin: string
  apiKey: string
  fetcher?: Fetcher
  timeoutMs?: number
}

const unavailableMetric = (unit: 'ms' | 'score'): PerformanceMetricEvidence => ({
  kind: 'unavailable',
  value: null,
  unit,
  rating: 'unavailable',
  source: 'unavailable'
})

export function validateOwnedPerformanceUrl(value: string, ownedOrigin: string): string {
  let target: URL
  let approved: URL
  try {
    target = new URL(value)
    approved = new URL(ownedOrigin)
  } catch {
    throw new Error('Performance evidence requires a valid URL and approved owned origin')
  }
  if (target.protocol !== 'https:' || approved.protocol !== 'https:' || !isPublicHostname(target.hostname)) {
    throw new Error('Performance evidence is restricted to a public HTTPS URL')
  }
  if (target.username || target.password) throw new Error('Performance URLs cannot contain credentials')
  if (target.origin !== approved.origin) throw new Error('Performance URL must match the approved owned origin')
  target.hash = ''
  return target.toString()
}

export function normalizePerformanceEvidence(
  value: unknown,
  requestedUrl: string,
  reasonCode: string | null = null
): SearchAuthorityPerformanceEvidence {
  const root = asRecord(value)
  const loading = asRecord(root.loadingExperience)
  const fieldMetrics = asRecord(loading.metrics)
  const lighthouse = asRecord(root.lighthouseResult)
  const audits = asRecord(lighthouse.audits)
  const originFallback = loading.origin_fallback === true
  const fieldSource = originFallback ? 'crux_origin' as const : 'crux_url' as const

  const field = {
    lcp: fieldMetric(fieldMetrics.LARGEST_CONTENTFUL_PAINT_MS, 'lcp', 'ms', fieldSource),
    inp: fieldMetric(fieldMetrics.INTERACTION_TO_NEXT_PAINT, 'inp', 'ms', fieldSource),
    cls: fieldMetric(fieldMetrics.CUMULATIVE_LAYOUT_SHIFT_SCORE, 'cls', 'score', fieldSource, true)
  }
  const lab = {
    lcp: labMetric(audits['largest-contentful-paint'], 'lcp', 'ms'),
    inp: labMetric(audits['interaction-to-next-paint'], 'inp', 'ms'),
    cls: labMetric(audits['cumulative-layout-shift'], 'cls', 'score')
  }
  const fieldCount = Object.values(field).filter(metric => metric.kind === 'field').length
  const labCount = Object.values(lab).filter(metric => metric.kind === 'lab').length
  const status: PerformanceEvidenceStatus = fieldCount > 0 && labCount > 0
    ? 'available'
    : fieldCount > 0 || labCount > 0
      ? 'partial'
      : 'unavailable'

  return {
    status,
    reasonCode: status === 'unavailable' ? (reasonCode ?? 'provider_evidence_unavailable') : reasonCode,
    url: stringValue(root.id) ?? stringValue(lighthouse.finalUrl) ?? requestedUrl,
    strategy: 'mobile',
    observedAt: new Date().toISOString(),
    providerAt: stringValue(root.analysisUTCTimestamp) ?? stringValue(lighthouse.fetchTime),
    providerVersion: stringValue(lighthouse.lighthouseVersion),
    lcp: preferField(field.lcp, lab.lcp),
    inp: preferField(field.inp, lab.inp),
    cls: preferField(field.cls, lab.cls),
    field,
    lab
  }
}

export async function collectPageSpeedEvidence(input: CollectPageSpeedInput): Promise<SearchAuthorityPerformanceEvidence> {
  const url = validateOwnedPerformanceUrl(input.url, input.ownedOrigin)
  if (!input.apiKey.trim()) return normalizePerformanceEvidence({}, url, 'provider_key_missing')

  const endpoint = new URL('https://pagespeedonline.googleapis.com/pagespeedonline/v5/runPagespeed')
  endpoint.searchParams.set('url', url)
  endpoint.searchParams.set('strategy', 'mobile')
  endpoint.searchParams.set('category', 'performance')
  endpoint.searchParams.set('key', input.apiKey)
  const fetcher = input.fetcher ?? fetch

  try {
    const response = await fetcher(endpoint, {
      method: 'GET',
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(Math.min(Math.max(input.timeoutMs ?? 12_000, 1000), 15_000))
    })
    if (!response.ok) return normalizePerformanceEvidence({}, url, `provider_http_${response.status}`)
    const normalized = normalizePerformanceEvidence(await response.json(), url)
    try {
      validateOwnedPerformanceUrl(normalized.url, input.ownedOrigin)
    } catch {
      return normalizePerformanceEvidence({}, url, 'provider_cross_origin_redirect')
    }
    return normalized
  } catch (error: unknown) {
    const timeout = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')
    return normalizePerformanceEvidence({}, url, timeout ? 'provider_timeout' : 'provider_unavailable')
  }
}

function fieldMetric(
  value: unknown,
  name: 'lcp' | 'inp' | 'cls',
  unit: 'ms' | 'score',
  source: 'crux_url' | 'crux_origin',
  scaleByHundred = false
): PerformanceMetricEvidence {
  const row = asRecord(value)
  const percentile = numberValue(row.percentile)
  if (percentile === null) return unavailableMetric(unit)
  const normalized = scaleByHundred ? percentile / 100 : percentile
  return {
    kind: 'field',
    value: normalized,
    unit,
    rating: providerRating(row.category) ?? metricRating(name, normalized),
    source
  }
}

function labMetric(value: unknown, name: 'lcp' | 'inp' | 'cls', unit: 'ms' | 'score'): PerformanceMetricEvidence {
  const numeric = numberValue(asRecord(value).numericValue)
  if (numeric === null) return unavailableMetric(unit)
  return { kind: 'lab', value: numeric, unit, rating: metricRating(name, numeric), source: 'lighthouse' }
}

function preferField(field: PerformanceMetricEvidence, lab: PerformanceMetricEvidence): PerformanceMetricEvidence {
  return field.kind === 'field' ? field : lab
}

function providerRating(value: unknown): PerformanceRating | null {
  const category = stringValue(value)?.toUpperCase()
  if (category === 'FAST') return 'good'
  if (category === 'AVERAGE') return 'needs_improvement'
  if (category === 'SLOW') return 'poor'
  return null
}

function metricRating(name: 'lcp' | 'inp' | 'cls', value: number): PerformanceRating {
  const thresholds = name === 'lcp' ? [2500, 4000] : name === 'inp' ? [200, 500] : [0.1, 0.25]
  if (value <= thresholds[0]!) return 'good'
  if (value <= thresholds[1]!) return 'needs_improvement'
  return 'poor'
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function numberValue(value: unknown): number | null {
  if (typeof value !== 'number' && (typeof value !== 'string' || !value.trim())) return null
  const numeric = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 1000) : null
}

function isPublicHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/\.$/, '').replace(/^\[|\]$/g, '')
  if (normalized === 'localhost'
    || normalized.endsWith('.localhost')
    || normalized.endsWith('.local')
    || normalized.endsWith('.internal')
    || normalized.endsWith('.home.arpa')) return false
  const ipVersion = isIP(normalized)
  if (ipVersion === 4) {
    const octets = normalized.split('.').map(Number)
    return !(octets[0] === 10
      || octets[0] === 127
      || (octets[0] === 100 && octets[1]! >= 64 && octets[1]! <= 127)
      || (octets[0] === 169 && octets[1] === 254)
      || (octets[0] === 172 && octets[1]! >= 16 && octets[1]! <= 31)
      || (octets[0] === 192 && octets[1] === 0 && octets[2] === 0)
      || (octets[0] === 192 && octets[1] === 0 && octets[2] === 2)
      || (octets[0] === 192 && octets[1] === 88 && octets[2] === 99)
      || (octets[0] === 192 && octets[1] === 168)
      || (octets[0] === 198 && (octets[1] === 18 || octets[1] === 19))
      || (octets[0] === 198 && octets[1] === 51 && octets[2] === 100)
      || (octets[0] === 203 && octets[1] === 0 && octets[2] === 113)
      || octets[0] === 0
      || octets[0]! >= 224)
  }
  if (ipVersion === 6) {
    return normalized !== '::'
      && normalized !== '::1'
      && !normalized.startsWith('fc')
      && !normalized.startsWith('fd')
      && !normalized.startsWith('fe80:')
      && !normalized.startsWith('2001:db8:')
      && !normalized.startsWith('::ffff:')
  }
  return true
}
