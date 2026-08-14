import { describe, expect, it, vi } from 'vitest'

import { readGoogleMerchantReadiness } from '../../../server/utils/googleMerchantReadiness'

const identity = {
  tenantId: 'tenant-geelong',
  clientId: 'ef849136-7368-4650-bf89-853cbfa6a24a',
  connectionId: '87d6e44f-e6a0-47d1-9a32-27ade143b538',
  customerId: '7979828031'
}

describe('Google Merchant readiness discovery', () => {
  it('derives the exact Merchant account from the scoped Ads product link and inspects its data sources', async () => {
    const loadConnection = vi.fn().mockResolvedValue({
      id: identity.connectionId,
      clientId: identity.clientId,
      status: 'active',
      customerId: identity.customerId,
      accessToken: 'access-token',
      developerToken: 'developer-token',
      loginCustomerId: '5250473322'
    })
    const queryAds = vi.fn().mockResolvedValue([{
      productLink: {
        type: 'MERCHANT_CENTER',
        productLinkId: '123456789',
        merchantCenter: { merchantCenterId: '5507471616' }
      }
    }])
    const listDataSources = vi.fn().mockResolvedValue([{
      name: 'accounts/5507471616/dataSources/101',
      displayName: 'Geelong GWM HAVAL Vehicles',
      inputType: 'API',
      writableByApi: true,
      primaryProductDataSource: {
        legacyLocal: true,
        feedLabel: 'AU',
        contentLanguage: 'en',
        destinations: [{ destination: 'VEHICLE_ADS', state: 'ENABLED' }]
      }
    }])
    const listCredentialBindings = vi.fn().mockResolvedValue([{
      profileId: '906883f9-8cf3-4cfa-a98e-a044b703bf8c',
      merchantAccountId: '5507471616',
      registrationAccountId: '551257489',
      developerEmail: 'advertising@adme.net.au'
    }])
    const loadMerchantCredential = vi.fn().mockResolvedValue({
      profileId: '906883f9-8cf3-4cfa-a98e-a044b703bf8c',
      accessToken: 'merchant-access-token',
      registrationAccountId: '551257489'
    })

    const result = await readGoogleMerchantReadiness(identity, {
      loadConnection,
      queryAds,
      listDataSources,
      listCredentialBindings,
      loadMerchantCredential
    })

    expect(queryAds).toHaveBeenCalledWith(expect.objectContaining({
      id: identity.connectionId,
      customerId: identity.customerId
    }), expect.stringMatching(/product_link\.merchant_center\.merchant_center_id/))
    expect(loadMerchantCredential).toHaveBeenCalledWith({
      profileId: '906883f9-8cf3-4cfa-a98e-a044b703bf8c',
      merchantAccountId: '5507471616',
      developerEmail: 'advertising@adme.net.au'
    })
    expect(listDataSources).toHaveBeenCalledWith('5507471616', 'merchant-access-token')
    expect(result).toEqual({
      customerId: identity.customerId,
      linkStatus: 'verified',
      merchantAccounts: [{
        merchantAccountId: '5507471616',
        productLinkId: '123456789',
        readAccess: 'verified',
        credentialBinding: {
          profileId: '906883f9-8cf3-4cfa-a98e-a044b703bf8c',
          registrationAccountId: '551257489',
          developerEmail: 'advertising@adme.net.au'
        },
        dataSources: [{
          name: 'accounts/5507471616/dataSources/101',
          displayName: 'Geelong GWM HAVAL Vehicles',
          inputType: 'API',
          writableByApi: true,
          feedLabel: 'AU',
          contentLanguage: 'en',
          destinations: [{ destination: 'VEHICLE_ADS', state: 'ENABLED' }]
        }]
      }],
      readyForCatalogBinding: true,
      readyForPublication: true
    })
  })

  it('fails closed when Ads has no unique Merchant Center link', async () => {
    const result = await readGoogleMerchantReadiness(identity, {
      loadConnection: vi.fn().mockResolvedValue({
        id: identity.connectionId,
        clientId: identity.clientId,
        status: 'active',
        customerId: identity.customerId,
        accessToken: 'access-token',
        developerToken: 'developer-token'
      }),
      queryAds: vi.fn().mockResolvedValue([]),
      listDataSources: vi.fn(),
      listCredentialBindings: vi.fn().mockResolvedValue([])
    })

    expect(result).toMatchObject({
      linkStatus: 'missing',
      merchantAccounts: [],
      readyForCatalogBinding: false,
      readyForPublication: false
    })
  })

  it('fails closed when Ads exposes more than one Merchant Center link', async () => {
    const result = await readGoogleMerchantReadiness(identity, {
      loadConnection: vi.fn().mockResolvedValue({
        id: identity.connectionId,
        clientId: identity.clientId,
        status: 'active',
        customerId: identity.customerId,
        accessToken: 'access-token',
        developerToken: 'developer-token'
      }),
      queryAds: vi.fn().mockResolvedValue([
        {
          productLink: {
            type: 'MERCHANT_CENTER',
            productLinkId: '111',
            merchantCenter: { merchantCenterId: '5507471616' }
          }
        },
        {
          productLink: {
            type: 'MERCHANT_CENTER',
            productLinkId: '222',
            merchantCenter: { merchantCenterId: '5817965641' }
          }
        }
      ]),
      listDataSources: vi.fn().mockResolvedValue([]),
      listCredentialBindings: vi.fn().mockResolvedValue([])
    })

    expect(result).toMatchObject({
      linkStatus: 'ambiguous',
      readyForCatalogBinding: false,
      readyForPublication: false
    })
    expect(result.merchantAccounts).toHaveLength(2)
  })

  it('reports provider read denial without exposing provider response details', async () => {
    const result = await readGoogleMerchantReadiness(identity, {
      loadConnection: vi.fn().mockResolvedValue({
        id: identity.connectionId,
        clientId: identity.clientId,
        status: 'active',
        customerId: identity.customerId,
        accessToken: 'access-token',
        developerToken: 'developer-token'
      }),
      queryAds: vi.fn().mockResolvedValue([{
        productLink: {
          type: 'MERCHANT_CENTER',
          productLinkId: '123456789',
          merchantCenter: { merchantCenterId: '5507471616' }
        }
      }]),
      listDataSources: vi.fn().mockRejectedValue(new Error('Bearer secret: provider denied')),
      listCredentialBindings: vi.fn().mockResolvedValue([])
    })

    expect(result.merchantAccounts[0]).toMatchObject({
      merchantAccountId: '5507471616',
      readAccess: 'denied',
      credentialBinding: null,
      dataSources: []
    })
    expect(JSON.stringify(result)).not.toContain('Bearer secret')
    expect(result.readyForCatalogBinding).toBe(false)
    expect(result.readyForPublication).toBe(false)
  })
})
