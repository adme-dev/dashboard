import { describe, expect, it, vi } from 'vitest'

async function loadClient() {
  return import('../../../server/utils/searchAuthority/googleClient').catch(() => null)
}

describe('Search Console Google client', () => {
  it('builds a least-privilege offline OAuth request', async () => {
    const client = await loadClient()
    expect(client).not.toBeNull()

    const authUrl = new URL(client!.getSearchConsoleAuthUrl(
      'google-client',
      'https://app.xeroflow.io/api/agency/search-authority/google/callback',
      'oauth-state'
    ))

    expect(authUrl.origin + authUrl.pathname)
      .toBe('https://accounts.google.com/o/oauth2/v2/auth')
    expect(authUrl.searchParams.get('scope')).toBe(
      'openid email https://www.googleapis.com/auth/webmasters.readonly'
    )
    expect(authUrl.searchParams.get('access_type')).toBe('offline')
    expect(authUrl.searchParams.get('prompt')).toBe('consent')
    expect(authUrl.searchParams.get('scope')).not.toContain('adwords')
  })

  it('normalizes domain and URL-prefix properties without hiding permission levels', async () => {
    const client = await loadClient()
    expect(client).not.toBeNull()

    const request = vi.fn(async () => ({
      siteEntry: [
        { siteUrl: 'sc-domain:example.com', permissionLevel: 'siteOwner' },
        { siteUrl: 'https://www.example.com/', permissionLevel: 'siteRestrictedUser' }
      ]
    }))

    await expect(client!.listSearchConsoleProperties('access-token', { request }))
      .resolves.toEqual([
        {
          propertyUri: 'sc-domain:example.com',
          propertyType: 'domain',
          permissionLevel: 'siteOwner'
        },
        {
          propertyUri: 'https://www.example.com/',
          propertyType: 'url_prefix',
          permissionLevel: 'siteRestrictedUser'
        }
      ])
  })

  it('paginates Search Analytics at 25,000 rows and preserves incomplete-data metadata', async () => {
    const client = await loadClient()
    expect(client).not.toBeNull()

    const firstPage = Array.from({ length: 25_000 }, (_, index) => ({
      keys: [`query-${index}`, `https://example.com/${index}`],
      clicks: 1,
      impressions: 10,
      ctr: 0.1,
      position: 5
    }))
    const request = vi.fn(async (_url: string, options: { body: { startRow: number } }) =>
      options.body.startRow === 0
        ? {
            rows: firstPage,
            responseAggregationType: 'byPage',
            metadata: { first_incomplete_date: '2026-07-30' }
          }
        : {
            rows: [{
              keys: ['last-query', 'https://example.com/last'],
              clicks: 2,
              impressions: 20,
              ctr: 0.1,
              position: 4
            }],
            responseAggregationType: 'byPage',
            metadata: { first_incomplete_date: '2026-07-30' }
          })

    const result = await client!.querySearchAnalytics(
      'access-token',
      'sc-domain:example.com',
      {
        startDate: '2026-07-30',
        endDate: '2026-07-30',
        dimensions: ['query', 'page'],
        dataState: 'all'
      },
      { request }
    )

    expect(result.rows).toHaveLength(25_001)
    expect(result.firstIncompleteDate).toBe('2026-07-30')
    expect(result.responseAggregationType).toBe('byPage')
    expect(result.truncated).toBe(false)
    expect(request).toHaveBeenNthCalledWith(
      1,
      'https://www.googleapis.com/webmasters/v3/sites/sc-domain%3Aexample.com/searchAnalytics/query',
      expect.objectContaining({
        timeout: 20_000,
        body: expect.objectContaining({ rowLimit: 25_000, startRow: 0 })
      })
    )
    expect(request).toHaveBeenNthCalledWith(
      2,
      expect.any(String),
      expect.objectContaining({
        body: expect.objectContaining({ rowLimit: 25_000, startRow: 25_000 })
      })
    )
  })

  it('parses indexed-version URL Inspection evidence', async () => {
    const client = await loadClient()
    expect(client).not.toBeNull()

    const request = vi.fn(async () => ({
      inspectionResult: {
        inspectionResultLink: 'https://search.google.com/search-console/inspect',
        indexStatusResult: {
          verdict: 'PASS',
          coverageState: 'Submitted and indexed',
          robotsTxtState: 'ALLOWED',
          indexingState: 'INDEXING_ALLOWED',
          pageFetchState: 'SUCCESSFUL',
          lastCrawlTime: '2026-07-29T10:00:00Z',
          googleCanonical: 'https://example.com/model',
          userCanonical: 'https://example.com/model',
          sitemap: ['https://example.com/sitemap.xml'],
          referringUrls: ['https://example.com/']
        }
      }
    }))

    const result = await client!.inspectSearchConsoleUrl(
      'access-token',
      'sc-domain:example.com',
      'https://example.com/model',
      { request }
    )

    expect(result).toMatchObject({
      inspectionKind: 'indexed_version',
      verdict: 'PASS',
      coverageState: 'Submitted and indexed',
      pageFetchState: 'SUCCESSFUL',
      googleCanonical: 'https://example.com/model',
      sitemapUrls: ['https://example.com/sitemap.xml']
    })
    expect(request).toHaveBeenCalledWith(
      'https://searchconsole.googleapis.com/v1/urlInspection/index:inspect',
      expect.objectContaining({
        timeout: 20_000,
        body: {
          inspectionUrl: 'https://example.com/model',
          siteUrl: 'sc-domain:example.com',
          languageCode: 'en-AU'
        }
      })
    )
  })
})
