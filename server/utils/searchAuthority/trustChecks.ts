import type { SiteIntelligencePageStatus } from '~~/app/types/site-intelligence'

export type SearchAuthorityTrustSeverity = 'info' | 'low' | 'medium' | 'high' | 'critical'
export type SearchAuthorityTrustOwner = 'xeroflow' | 'dealer_origin' | 'external_provider'

export interface SearchAuthorityTrustFindingCandidate {
  checkKey: string
  severity: SearchAuthorityTrustSeverity
  owner: SearchAuthorityTrustOwner
  title: string
  summary: string
  evidence: Record<string, string | number | boolean | null>
}

export interface SearchAuthorityTrustInput {
  sourceUrl: string
  canonicalUrl: string
  status: SiteIntelligencePageStatus
  httpStatus: number | null
  title: string | null
  metadata?: Record<string, unknown>
  markdown?: string
  html?: string
}

const SOFT_404_PATTERNS = [
  /\bpage (?:was )?not found\b/i,
  /\bvehicle (?:is )?no longer available\b/i,
  /\bthis vehicle has been sold\b/i,
  /\bwe can'?t find (?:that|this) (?:page|vehicle)\b/i
]

export function evaluateSearchAuthorityTrust(input: SearchAuthorityTrustInput): SearchAuthorityTrustFindingCandidate[] {
  const findings: SearchAuthorityTrustFindingCandidate[] = []
  const html = input.html ?? ''
  const markdown = input.markdown ?? ''
  const metadata = input.metadata ?? {}

  if (input.status === 'disallowed') {
    findings.push(finding('crawl.disallowed', 'high', 'dealer_origin', 'Crawler access is disallowed',
      'The page could not be read by the governed public-site crawler.', { status: input.status }))
  } else if (input.status === 'errored' || input.status === 'cancelled') {
    findings.push(finding('crawl.failed', 'high', 'external_provider', 'Page crawl failed',
      'The crawler did not obtain a complete page response.', { status: input.status }))
  }

  if (input.httpStatus && input.httpStatus >= 400) {
    findings.push(finding('crawl.http_status', input.httpStatus >= 500 ? 'critical' : 'high', 'dealer_origin',
      `Page returned HTTP ${input.httpStatus}`, 'Search and AI crawlers may not index a page that returns an error status.',
      { httpStatus: input.httpStatus }))
  }

  if (html) {
    const robots = readMetaContent(html, 'robots')
    if (robots && /(?:^|[,\s])noindex(?:[,\s]|$)/i.test(robots)) {
      findings.push(finding('indexability.robots_noindex', 'critical', 'dealer_origin', 'Page is marked noindex',
        'The robots directive prevents this page from being eligible for search indexing.', { robots: clip(robots, 300) }))
    }

    const canonicalHref = readCanonicalHref(html)
    if (!canonicalHref) {
      findings.push(finding('canonical.missing', 'medium', 'dealer_origin', 'Canonical URL is missing',
        'The rendered HTML does not declare a canonical URL.', { pageUrl: input.canonicalUrl }))
    } else {
      const resolvedCanonical = resolveUrl(canonicalHref, input.sourceUrl)
      if (resolvedCanonical && !sameOrigin(resolvedCanonical, input.sourceUrl)) {
        findings.push(finding('canonical.cross_origin', 'high', 'dealer_origin', 'Canonical points to another origin',
          'The page canonical declares a different website as the preferred source.', { canonicalUrl: clip(resolvedCanonical, 1000) }))
      }
    }
  }

  if (Object.hasOwn(metadata, 'sitemapUrls')) {
    const sitemapUrls = Array.isArray(metadata.sitemapUrls)
      ? metadata.sitemapUrls.filter(value => typeof value === 'string' && value.trim())
      : []
    if (sitemapUrls.length === 0) {
      findings.push(finding('sitemap.not_discovered', 'medium', 'dealer_origin', 'Page is not associated with a sitemap',
        'The crawl provider explicitly reported no sitemap discovery evidence for this URL.',
        { providerEvidence: 'empty_sitemap_urls' }))
    }
  }

  const visibleText = `${input.title ?? ''}\n${markdown}`.slice(0, 200_000)
  if (input.httpStatus === 200 && SOFT_404_PATTERNS.some(pattern => pattern.test(visibleText))) {
    findings.push(finding('soft_404.detected', 'high', 'dealer_origin', 'Possible soft 404',
      'The page returned HTTP 200 but its visible content indicates that the vehicle or page is unavailable.',
      { httpStatus: 200, title: clip(input.title ?? '', 300) }))
  }

  const jsonLd = parseJsonLd(html)
  if (jsonLd.invalidCount > 0) {
    findings.push(finding('schema.invalid_json_ld', 'high', 'dealer_origin', 'Invalid JSON-LD detected',
      'At least one structured-data block could not be parsed as JSON.', { invalidBlocks: jsonLd.invalidCount }))
  }

  const structuredPrice = findOfferPrice(jsonLd.values)
  const visiblePrice = findVisiblePrice(markdown)
  if (structuredPrice !== null && visiblePrice !== null && Math.abs(structuredPrice - visiblePrice) >= 1) {
    findings.push(finding('schema.visible_price_mismatch', 'critical', 'dealer_origin', 'Structured price differs from visible price',
      'The Vehicle or Product offer price does not match the drive-away price shown to shoppers.',
      { structuredPrice, visiblePrice }))
  }

  for (const image of readMarkdownImages(markdown)) {
    if (!image.alt.trim()) {
      findings.push(finding('image.missing_alt', 'medium', 'dealer_origin', 'Stock image is missing alt text',
        'An image on the page has no descriptive alternative text.', { imageUrl: clip(image.url, 1000) }))
      break
    }
  }
  for (const image of readMarkdownImages(markdown)) {
    const filename = readFilename(image.url)
    if (/^(?:img|dsc|image|photo|pxl)[-_ ]?\d+/i.test(filename)) {
      findings.push(finding('image.generic_filename', 'low', 'dealer_origin', 'Stock image uses a generic filename',
        'A descriptive vehicle image filename would provide a clearer crawl signal.', { filename: clip(filename, 300) }))
      break
    }
  }

  return dedupe(findings)
}

function finding(
  checkKey: string,
  severity: SearchAuthorityTrustSeverity,
  owner: SearchAuthorityTrustOwner,
  title: string,
  summary: string,
  evidence: Record<string, string | number | boolean | null>
): SearchAuthorityTrustFindingCandidate {
  return { checkKey, severity, owner, title, summary, evidence }
}

function readMetaContent(html: string, name: string): string | null {
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const nameValue = readAttribute(tag, 'name')
    if (nameValue?.toLowerCase() === name.toLowerCase()) return readAttribute(tag, 'content')
  }
  return null
}

function readCanonicalHref(html: string): string | null {
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    const rel = readAttribute(tag, 'rel')
    if (rel?.split(/\s+/).some(value => value.toLowerCase() === 'canonical')) return readAttribute(tag, 'href')
  }
  return null
}

function readAttribute(tag: string, name: string): string | null {
  const quoted = tag.match(new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, 'i'))
  if (quoted?.[2] !== undefined) return decodeHtmlAttribute(quoted[2].trim())
  const bare = tag.match(new RegExp(`\\b${name}\\s*=\\s*([^\\s>]+)`, 'i'))
  return bare?.[1] ? decodeHtmlAttribute(bare[1].trim()) : null
}

function parseJsonLd(html: string): { values: unknown[], invalidCount: number } {
  const values: unknown[] = []
  let invalidCount = 0
  const pattern = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  for (const match of html.matchAll(pattern)) {
    if (!match[1] || match[1].length > 500_000) continue
    try {
      values.push(JSON.parse(match[1]))
    } catch {
      invalidCount += 1
    }
  }
  return { values, invalidCount }
}

function findOfferPrice(values: unknown[]): number | null {
  const queue = [...values]
  while (queue.length) {
    const value = queue.shift()
    if (Array.isArray(value)) {
      queue.push(...value)
      continue
    }
    if (!value || typeof value !== 'object') continue
    const row = value as Record<string, unknown>
    const type = String(row['@type'] ?? '').toLowerCase()
    if (type === 'offer') {
      const numeric = parseMoney(row.price ?? row.lowPrice)
      if (numeric !== null) return numeric
    }
    queue.push(...Object.values(row))
  }
  return null
}

function findVisiblePrice(markdown: string): number | null {
  const labelled = markdown.match(/\$\s*([\d,]+(?:\.\d{1,2})?)[^\n]{0,50}\bdrive[ -]?away\b/i)
  return labelled?.[1] ? parseMoney(labelled[1]) : null
}

function parseMoney(value: unknown): number | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null
  const numeric = Number(String(value).replace(/[^\d.]/g, ''))
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null
}

function readMarkdownImages(markdown: string): Array<{ alt: string, url: string }> {
  const images: Array<{ alt: string, url: string }> = []
  for (const match of markdown.matchAll(/!\[([^\]]*)\]\(([^\s)]+)(?:\s+["'][^"']*["'])?\)/g)) {
    if (match[2]) images.push({ alt: match[1] ?? '', url: match[2] })
  }
  return images.slice(0, 200)
}

function readFilename(value: string): string {
  try {
    return decodeURIComponent(new URL(value).pathname.split('/').at(-1) ?? '').replace(/\.[a-z0-9]+$/i, '')
  } catch {
    return value.split('/').at(-1)?.replace(/\.[a-z0-9]+$/i, '') ?? ''
  }
}

function resolveUrl(value: string, base: string): string | null {
  try {
    return new URL(value, base).toString()
  } catch {
    return null
  }
}

function sameOrigin(a: string, b: string): boolean {
  try {
    return new URL(a).origin === new URL(b).origin
  } catch {
    return false
  }
}

function decodeHtmlAttribute(value: string): string {
  return value.replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#39;/gi, String.fromCodePoint(39))
}

function clip(value: string, max: number): string {
  return value.slice(0, max)
}

function dedupe(findings: SearchAuthorityTrustFindingCandidate[]): SearchAuthorityTrustFindingCandidate[] {
  return Array.from(new Map(findings.map(finding => [finding.checkKey, finding])).values())
}
