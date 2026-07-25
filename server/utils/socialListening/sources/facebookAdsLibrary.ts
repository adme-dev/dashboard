// Facebook Ads Library listener source.
// Commercial ads outside the UK/EU are collected from the public Ad Library
// through ScrapeCreators because Meta's official API does not expose them.
import { safePublicUrl } from '~~/app/utils/safe-url'
import type { ListeningSource, SourceSearchInput } from '~~/server/utils/socialListening/sources/types'
import type { RawMention } from '~~/server/utils/socialListening/types'

const SCRAPE_CREATORS_SEARCH_URL = 'https://api.scrapecreators.com/v1/facebook/adLibrary/search/ads'

function toSearchTerms(terms: string[]): string {
  return terms.join(' ').trim().slice(0, 100)
}

function normalizeCountry(raw: string | undefined): string {
  const country = raw?.split(',')[0]?.trim().toUpperCase()
  return country && (/^[A-Z]{2}$/.test(country) || country === 'ALL') ? country : 'AU'
}

function toIsoDate(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    const milliseconds = value < 10_000_000_000 ? value * 1000 : value
    return new Date(milliseconds).toISOString()
  }
  if (typeof value !== 'string' || !value.trim()) return null
  const milliseconds = Date.parse(value)
  return Number.isNaN(milliseconds) ? null : new Date(milliseconds).toISOString()
}

function textValue(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (value && typeof value === 'object' && typeof (value as Record<string, unknown>).text === 'string') {
    return String((value as Record<string, unknown>).text).trim()
  }
  return ''
}

function normalizeContent(ad: Record<string, any>): string {
  const snapshot = ad.snapshot && typeof ad.snapshot === 'object' ? ad.snapshot : {}
  const values = [
    snapshot.body,
    snapshot.title,
    snapshot.caption,
    snapshot.link_description,
    ...(Array.isArray(snapshot.cards)
      ? snapshot.cards.flatMap((card: Record<string, any>) => [
          card?.body,
          card?.title,
          card?.link_description,
          card?.caption,
        ])
      : []),
  ]
  return [...new Set(values.map(textValue).filter(Boolean))].join('\n\n')
}

function normalizeTitle(ad: Record<string, any>): string | null {
  const snapshot = ad.snapshot && typeof ad.snapshot === 'object' ? ad.snapshot : {}
  const cardTitles = Array.isArray(snapshot.cards)
    ? snapshot.cards.map((card: Record<string, any>) => card?.title)
    : []
  const candidates = [
    snapshot.title,
    ...cardTitles,
    snapshot.cta_text,
    snapshot.body,
    ad.page_name,
  ]
  for (const value of candidates) {
    const candidate = textValue(value)
    if (candidate) return candidate
  }
  return null
}

/** Parse a ScrapeCreators Ad Library search response into RawMentions. */
export function normalizeFacebookAdsLibraryPayload(payload: any): RawMention[] {
  const items = payload?.searchResults
  if (!Array.isArray(items)) return []

  const out: RawMention[] = []
  for (const ad of items) {
    const externalId = ad?.ad_archive_id ?? ad?.adArchiveID
    if (!externalId) continue

    const snapshot = ad.snapshot && typeof ad.snapshot === 'object' ? ad.snapshot : {}
    const snapshotUrl = `https://www.facebook.com/ads/library/?id=${encodeURIComponent(String(externalId))}`
    const url = safePublicUrl(ad.url) ?? safePublicUrl(snapshotUrl) ?? null
    const publishedAt = toIsoDate(
      ad.start_date
      ?? ad.startDate
      ?? ad.start_date_string
      ?? ad.startDateString,
    )

    out.push({
      source: 'facebook_ads_library',
      externalId: String(externalId),
      url,
      author: typeof ad.page_name === 'string' && ad.page_name.trim()
        ? ad.page_name.trim()
        : textValue(snapshot.current_page_name) || null,
      title: normalizeTitle(ad),
      content: normalizeContent(ad),
      lang: typeof ad.language === 'string' && ad.language.trim() ? ad.language.trim() : null,
      publishedAt,
      raw: {
        provider: 'scrapecreators',
        id: String(externalId),
        page_id: ad.page_id,
        ad_active_status: ad.is_active === false ? 'INACTIVE' : 'ACTIVE',
        media_type: snapshot.display_format,
        publisher_platforms: ad.publisher_platform,
        snapshot_url: snapshotUrl,
        cta_text: snapshot.cta_text,
        link_url: safePublicUrl(snapshot.link_url) ?? null,
        collation_count: ad.collation_count,
        impressions: ad.impressions_with_index,
        reach: ad.reach_estimate,
        countries: ad.targeted_or_reached_countries,
        delivery_dates: {
          start: publishedAt,
          stop: toIsoDate(ad.end_date ?? ad.endDate ?? ad.end_date_string ?? ad.endDateString),
        },
      },
    })
  }

  return out
}

export const facebookAdsLibrarySource: ListeningSource = {
  key: 'facebook_ads_library',
  isEnabled: (env) => !!env.SCRAPE_CREATORS_API_KEY?.trim(),
  async search({ terms, limit, fetchImpl, env }: SourceSearchInput): Promise<RawMention[]> {
    const query = toSearchTerms(terms)
    const apiKey = env.SCRAPE_CREATORS_API_KEY?.trim()
    if (!query || !apiKey) return []

    const qs = new URLSearchParams({
      query,
      sort_by: 'total_impressions',
      search_type: 'keyword_unordered',
      ad_type: 'all',
      country: normalizeCountry(env.FACEBOOK_AD_LIBRARY_COUNTRIES),
      status: 'ACTIVE',
      media_type: 'ALL',
    })

    let response: Response
    try {
      response = await fetchImpl(`${SCRAPE_CREATORS_SEARCH_URL}?${qs.toString()}`, {
        headers: {
          accept: 'application/json',
          'x-api-key': apiKey,
        },
      })
    } catch {
      return []
    }
    if (!response.ok) return []

    const payload = await response.json()
    if (payload?.success === false) return []
    return normalizeFacebookAdsLibraryPayload(payload)
      .slice(0, Math.max(1, Math.min(limit, 100)))
  },
}
