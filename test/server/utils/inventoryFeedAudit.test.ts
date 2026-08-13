import { describe, expect, it } from 'vitest'
import {
  buildCsv,
  hasInventoryIntent,
  hasGoogleContentScope,
  hasMetaCatalogScope,
  googleMerchantFeedRecommendedAction,
  metaCatalogRecommendedAction,
  summariseGoogleMerchantDatafeed,
  summariseGoogleListingFilter,
  summariseMetaProductSet,
} from '~~/server/utils/inventoryFeedAudit'

describe('inventoryFeedAudit', () => {
  it('summarises Google listing group filters into stable feed dimensions', () => {
    expect(summariseGoogleListingFilter({
      assetGroupListingGroupFilter: {
        id: '123',
        type: 'UNIT_INCLUDED',
        listingSource: 'SHOPPING',
        parentListingGroupFilter: 'customers/1/assetGroupListingGroupFilters/2~3',
        caseValue: {
          productCondition: { condition: 'NEW' },
          productBrand: { value: 'nissan' },
          productCustomAttribute: { index: 'INDEX2', value: 'demo' },
        },
      },
    })).toEqual({
      filterId: '123',
      filterType: 'UNIT_INCLUDED',
      listingSource: 'SHOPPING',
      dimension: 'brand=nissan; condition=NEW; custom_2=demo',
      parent: 'customers/1/assetGroupListingGroupFilters/2~3',
    })
  })

  it('normalises Meta product set names and preserves blocked catalog status', () => {
    expect(summariseMetaProductSet({
      productSetId: '520022784011155',
      productSetName: '  New & Demo  ',
      productCatalogId: '',
      productCatalogName: '',
    })).toEqual({
      productSetId: '520022784011155',
      productSetName: 'New & Demo',
      productCatalogId: '',
      productCatalogName: '',
      resolutionStatus: 'product_set_only',
    })
  })

  it('detects Google Merchant Center Content scope across stored scope formats', () => {
    expect(hasGoogleContentScope([
      'https://www.googleapis.com/auth/adwords',
      'https://www.googleapis.com/auth/content',
    ])).toBe(true)
    expect(hasGoogleContentScope('https://www.googleapis.com/auth/adwords https://www.googleapis.com/auth/content')).toBe(true)
    expect(hasGoogleContentScope('["https://www.googleapis.com/auth/adwords","https://www.googleapis.com/auth/content"]')).toBe(true)
    expect(hasGoogleContentScope(['https://www.googleapis.com/auth/adwords'])).toBe(false)
  })

  it('detects Meta catalog scope across stored scope formats', () => {
    expect(hasMetaCatalogScope(['ads_read', 'catalog_management'])).toBe(true)
    expect(hasMetaCatalogScope('ads_read,catalog_management,business_management')).toBe(true)
    expect(hasMetaCatalogScope('["ads_read","catalog_management"]')).toBe(true)
    expect(hasMetaCatalogScope(['ads_read', 'business_management'])).toBe(false)
  })

  it('maps unresolved platform statuses to operator actions', () => {
    expect(googleMerchantFeedRecommendedAction('merchant_center_link_resolved_content_scope_required'))
      .toContain('Reconnect the Google Ads account')
    expect(metaCatalogRecommendedAction('product_set_resolved_catalog_permission_required'))
      .toContain('Grant Meta catalogue access in XeroFlow')
    expect(metaCatalogRecommendedAction('product_set_resolved_catalog_permission_required'))
      .not.toContain('Reconnect')
    expect(metaCatalogRecommendedAction('catalog_resolved'))
      .toContain('resolved product catalog')
  })

  it('summarises Google Merchant Center datafeeds into audit-ready strings', () => {
    expect(summariseGoogleMerchantDatafeed({
      id: '123456',
      name: 'Inventory feed',
      fileName: 'stock.xml',
      contentType: 'products',
      fetchSchedule: {
        fetchUrl: 'https://example.com/stock.xml',
        hour: 3,
        timeZone: 'Australia/Melbourne',
      },
      targets: [
        { country: 'AU', language: 'en', includedDestinations: ['Shopping_ads'] },
      ],
    })).toEqual({
      datafeedId: '123456',
      name: 'Inventory feed',
      fileName: 'stock.xml',
      contentType: 'products',
      fetchSchedule: 'https://example.com/stock.xml | hour=3 | Australia/Melbourne',
      targets: 'AU/en/Shopping_ads',
    })
  })

  it('detects inventory intent from platform naming conventions', () => {
    expect(hasInventoryIntent('Convert_Rolling_Google_PMaxInventory_Foo_New_Demo')).toBe(true)
    expect(hasInventoryIntent('JUNE | Inventory Catalogue Carousel | Traffic')).toBe(true)
    expect(hasInventoryIntent('Convert_Rolling_Google_Search_Brand')).toBe(false)
  })

  it('escapes CSV cells without leaking object formatting', () => {
    const csv = buildCsv([
      { accountName: 'A', campaignName: 'Needs, escaping', filters: 'condition=NEW' },
      { accountName: 'B', campaignName: 'Quote "inside"', filters: '' },
    ], ['accountName', 'campaignName', 'filters'])

    expect(csv).toBe([
      'accountName,campaignName,filters',
      'A,"Needs, escaping",condition=NEW',
      'B,"Quote ""inside""",',
    ].join('\n'))
  })
})
