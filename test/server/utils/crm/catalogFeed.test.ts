import { describe, expect, it } from 'vitest'
import {
  CatalogFeedError,
  normalizeCatalogItems,
  parseCatalogFeed,
  validateCatalogFeedUrl
} from '../../../../server/utils/crm/catalogFeed'

describe('catalog feed parsing', () => {
  it('extracts a nested JSON vehicle list and normalizes identifiers', () => {
    const rows = parseCatalogFeed(JSON.stringify({
      payload: {
        vehicles: [{
          vehicleId: 'car-1',
          stockNo: 'SM-100',
          vehicleVin: 'abc123',
          label: '2026 Example One',
          status: 'for_sale',
          amount: '$54,990',
          currency: 'aud'
        }]
      }
    }), 'json', 'payload.vehicles')
    const items = normalizeCatalogItems(rows, {
      source_product_id: 'vehicleId',
      stock_id: 'stockNo',
      vin: 'vehicleVin',
      name: 'label',
      price: 'amount'
    })

    expect(items).toMatchObject([{
      source_product_id: 'car-1',
      stock_id: 'SM-100',
      vin: 'abc123',
      name: '2026 Example One',
      availability: 'available',
      price: 54990,
      currency: 'AUD',
      product_type: 'vehicle'
    }])
  })

  it('parses quoted CSV fields', () => {
    const rows = parseCatalogFeed(
      'id,name,price\n1,"Example, Premium","$42,500"\n',
      'csv'
    )
    expect(normalizeCatalogItems(rows)).toMatchObject([{
      source_product_id: '1',
      name: 'Example, Premium',
      price: 42500
    }])
  })

  it('deduplicates repeated source IDs using the latest feed row', () => {
    const items = normalizeCatalogItems([
      { id: '1', name: 'Old', status: 'available' },
      { id: '1', name: 'Current', status: 'sold' }
    ])
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ name: 'Current', availability: 'sold' })
  })
})

describe('catalog feed URL safety', () => {
  it('accepts public HTTPS feeds', () => {
    expect(validateCatalogFeedUrl('https://inventory.example.com/feed.json#latest'))
      .toBe('https://inventory.example.com/feed.json')
  })

  it.each([
    'http://inventory.example.com/feed.json',
    'https://localhost/feed.json',
    'https://127.0.0.1/feed.json',
    'https://inventory.example.com/feed.json?api_key=secret',
    'https://user:password@inventory.example.com/feed.json'
  ])('rejects unsafe or credential-bearing URLs: %s', value => {
    expect(() => validateCatalogFeedUrl(value)).toThrow(CatalogFeedError)
  })
})
