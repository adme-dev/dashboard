import { describe, it, expect, vi } from 'vitest'

// googleBusiness.ts talks to Google via ofetch — stub it so discovery never hits the network.
const { ofetchSpy } = vi.hoisted(() => ({ ofetchSpy: vi.fn() }))
vi.mock('ofetch', () => ({ ofetch: ofetchSpy }))

import {
  buildGoogleBusinessAuthUrl,
  mapGoogleBusinessLocationsToAccountRows,
  discoverGoogleBusinessLocations,
  getGoogleBusinessDiscoveryErrorReason,
  GOOGLE_BUSINESS_SCOPE,
  type GoogleBusinessLocationSelection
} from '~~/server/utils/socialOAuth/googleBusiness'

describe('buildGoogleBusinessAuthUrl', () => {
  it('requests offline access + consent for the business.manage scope', () => {
    const url = new URL(buildGoogleBusinessAuthUrl('cid.apps.googleusercontent.com', 'https://app.xeroflow.io/cb', 'STATE'))
    expect(`${url.origin}${url.pathname}`).toBe('https://accounts.google.com/o/oauth2/v2/auth')
    const p = url.searchParams
    expect(p.get('client_id')).toBe('cid.apps.googleusercontent.com')
    expect(p.get('redirect_uri')).toBe('https://app.xeroflow.io/cb')
    expect(p.get('state')).toBe('STATE')
    expect(p.get('scope')).toBe(GOOGLE_BUSINESS_SCOPE)
    expect(p.get('response_type')).toBe('code')
    // offline + consent are what get us a refresh_token back (the publish path relies on it)
    expect(p.get('access_type')).toBe('offline')
    expect(p.get('prompt')).toBe('consent')
  })
})

describe('mapGoogleBusinessLocationsToAccountRows', () => {
  const locations: GoogleBusinessLocationSelection[] = [{
    id: 'acc1:loc1',
    name: 'Downtown Store',
    accountId: 'acc1',
    accountName: 'Acme',
    locationId: 'loc1',
    locationResourceName: 'accounts/acc1/locations/loc1',
    address: '1 Main St'
  }]

  it('maps to a google-business AccountRow carrying the account/location metadata the publish path needs', () => {
    const rows = mapGoogleBusinessLocationsToAccountRows(locations, 'AT', 'RT', '2026-01-01T00:00:00.000Z')
    expect(rows).toHaveLength(1)
    const r = rows[0]!
    expect(r.platform).toBe('google-business')
    expect(r.platform_account_id).toBe('acc1:loc1') // composite id resolvePublishTarget splits on ':'
    expect(r.account_name).toBe('Downtown Store')
    expect(r.access_token).toBe('AT')
    expect(r.refresh_token).toBe('RT')
    expect(r.token_expires_at).toBe('2026-01-01T00:00:00.000Z')
    expect(r.metadata).toMatchObject({
      googleBusinessAccountId: 'acc1',
      googleBusinessAccountName: 'Acme',
      googleBusinessLocationId: 'loc1',
      googleBusinessLocationName: 'accounts/acc1/locations/loc1',
      address: '1 Main St'
    })
  })

  it('preserves a null refresh token / expiry rather than inventing values', () => {
    const rows = mapGoogleBusinessLocationsToAccountRows(locations, 'AT', null, null)
    expect(rows[0]!.refresh_token).toBeNull()
    expect(rows[0]!.token_expires_at).toBeNull()
  })
})

describe('discoverGoogleBusinessLocations', () => {
  it('flattens accounts → locations into composite-id selections with a formatted address', async () => {
    ofetchSpy.mockImplementation(async (url: string) => {
      if (url.includes('/accounts') && !url.includes('/locations')) {
        return { accounts: [{ name: 'accounts/acc1', accountName: 'Acme' }] }
      }
      return {
        locations: [{
          name: 'accounts/acc1/locations/loc1',
          title: 'Downtown',
          storefrontAddress: {
            addressLines: ['1 Main St'],
            locality: 'Townsville',
            administrativeArea: 'QLD',
            postalCode: '4000',
            regionCode: 'AU'
          }
        }]
      }
    })

    const sel = await discoverGoogleBusinessLocations('AT')
    expect(sel).toHaveLength(1)
    expect(sel[0]).toMatchObject({
      id: 'acc1:loc1',
      accountId: 'acc1',
      accountName: 'Acme',
      locationId: 'loc1',
      name: 'Downtown',
      address: '1 Main St, Townsville, QLD, 4000, AU'
    })
  })

  it('skips an account whose locations call fails — one bad account does not sink discovery', async () => {
    ofetchSpy.mockImplementation(async (url: string) => {
      if (url.includes('/locations')) throw new Error('403 PERMISSION_DENIED')
      return { accounts: [{ name: 'accounts/acc1', accountName: 'Acme' }] }
    })
    const sel = await discoverGoogleBusinessLocations('AT')
    expect(sel).toEqual([])
  })
})

describe('getGoogleBusinessDiscoveryErrorReason', () => {
  it('classifies quota-zero / access-not-approved responses separately from generic location failures', () => {
    expect(getGoogleBusinessDiscoveryErrorReason({
      statusCode: 429,
      data: { error: { status: 'RESOURCE_EXHAUSTED', message: "Quota exceeded for quota metric 'Requests'." } }
    })).toBe('google_business_api_access_not_approved')
  })

  it('classifies disabled API responses', () => {
    expect(getGoogleBusinessDiscoveryErrorReason({
      statusCode: 403,
      data: { error: { status: 'PERMISSION_DENIED', message: 'My Business Account Management API has not been used in project before or it is disabled.' } }
    })).toBe('google_business_api_disabled')
  })

  it('keeps unknown discovery errors generic', () => {
    expect(getGoogleBusinessDiscoveryErrorReason(new Error('socket closed'))).toBe('location_list_failed')
  })
})
