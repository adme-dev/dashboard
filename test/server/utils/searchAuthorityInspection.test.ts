import { describe, expect, it, vi } from 'vitest'
import {
  inspectPriorityUrls,
  selectInspectionCandidates
} from '~~/server/utils/searchAuthority/inspection'

const CLIENT_ID = '11111111-1111-4111-8111-111111111111'
const MAP_ID = '22222222-2222-4222-8222-222222222222'
const CONNECTION_ID = '33333333-3333-4333-8333-333333333333'

describe('Search Authority URL Inspection', () => {
  it('prioritizes changed, material, home and rotating vehicle pages with deduplication and a 50 URL cap', async () => {
    const rows = [
      { property_map_id: MAP_ID, connection_id: CONNECTION_ID, property_uri: 'sc-domain:example.com', inspected_url: 'https://example.com/used/car-1', priority_tier: 4, priority_score: 50 },
      { property_map_id: MAP_ID, connection_id: CONNECTION_ID, property_uri: 'sc-domain:example.com', inspected_url: 'https://example.com/', priority_tier: 3, priority_score: 0 },
      { property_map_id: MAP_ID, connection_id: CONNECTION_ID, property_uri: 'sc-domain:example.com', inspected_url: 'https://example.com/model', priority_tier: 2, priority_score: 90 },
      { property_map_id: MAP_ID, connection_id: CONNECTION_ID, property_uri: 'sc-domain:example.com', inspected_url: 'https://example.com/model', priority_tier: 1, priority_score: 10 },
      ...Array.from({ length: 60 }, (_, index) => ({
        property_map_id: MAP_ID,
        connection_id: CONNECTION_ID,
        property_uri: 'sc-domain:example.com',
        inspected_url: `https://example.com/used/car-${index + 2}`,
        priority_tier: 4,
        priority_score: 49 - index
      }))
    ]

    const result = await selectInspectionCandidates(CLIENT_ID, 100, {
      loadCandidates: vi.fn(async () => rows)
    })

    expect(result).toHaveLength(50)
    expect(result.slice(0, 4).map(item => item.inspectedUrl)).toEqual([
      'https://example.com/model',
      'https://example.com/',
      'https://example.com/used/car-1',
      'https://example.com/used/car-2'
    ])
    expect(result.filter(item => item.inspectedUrl === 'https://example.com/model')).toHaveLength(1)
  })

  it('persists complete indexed-version evidence and never labels it a live test', async () => {
    const persistInspection = vi.fn()
    const inspectUrl = vi.fn(async () => ({
      inspectionKind: 'indexed_version' as const,
      verdict: 'PASS',
      coverageState: 'Submitted and indexed',
      robotsTxtState: 'ALLOWED',
      indexingState: 'INDEXING_ALLOWED',
      pageFetchState: 'SUCCESSFUL',
      crawledAs: 'DESKTOP',
      lastCrawlTime: '2026-07-30T03:00:00.000Z',
      googleCanonical: 'https://example.com/model',
      userCanonical: 'https://example.com/model',
      sitemapUrls: ['https://example.com/sitemap.xml'],
      referringUrls: ['https://example.com/'],
      inspectionResultLink: 'https://search.google.com/search-console/inspect',
      providerResult: { verdict: 'PASS' }
    }))

    const result = await inspectPriorityUrls(CLIENT_ID, 1, {
      selectCandidates: vi.fn(async () => [{
        propertyMapId: MAP_ID,
        connectionId: CONNECTION_ID,
        propertyUri: 'sc-domain:example.com',
        inspectedUrl: 'https://example.com/model',
        priorityTier: 1,
        priorityScore: 10
      }]),
      resolveCredential: vi.fn(async () => ({
        connectionId: CONNECTION_ID,
        clientId: CLIENT_ID,
        googleSub: 'subject',
        email: 'search@example.com',
        scopes: [],
        accessToken: 'token',
        refreshToken: 'refresh',
        tokenExpiresAt: '2026-08-02T00:00:00.000Z',
        profileId: '44444444-4444-4444-8444-444444444444'
      })),
      inspectUrl,
      persistInspection,
      now: () => new Date('2026-08-01T00:00:00.000Z')
    })

    expect(result).toEqual({ inspected: 1, failed: 0, errors: [] })
    expect(persistInspection).toHaveBeenCalledWith(expect.objectContaining({
      clientId: CLIENT_ID,
      propertyMapId: MAP_ID,
      inspectedUrl: 'https://example.com/model',
      inspectionKind: 'indexed_version',
      verdict: 'PASS',
      coverageState: 'Submitted and indexed',
      robotsTxtState: 'ALLOWED',
      indexingState: 'INDEXING_ALLOWED',
      pageFetchState: 'SUCCESSFUL',
      googleCanonical: 'https://example.com/model',
      sitemapUrls: ['https://example.com/sitemap.xml'],
      referringUrls: ['https://example.com/']
    }))
    expect(JSON.stringify(persistInspection.mock.calls)).not.toContain('live_test')
  })

  it('rotates equal-tier vehicle pages by least-recent inspection before demand score', async () => {
    const result = await selectInspectionCandidates(CLIENT_ID, 3, {
      loadCandidates: vi.fn(async () => [
        { property_map_id: MAP_ID, connection_id: CONNECTION_ID, property_uri: 'sc-domain:example.com', inspected_url: 'https://example.com/used/recent', priority_tier: 4, priority_score: 100, last_inspected_at: '2026-07-31T00:00:00.000Z' },
        { property_map_id: MAP_ID, connection_id: CONNECTION_ID, property_uri: 'sc-domain:example.com', inspected_url: 'https://example.com/used/never', priority_tier: 4, priority_score: 20, last_inspected_at: null },
        { property_map_id: MAP_ID, connection_id: CONNECTION_ID, property_uri: 'sc-domain:example.com', inspected_url: 'https://example.com/used/old', priority_tier: 4, priority_score: 10, last_inspected_at: '2026-07-01T00:00:00.000Z' }
      ])
    })

    expect(result.map(item => item.inspectedUrl)).toEqual([
      'https://example.com/used/never',
      'https://example.com/used/old',
      'https://example.com/used/recent'
    ])
  })

  it('stops the client inspection batch when Google reports a quota limit', async () => {
    const inspectUrl = vi.fn()
      .mockRejectedValueOnce(
        Object.assign(new Error('quota exceeded'), { statusCode: 429 })
      )
    const result = await inspectPriorityUrls(CLIENT_ID, 2, {
      selectCandidates: vi.fn(async () => [
        {
          propertyMapId: MAP_ID,
          connectionId: CONNECTION_ID,
          propertyUri: 'sc-domain:example.com',
          inspectedUrl: 'https://example.com/one',
          priorityTier: 1,
          priorityScore: 10
        },
        {
          propertyMapId: MAP_ID,
          connectionId: CONNECTION_ID,
          propertyUri: 'sc-domain:example.com',
          inspectedUrl: 'https://example.com/two',
          priorityTier: 2,
          priorityScore: 9
        }
      ]),
      resolveCredential: vi.fn(async () => ({
        connectionId: CONNECTION_ID,
        clientId: CLIENT_ID,
        googleSub: 'subject',
        email: 'search@example.com',
        scopes: [],
        accessToken: 'token',
        refreshToken: 'refresh',
        tokenExpiresAt: '2026-08-02T00:00:00.000Z',
        profileId: '44444444-4444-4444-8444-444444444444'
      })),
      inspectUrl,
      now: () => new Date('2026-08-01T00:00:00.000Z')
    })

    expect(inspectUrl).toHaveBeenCalledOnce()
    expect(result).toMatchObject({ inspected: 0, failed: 1 })
  })
})
