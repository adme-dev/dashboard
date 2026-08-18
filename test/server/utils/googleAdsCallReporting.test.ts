import { describe, expect, it, vi } from 'vitest'

import {
  buildGoogleCallUpsert,
  buildGoogleCallViewQuery,
  GOOGLE_CALL_MAPPING_QUERY,
  googleCallSyncWindow,
  mapGoogleCallRow,
  matchGoogleCallClient,
  syncGoogleAdsCalls
} from '~~/server/utils/googleAdsCallReporting'

describe('Google Ads call_view reporting', () => {
  it('loads every direct client connection as an estate-wide account fallback', () => {
    expect(GOOGLE_CALL_MAPPING_QUERY).toContain('FROM social_connections connection')
    expect(GOOGLE_CALL_MAPPING_QUERY).toContain('connection.client_id')
    expect(GOOGLE_CALL_MAPPING_QUERY).toContain("connection.platform = 'google'")
    expect(GOOGLE_CALL_MAPPING_QUERY).toContain('ORDER BY priority ASC')
  })

  it('builds a v23-compatible call_view query without incompatible aggregate metrics', () => {
    const query = buildGoogleCallViewQuery('2026-08-01', '2026-08-17')

    expect(query).toContain('FROM call_view')
    expect(query).toContain('call_view.resource_name')
    expect(query).toContain('call_view.call_duration_seconds')
    expect(query).toContain('call_view.call_status')
    expect(query).toContain('call_view.start_call_date_time')
    expect(query).toContain('campaign.id')
    expect(query).toContain('ad_group.id')
    expect(query).toContain('customer.time_zone')
    expect(query).toContain('call_view.start_call_date_time >= \'2026-08-01\'')
    expect(query).toContain('call_view.start_call_date_time < \'2026-08-18\'')
    expect(query).not.toContain('metrics.phone_calls')
  })

  it('uses a bounded rolling default window and rejects provider windows beyond 37 months', () => {
    expect(googleCallSyncWindow({ today: '2026-08-17' })).toEqual({
      startDate: '2026-08-03',
      endDate: '2026-08-17'
    })

    expect(() => googleCallSyncWindow({
      today: '2026-08-17',
      startDate: '2023-07-16',
      endDate: '2026-08-17'
    })).toThrow('37-month')
  })

  it('maps untrusted REST rows and preserves account-local timestamps with their timezone', () => {
    expect(mapGoogleCallRow({
      callView: {
        resourceName: 'customers/1234567890/callViews/call-detail-42',
        callDurationSeconds: '93',
        callStatus: 'RECEIVED',
        callTrackingDisplayLocation: 'LANDING_PAGE',
        callerCountryCode: 'AU',
        callerAreaCode: '03',
        startCallDateTime: '2026-08-17 09:31:02',
        endCallDateTime: '2026-08-17 09:32:35',
        type: 'HIGH_END_MOBILE_SEARCH'
      },
      customer: { id: '1234567890', timeZone: 'Australia/Melbourne' },
      campaign: { id: '1001', name: 'Brand Calls' },
      adGroup: { id: '2002', name: 'Dealer phone' }
    }, 'connection-1')).toEqual({
      connectionId: 'connection-1',
      customerId: '1234567890',
      providerCallId: 'call-detail-42',
      providerResourceName: 'customers/1234567890/callViews/call-detail-42',
      clientId: null,
      campaignId: '1001',
      campaignName: 'Brand Calls',
      adGroupId: '2002',
      adGroupName: 'Dealer phone',
      status: 'RECEIVED',
      startedAt: '2026-08-17 09:31:02',
      endedAt: '2026-08-17 09:32:35',
      customerTimeZone: 'Australia/Melbourne',
      durationSeconds: 93,
      displayLocation: 'LANDING_PAGE',
      callType: 'HIGH_END_MOBILE_SEARCH',
      callerCountryCode: 'AU',
      callerAreaCode: '03'
    })
  })

  it('rejects malformed provider rows instead of persisting partial identities', () => {
    expect(() => mapGoogleCallRow({
      callView: {
        resourceName: 'not-a-call-view',
        callStatus: 'RECEIVED',
        startCallDateTime: '2026-08-17 09:31:02'
      }
    }, 'connection-1')).toThrow('resource name')

    expect(() => mapGoogleCallRow({
      callView: {
        resourceName: 'customers/123/callViews/42',
        callStatus: 'CONNECTED',
        startCallDateTime: '2026-08-17 09:31:02'
      }
    }, 'connection-1')).toThrow('call status')
  })

  it('matches exact campaign, safe regex, then account-level client mappings', () => {
    const mappings = [
      { connectionId: 'c1', campaignId: null, campaignNamePattern: null, clientId: 'account-client' },
      { connectionId: 'c1', campaignId: null, campaignNamePattern: '^Brand', clientId: 'pattern-client' },
      { connectionId: 'c1', campaignId: '1001', campaignNamePattern: null, clientId: 'exact-client' },
      { connectionId: 'c1', campaignId: null, campaignNamePattern: '[invalid', clientId: 'ignored' }
    ]

    expect(matchGoogleCallClient(mappings, 'c1', '1001', 'Brand Calls')).toBe('exact-client')
    expect(matchGoogleCallClient(mappings, 'c1', '1002', 'Brand Generic')).toBe('pattern-client')
    expect(matchGoogleCallClient(mappings, 'c1', '1003', 'Competitor')).toBe('account-client')
  })

  it('builds an idempotent upsert that refreshes mutable call status and attribution', () => {
    const statement = buildGoogleCallUpsert([{
      connectionId: 'connection-1',
      customerId: '1234567890',
      providerCallId: '42',
      providerResourceName: 'customers/1234567890/callViews/42',
      clientId: 'client-1',
      campaignId: '1001',
      campaignName: 'Brand Calls',
      adGroupId: null,
      adGroupName: null,
      status: 'RECEIVED',
      startedAt: '2026-08-17 09:31:02',
      endedAt: '2026-08-17 09:32:35',
      customerTimeZone: 'Australia/Melbourne',
      durationSeconds: 93,
      displayLocation: 'AD',
      callType: 'HIGH_END_MOBILE_SEARCH',
      callerCountryCode: 'AU',
      callerAreaCode: '03'
    }])

    expect(statement.text).toContain('ON CONFLICT (connection_id, provider_call_id)')
    expect(statement.text).toContain('status = EXCLUDED.status')
    expect(statement.text).toContain('duration_seconds = EXCLUDED.duration_seconds')
    expect(statement.text).toContain('last_synced_at = NOW()')
    expect(statement.values).toHaveLength(18)
  })

  it('syncs rows idempotently and retries a direct account without an invalid manager header', async () => {
    const execute = vi.fn(async () => 1)
    const gaql = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error('manager denied'), { status: 403 }))
      .mockResolvedValueOnce([{
        callView: {
          resourceName: 'customers/123/callViews/42',
          callDurationSeconds: '12',
          callStatus: 'MISSED',
          startCallDateTime: '2026-08-17 09:31:02'
        },
        customer: { id: '123', timeZone: 'Australia/Melbourne' },
        campaign: { id: '1001', name: 'Brand' }
      }])

    const result = await syncGoogleAdsCalls({
      today: '2026-08-17',
      runtimeConfig: {
        googleClientId: 'oauth-client',
        googleClientSecret: 'oauth-secret',
        googleDeveloperToken: 'developer-token',
        googleAdsLoginCustomerId: '999-888-7777'
      },
      deps: {
        loadConnections: async () => [{
          id: 'connection-1',
          account_id: '123',
          account_name: 'Dealer Ads',
          access_token: 'access-token',
          refresh_token: null,
          token_expires_at: null,
          metadata: {}
        }],
        loadMappings: async () => [{ connectionId: 'connection-1', campaignId: '1001', campaignNamePattern: null, clientId: 'client-1' }],
        resolveCredential: async row => ({
          accessToken: String(row.access_token),
          refreshToken: null,
          tokenExpiresAt: null,
          profileId: null,
          source: 'legacy'
        }),
        refreshToken: vi.fn(),
        persistCredentialRefresh: vi.fn(),
        gaqlQuery: gaql,
        execute
      }
    })

    expect(gaql).toHaveBeenNthCalledWith(1, '123', 'access-token', 'developer-token', expect.any(String), '9998887777')
    expect(gaql).toHaveBeenNthCalledWith(2, '123', 'access-token', 'developer-token', expect.any(String), undefined)
    expect(result).toEqual({ connectionsSynced: 1, callsUpserted: 1, errors: [] })
    expect(execute.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO google_ads_calls'))).toBe(true)
    expect(execute.mock.calls.some(([sql]) => String(sql).includes('google_ads_call_sync_state'))).toBe(true)
  })

  it('redacts provider response details and credentials from sync health errors', async () => {
    const execute = vi.fn(async () => 1)
    const result = await syncGoogleAdsCalls({
      today: '2026-08-17',
      runtimeConfig: {
        googleClientId: 'oauth-client',
        googleClientSecret: 'oauth-secret',
        googleDeveloperToken: 'developer-token',
        googleAdsLoginCustomerId: ''
      },
      deps: {
        loadConnections: async () => [{
          id: 'connection-1', account_id: '123', account_name: 'Dealer Ads',
          access_token: 'access-token', refresh_token: null, token_expires_at: null, metadata: {}
        }],
        loadMappings: async () => [],
        resolveCredential: async () => ({
          accessToken: 'access-token', refreshToken: null, tokenExpiresAt: null, profileId: null, source: 'legacy'
        }),
        refreshToken: vi.fn(),
        persistCredentialRefresh: vi.fn(),
        gaqlQuery: vi.fn().mockRejectedValue(Object.assign(
          new Error('request failed access_token=secret-value response={"private":"payload"}'),
          { status: 500 }
        )),
        execute
      }
    })

    const failureWrite = execute.mock.calls.find(([sql]) => String(sql).includes('last_error = EXCLUDED.last_error'))
    expect(result.errors[0]).toBe('Dealer Ads: Google Ads call sync failed (status 500)')
    expect(failureWrite?.[1]?.[1]).toBe(result.errors[0])
    expect(JSON.stringify({ result, failureWrite })).not.toMatch(/secret-value|private|payload|access-token/)
  })
})
