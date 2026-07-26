/**
 * Diagnostic tool for onboarding a new dealer site: given a real page URL,
 * fetch it server-side and report whether/why the tracking tag's
 * vehicle-page detection would fire — before ever installing the tag.
 *
 * POST /api/agency/tracking/:id/test-url  { url: string }
 */
import { queryOne } from '~~/server/utils/db'
import { requireSiteTrackingAccess } from '~~/server/utils/tracking/analytics-access'
import { validateCatalogFeedUrl, CatalogFeedError } from '~~/server/utils/crm/catalogFeed'
import { VEHICLE_PAGE_PATTERNS, matchesVehiclePatterns, extractStockNumber } from '~~/server/utils/tracking/vehicle-patterns'

const MAX_PAGE_BYTES = 2 * 1024 * 1024
const JSON_LD_RE = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
const OG_TAG_RE = /<meta[^>]+property=["']og:([a-z:_-]+)["'][^>]+content=["']([^"']*)["'][^>]*>/gi

function extractVehicleJsonLd(html: string): Record<string, unknown> | null {
  let match: RegExpExecArray | null
  JSON_LD_RE.lastIndex = 0
  while ((match = JSON_LD_RE.exec(html))) {
    try {
      const parsed = JSON.parse(match[1]!.trim())
      const candidates = Array.isArray(parsed?.['@graph']) ? parsed['@graph'] : [parsed]
      for (const node of candidates) {
        const type = node?.['@type']
        if (type === 'Vehicle' || type === 'Car' || type === 'Product') {
          return node
        }
      }
    } catch {
      /* ignore malformed block */
    }
  }
  return null
}

function extractOgTags(html: string): Record<string, string> {
  const tags: Record<string, string> = {}
  let match: RegExpExecArray | null
  OG_TAG_RE.lastIndex = 0
  while ((match = OG_TAG_RE.exec(html))) {
    tags[match[1]!] = match[2]!
  }
  return tags
}

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  await requireSiteTrackingAccess(event, id)
  const body = await readBody<{ url?: string }>(event)

  let url: string
  try {
    url = validateCatalogFeedUrl(body?.url)
  } catch (err) {
    if (err instanceof CatalogFeedError) {
      throw createError({ statusCode: 422, statusMessage: err.message })
    }
    throw err
  }

  const site = await queryOne<{ vehicle_page_patterns: string[] | null }>(
    `SELECT vehicle_page_patterns FROM tracking_sites WHERE id = $1`,
    [id]
  )
  if (!site) throw createError({ statusCode: 404, statusMessage: 'Site not found' })
  const customPatterns = site.vehicle_page_patterns ?? []

  const pathname = new URL(url).pathname
  const patternMatch = matchesVehiclePatterns(pathname, customPatterns)
  const stockNumber = extractStockNumber(pathname)

  let html = ''
  let fetchError: string | null = null
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      headers: { 'User-Agent': 'XeroFlowTrackingDiagnostic/1.0 (+onboarding test)' }
    })
    if (!res.ok) {
      fetchError = `Page responded HTTP ${res.status}`
    } else {
      const buf = await res.arrayBuffer()
      if (buf.byteLength > MAX_PAGE_BYTES) {
        fetchError = 'Page too large to analyze (over 2MB)'
      } else {
        html = new TextDecoder('utf-8').decode(buf)
      }
    }
  } catch (err) {
    fetchError = err instanceof Error ? err.message : 'Fetch failed'
  }

  const jsonLd = html ? extractVehicleJsonLd(html) : null
  const ogTags = html ? extractOgTags(html) : {}

  return {
    url,
    pathname,
    wouldDetectAsVehiclePage: patternMatch.matched || Boolean(stockNumber) || Boolean(jsonLd),
    matchedUrlPattern: patternMatch.pattern,
    stockNumber,
    vehicleJsonLd: jsonLd,
    ogTags,
    fetchError,
    builtInPatterns: VEHICLE_PAGE_PATTERNS,
    configuredPatterns: customPatterns,
    recommendation: fetchError
      ? null
      : patternMatch.matched || stockNumber
        ? null
        : jsonLd
          ? 'URL pattern didn\'t match, but this page has Vehicle/Car/Product JSON-LD — detection will still work via structured data.'
          : 'No URL pattern, stock-number suffix, or Vehicle/Car/Product JSON-LD found. Add a custom pattern for this site\'s URL convention, or ask the dealer\'s web team to add Vehicle schema markup.'
  }
})
