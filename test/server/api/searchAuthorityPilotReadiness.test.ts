import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  deriveSearchAuthorityPilotReadiness,
  getSearchAuthorityPilotReadiness
} from '~~/server/utils/searchAuthority/pilotReadiness'

const CLIENT_ID = '11111111-1111-4111-8111-111111111111'

const mocks = vi.hoisted(() => ({
  query: { clientId: '11111111-1111-4111-8111-111111111111' } as Record<string, unknown>,
  requireAccess: vi.fn(),
  queryOne: vi.fn()
}))

vi.mock('~~/server/utils/searchAuthority/access', () => ({
  requireAgencySearchAuthorityAccess: mocks.requireAccess
}))
vi.mock('h3', () => ({
  getQuery: () => mocks.query
}))
vi.mock('~~/server/utils/db', () => ({
  queryOne: mocks.queryOne
}))

vi.stubGlobal('eventHandler', (handler: unknown) => handler)

describe('Search Authority pilot readiness', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.query = { clientId: CLIENT_ID }
    mocks.requireAccess.mockResolvedValue({ id: 'owner-1', role: 'owner' })
  })

  it('reports production blockers without exposing provider credentials or raw errors', () => {
    const result = deriveSearchAuthorityPilotReadiness(CLIENT_ID, {
      siteId: '22222222-2222-4222-8222-222222222222',
      siteStatus: 'active',
      canonicalHostname: 'www.knoxgwmhaval.com.au',
      contentHostname: null,
      activeConnectionCount: 0,
      activePropertyMapCount: 0,
      baselineCompletedAt: null,
      dataThroughDate: null,
      ownedDomainCount: 1,
      competitorDomainCount: 1,
      latestOwnedRunStatus: 'failed',
      latestOwnedRunPages: 0,
      latestOwnedRunAt: '2026-08-02T08:07:30.000Z',
      latestOwnedRunErrorCategory: 'browser_run',
      latestCompetitorRunStatus: null,
      latestCompetitorRunPages: 0,
      latestCompetitorRunAt: null,
      latestCompetitorRunErrorCategory: null,
      activeGoogleBusinessCount: 0,
      healthyGoogleBusinessCount: 0
    })

    expect(result.coreReady).toBe(false)
    expect(result.gates.site).toMatchObject({
      state: 'ready',
      reasonCode: null
    })
    expect(result.gates.searchConsole).toMatchObject({
      state: 'not_started',
      reasonCode: 'search_console_not_connected'
    })
    expect(result.gates.ownedCollection).toMatchObject({
      state: 'blocked',
      reasonCode: 'browser_rendering_failed',
      evidenceAt: '2026-08-02T08:07:30.000Z'
    })
    expect(result.gates.competitorCollection).toMatchObject({
      state: 'not_started',
      reasonCode: 'competitor_crawl_not_run'
    })
    expect(result.gates.contentPublisher).toMatchObject({
      state: 'not_started',
      reasonCode: 'content_hostname_not_configured'
    })
    expect(result.gates.googleBusiness).toMatchObject({
      state: 'unavailable',
      reasonCode: 'google_business_not_connected'
    })
    expect(JSON.stringify(result)).not.toMatch(/token|credential|error summary/i)
  })

  it('requires completed evidence rather than treating configured integrations as ready', () => {
    const result = deriveSearchAuthorityPilotReadiness(CLIENT_ID, {
      siteId: '22222222-2222-4222-8222-222222222222',
      siteStatus: 'active',
      canonicalHostname: 'www.knoxgwmhaval.com.au',
      contentHostname: 'learn.knoxgwmhaval.com.au',
      activeConnectionCount: 1,
      activePropertyMapCount: 1,
      baselineCompletedAt: null,
      dataThroughDate: null,
      ownedDomainCount: 1,
      competitorDomainCount: 1,
      latestOwnedRunStatus: 'completed',
      latestOwnedRunPages: 25,
      latestOwnedRunAt: '2026-08-03T00:00:00.000Z',
      latestOwnedRunErrorCategory: null,
      latestCompetitorRunStatus: 'partial',
      latestCompetitorRunPages: 12,
      latestCompetitorRunAt: '2026-08-03T01:00:00.000Z',
      latestCompetitorRunErrorCategory: null,
      activeGoogleBusinessCount: 1,
      healthyGoogleBusinessCount: 1
    })

    expect(result.gates.searchConsole).toMatchObject({
      state: 'blocked',
      reasonCode: 'search_console_baseline_incomplete'
    })
    expect(result.gates.ownedCollection.state).toBe('ready')
    expect(result.gates.competitorCollection.state).toBe('ready')
    expect(result.gates.contentPublisher).toMatchObject({
      state: 'blocked',
      reasonCode: 'content_publisher_not_verified'
    })
    expect(result.gates.googleBusiness.state).toBe('ready')
    expect(result.coreReady).toBe(false)
  })

  it('normalizes database counts and returns a safe default when evidence is absent', async () => {
    const seenClientIds: string[] = []
    const result = await getSearchAuthorityPilotReadiness(CLIENT_ID, {
      querySnapshot: async (clientId) => {
        seenClientIds.push(clientId)
        return {
          site_id: null,
          site_status: null,
          canonical_hostname: null,
          content_hostname: null,
          active_connection_count: '0',
          active_property_map_count: '0',
          baseline_completed_at: null,
          data_through_date: null,
          owned_domain_count: '0',
          competitor_domain_count: '0',
          latest_owned_run_status: null,
          latest_owned_run_pages: null,
          latest_owned_run_at: null,
          latest_owned_run_error_category: null,
          latest_competitor_run_status: null,
          latest_competitor_run_pages: null,
          latest_competitor_run_at: null,
          latest_competitor_run_error_category: null,
          active_google_business_count: '0',
          healthy_google_business_count: '0'
        }
      }
    })

    expect(seenClientIds).toEqual([CLIENT_ID])
    expect(result.gates.site.reasonCode).toBe('search_authority_site_not_active')
    expect(result.gates.ownedCollection.reasonCode).toBe('owned_domain_not_configured')
    expect(result.gates.competitorCollection.reasonCode).toBe('competitor_domain_not_configured')
  })

  it('requires client access and returns the tenant-scoped readiness contract', async () => {
    mocks.queryOne.mockResolvedValue({
      site_id: '22222222-2222-4222-8222-222222222222',
      site_status: 'active',
      canonical_hostname: 'www.knoxgwmhaval.com.au',
      content_hostname: null,
      active_connection_count: '0',
      active_property_map_count: '0',
      baseline_completed_at: null,
      data_through_date: null,
      owned_domain_count: '1',
      competitor_domain_count: '1',
      latest_owned_run_status: 'failed',
      latest_owned_run_pages: '0',
      latest_owned_run_at: '2026-08-02T08:07:30.000Z',
      latest_owned_run_error_category: 'browser_run',
      latest_competitor_run_status: null,
      latest_competitor_run_pages: null,
      latest_competitor_run_at: null,
      latest_competitor_run_error_category: null,
      active_google_business_count: '0',
      healthy_google_business_count: '0'
    })
    const handler = (await import(
      '~~/server/api/agency/search-authority/pilot-readiness.get'
    )).default

    const result = await handler({} as never)

    expect(mocks.requireAccess).toHaveBeenCalledWith(expect.anything(), CLIENT_ID)
    expect(result.clientId).toBe(CLIENT_ID)
    expect(result.gates.ownedCollection.reasonCode).toBe('browser_rendering_failed')
    expect(JSON.stringify(result)).not.toMatch(/token|credential|error summary/i)
  })
})
