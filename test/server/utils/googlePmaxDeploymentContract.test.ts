import { describe, expect, it } from 'vitest'

import {
  GooglePmaxDeploymentContractError,
  evaluateGooglePmaxProductIdentities,
  normalizeGooglePmaxDeploymentContract
} from '../../../server/utils/googlePmaxDeploymentContract'

const NORTHERN = {
  schemaVersion: 1,
  tenantId: '11111111-1111-4111-8111-111111111111',
  clientId: '22222222-2222-4222-8222-222222222222',
  legalAdvertiserName: 'Northern Isuzu UTE',
  source: {
    connectorId: '33333333-3333-4333-8333-333333333333',
    kind: 'SUPABASE',
    sellerIds: ['northern-isuzu-ute'],
    requiredSaleStatus: 'For Sale'
  },
  merchant: {
    accountId: '5507471616',
    dataSourceId: '10705683272',
    feedLabel: 'Northern Isuzu UTE products',
    targetCountry: 'AU',
    contentLanguage: 'en',
    storeCodeMode: 'ACCOUNT_WIDE',
    storeCodes: []
  },
  ads: {
    connectionId: '44444444-4444-4444-8444-444444444444',
    customerId: '9962002158',
    campaignId: '22035417335',
    assetGroupIds: ['1002', '1001']
  },
  campaign: {
    objective: 'VEHICLE_SALES',
    sourceConditions: ['NEW'],
    excludedMakes: [],
    excludedModels: []
  },
  measurement: {
    trackingSiteId: '37d55218-5d75-465d-9bf3-4dec4f542d76',
    domains: ['www.northernisuzuute.com.au']
  }
} as const

const BRIGHTON = {
  ...NORTHERN,
  clientId: '55555555-5555-4555-8555-555555555555',
  legalAdvertiserName: 'Brighton GWM',
  source: {
    ...NORTHERN.source,
    connectorId: '66666666-6666-4666-8666-666666666666',
    sellerIds: ['brighton-gwm']
  },
  merchant: {
    ...NORTHERN.merchant,
    accountId: '5817965641',
    dataSourceId: '10705708313',
    feedLabel: 'Brighton GWM products'
  },
  ads: {
    connectionId: '77777777-7777-4777-8777-777777777777',
    customerId: '3437087580',
    campaignId: '24080161803',
    assetGroupIds: ['2001']
  },
  campaign: {
    ...NORTHERN.campaign,
    sourceConditions: ['NEW', 'DEMO']
  },
  measurement: {
    trackingSiteId: 'cc12ef2d-2173-4e95-bd89-265fbd35e9ff',
    domains: ['brightongwmhaval.com.au', 'www.brightongwm.com.au']
  }
} as const

describe('Google PMax deployment contract', () => {
  it('normalizes Northern new-only identities without retaining credentials', () => {
    const normalized = normalizeGooglePmaxDeploymentContract(NORTHERN)

    expect(normalized.contract).toMatchObject({
      schemaVersion: 1,
      clientId: NORTHERN.clientId,
      source: {
        kind: 'SUPABASE',
        sellerIds: ['northern-isuzu-ute'],
        requiredSaleStatus: 'For Sale'
      },
      merchant: {
        accountId: '5507471616',
        dataSourceId: '10705683272'
      },
      ads: {
        customerId: '9962002158',
        campaignId: '22035417335',
        assetGroupIds: ['1001', '1002']
      },
      campaign: {
        sourceConditions: ['NEW'],
        googleConditions: ['NEW']
      }
    })
    expect(normalized.contract).not.toHaveProperty('credentials')
    expect(normalized.contractHash).toMatch(/^[a-f0-9]{64}$/)
  })

  it('maps Brighton Demo stock to Google USED while retaining a demo label', () => {
    const { contract } = normalizeGooglePmaxDeploymentContract(BRIGHTON)
    const result = evaluateGooglePmaxProductIdentities(contract, [
      {
        clientId: BRIGHTON.clientId,
        connectorId: BRIGHTON.source.connectorId,
        sourceProductId: 'source-new-1',
        stockId: 'BNEW1',
        vin: 'LGWFF6A51PH000001',
        merchantOfferId: 'BNEW1',
        feedLabel: BRIGHTON.merchant.feedLabel,
        sellerId: 'brighton-gwm',
        saleStatus: 'For Sale',
        sourceCondition: 'NEW'
      },
      {
        clientId: BRIGHTON.clientId,
        connectorId: BRIGHTON.source.connectorId,
        sourceProductId: 'source-demo-1',
        stockId: 'BDEMO1',
        vin: 'LGWFF6A51PH000002',
        merchantOfferId: 'BDEMO1',
        feedLabel: BRIGHTON.merchant.feedLabel,
        sellerId: 'brighton-gwm',
        saleStatus: 'For Sale',
        sourceCondition: 'DEMO'
      }
    ])

    expect(result).toEqual([
      expect.objectContaining({ stockId: 'BNEW1', eligible: true, googleCondition: 'NEW', customLabel0: 'new' }),
      expect.objectContaining({ stockId: 'BDEMO1', eligible: true, googleCondition: 'USED', customLabel0: 'demo' })
    ])
  })

  it('keeps Northern demo and used vehicles explicitly outside a new-only campaign', () => {
    const { contract } = normalizeGooglePmaxDeploymentContract(NORTHERN)
    const result = evaluateGooglePmaxProductIdentities(contract, [
      {
        clientId: NORTHERN.clientId,
        connectorId: NORTHERN.source.connectorId,
        sourceProductId: 'demo-1',
        stockId: 'NDEMO1',
        vin: 'MPATFS40JPT000001',
        merchantOfferId: 'NDEMO1',
        feedLabel: NORTHERN.merchant.feedLabel,
        sellerId: 'northern-isuzu-ute',
        saleStatus: 'For Sale',
        sourceCondition: 'DEMO'
      },
      {
        clientId: NORTHERN.clientId,
        connectorId: NORTHERN.source.connectorId,
        sourceProductId: 'used-1',
        stockId: 'NUSED1',
        vin: 'MPATFS40JPT000002',
        merchantOfferId: 'NUSED1',
        feedLabel: NORTHERN.merchant.feedLabel,
        sellerId: 'northern-isuzu-ute',
        saleStatus: 'For Sale',
        sourceCondition: 'USED'
      }
    ])

    expect(result.map(item => ({ stockId: item.stockId, eligible: item.eligible, reason: item.exclusionReason }))).toEqual([
      { stockId: 'NDEMO1', eligible: false, reason: 'CONDITION_NOT_SELECTED' },
      { stockId: 'NUSED1', eligible: false, reason: 'CONDITION_NOT_SELECTED' }
    ])
  })

  it.each([
    ['cross-client product', { clientId: BRIGHTON.clientId }, 'PRODUCT_CLIENT_MISMATCH'],
    ['cross-connector product', { connectorId: BRIGHTON.source.connectorId }, 'PRODUCT_CONNECTOR_MISMATCH'],
    ['cross-feed product', { feedLabel: BRIGHTON.merchant.feedLabel }, 'PRODUCT_FEED_LABEL_MISMATCH'],
    ['cross-seller product', { sellerId: 'another-dealer' }, 'PRODUCT_SELLER_MISMATCH']
  ])('rejects a %s', (_name, override, code) => {
    const { contract } = normalizeGooglePmaxDeploymentContract(NORTHERN)
    expect(() => evaluateGooglePmaxProductIdentities(contract, [{
      clientId: NORTHERN.clientId,
      connectorId: NORTHERN.source.connectorId,
      sourceProductId: 'source-1',
      stockId: 'NSTOCK1',
      vin: 'MPATFS40JPT000003',
      merchantOfferId: 'NSTOCK1',
      feedLabel: NORTHERN.merchant.feedLabel,
      sellerId: 'northern-isuzu-ute',
      saleStatus: 'For Sale',
      sourceCondition: 'NEW',
      ...override
    }])).toThrowError(expect.objectContaining({ code }))
  })

  it.each([
    ['source product', 'sourceProductId', 'source-1', 'PRODUCT_SOURCE_ID_DUPLICATE'],
    ['stock', 'stockId', 'NSTOCK1', 'PRODUCT_STOCK_ID_DUPLICATE'],
    ['VIN', 'vin', 'MPATFS40JPT000004', 'PRODUCT_VIN_DUPLICATE'],
    ['Merchant offer', 'merchantOfferId', 'offer-1', 'PRODUCT_OFFER_ID_DUPLICATE']
  ])('rejects duplicate %s identity', (_name, field, duplicateValue, code) => {
    const { contract } = normalizeGooglePmaxDeploymentContract(NORTHERN)
    const base = {
      clientId: NORTHERN.clientId,
      connectorId: NORTHERN.source.connectorId,
      sourceProductId: 'source-1',
      stockId: 'NSTOCK1',
      vin: 'MPATFS40JPT000004',
      merchantOfferId: 'offer-1',
      feedLabel: NORTHERN.merchant.feedLabel,
      sellerId: 'northern-isuzu-ute',
      saleStatus: 'For Sale',
      sourceCondition: 'NEW'
    }
    const next = {
      ...base,
      sourceProductId: 'source-2',
      stockId: 'NSTOCK2',
      vin: 'MPATFS40JPT000005',
      merchantOfferId: 'offer-2',
      [field]: duplicateValue
    }

    expect(() => evaluateGooglePmaxProductIdentities(contract, [base, next]))
      .toThrowError(expect.objectContaining({ code }))
  })

  it('excludes sold and withdrawn products even when their condition is selected', () => {
    const { contract } = normalizeGooglePmaxDeploymentContract(BRIGHTON)
    const products = ['SOLD', 'WITHDRAWN'].map((saleStatus, index) => ({
      clientId: BRIGHTON.clientId,
      connectorId: BRIGHTON.source.connectorId,
      sourceProductId: `source-${index}`,
      stockId: `BSTOCK${index}`,
      vin: `LGWFF6A51PH00000${index + 6}`,
      merchantOfferId: `offer-${index}`,
      feedLabel: BRIGHTON.merchant.feedLabel,
      sellerId: 'brighton-gwm',
      saleStatus,
      sourceCondition: 'DEMO'
    }))

    expect(evaluateGooglePmaxProductIdentities(contract, products).map(item => item.exclusionReason))
      .toEqual(['NOT_FOR_SALE', 'NOT_FOR_SALE'])
  })

  it('fails closed when exact provider or domain identities are ambiguous', () => {
    expect(() => normalizeGooglePmaxDeploymentContract({
      ...NORTHERN,
      merchant: { ...NORTHERN.merchant, accountId: BRIGHTON.merchant.accountId },
      measurement: { ...NORTHERN.measurement, domains: ['https://user:pass@example.com'] }
    })).toThrow(GooglePmaxDeploymentContractError)
  })
})
