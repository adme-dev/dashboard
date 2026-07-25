import { describe, it, expect, vi } from 'vitest'
import { normalizeFacebookAdsLibraryPayload, facebookAdsLibrarySource } from '~~/server/utils/socialListening/sources/facebookAdsLibrary'
import { LISTENING_SOURCES } from '~~/server/utils/socialListening/sources/registry'

const PAYLOAD = {
  success: true,
  credits_remaining: 99,
  searchResults: [
    {
      ad_archive_id: '1679071556481131',
      page_name: 'Nissan',
      page_id: '12345',
      is_active: true,
      start_date: 1782864000,
      end_date: 0,
      publisher_platform: ['FACEBOOK', 'INSTAGRAM'],
      collation_count: 2,
      targeted_or_reached_countries: ['AU'],
      snapshot: {
        body: { text: 'Take charge in the all-electric Nissan ARIYA.' },
        title: 'All-electric Nissan ARIYA',
        caption: 'NISSAN.COM.AU',
        cta_text: 'Learn More',
        display_format: 'VIDEO',
        link_url: 'https://www.nissan.com.au/vehicles/browse-range/ariya.html',
        current_page_name: 'Nissan',
        cards: [],
      },
    },
    { ad_archive_id: '', page_name: 'Missing id ad' },
  ],
}

describe('normalizeFacebookAdsLibraryPayload', () => {
  it('maps ScrapeCreators search entries to RawMention and keeps only entries with ids', () => {
    const out = normalizeFacebookAdsLibraryPayload(PAYLOAD)
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({
      source: 'facebook_ads_library',
      externalId: '1679071556481131',
      url: 'https://www.facebook.com/ads/library/?id=1679071556481131',
      author: 'Nissan',
      title: 'All-electric Nissan ARIYA',
      content: expect.stringContaining('Take charge in the all-electric Nissan ARIYA.'),
      publishedAt: '2026-07-01T00:00:00.000Z',
    })
    expect(out[0].raw).toMatchObject({
      provider: 'scrapecreators',
      page_id: '12345',
      ad_active_status: 'ACTIVE',
      publisher_platforms: ['FACEBOOK', 'INSTAGRAM'],
      countries: ['AU'],
    })
  })

  it('returns [] for malformed payloads', () => {
    expect(normalizeFacebookAdsLibraryPayload(null)).toEqual([])
    expect(normalizeFacebookAdsLibraryPayload({})).toEqual([])
    expect(normalizeFacebookAdsLibraryPayload({ searchResults: [] })).toEqual([])
  })
})

describe('facebookAdsLibrarySource', () => {
  it('is registered as a listening source', () => {
    expect(LISTENING_SOURCES).toContain(facebookAdsLibrarySource)
  })

  it('is disabled without a ScrapeCreators API key', () => {
    expect(facebookAdsLibrarySource.isEnabled({})).toBe(false)
    expect(facebookAdsLibrarySource.isEnabled({ SCRAPE_CREATORS_API_KEY: ' ' })).toBe(false)
  })

  it('searches active Australian commercial ads without putting the API key in the URL', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => PAYLOAD })) as unknown as typeof fetch
    await facebookAdsLibrarySource.search({
      terms: ['nissan', 'australia'],
      limit: 25,
      fetchImpl,
      env: {
        SCRAPE_CREATORS_API_KEY: 'secret-key',
        FACEBOOK_AD_LIBRARY_COUNTRIES: 'AU',
      },
    })

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [calledUrl, options] = (fetchImpl as any).mock.calls[0]
    const url = new URL(String(calledUrl))
    expect(`${url.origin}${url.pathname}`).toBe('https://api.scrapecreators.com/v1/facebook/adLibrary/search/ads')
    expect(url.searchParams.get('query')).toBe('nissan australia')
    expect(url.searchParams.get('country')).toBe('AU')
    expect(url.searchParams.get('status')).toBe('ACTIVE')
    expect(url.searchParams.get('sort_by')).toBe('total_impressions')
    expect(url.searchParams.get('ad_type')).toBe('all')
    expect(String(calledUrl)).not.toContain('secret-key')
    expect(options.headers['x-api-key']).toBe('secret-key')
  })

  it('returns [] on empty queries, missing credentials, or failed fetches', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, json: async () => ({}) })) as unknown as typeof fetch
    expect(await facebookAdsLibrarySource.search({
      terms: [],
      limit: 25,
      fetchImpl,
      env: { SCRAPE_CREATORS_API_KEY: 'key' },
    })).toEqual([])
    expect(await facebookAdsLibrarySource.search({
      terms: ['nissan'],
      limit: 25,
      fetchImpl,
      env: {},
    })).toEqual([])
    expect(await facebookAdsLibrarySource.search({
      terms: ['nissan'],
      limit: 25,
      fetchImpl,
      env: { SCRAPE_CREATORS_API_KEY: 'key' },
    })).toEqual([])
  })
})
