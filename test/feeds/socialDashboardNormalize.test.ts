import { describe, it, expect } from 'vitest'
import { normalizeFeedSummary, normalizeFeedDetail, normalizeVehicle } from '~~/server/utils/feeds/providers/socialDashboardNormalize'

describe('normalizeFeedSummary', () => {
  it('maps feed_type to platform and defaults is_active', () => {
    expect(normalizeFeedSummary({ id: 7, name: 'GWM Google', feed_type: 'google', is_active: true }))
      .toEqual({ id: '7', name: 'GWM Google', platform: 'google', isActive: true })
    expect(normalizeFeedSummary({ id: '9', name: 'X', feed_type: 'facebook' }).platform).toBe('facebook')
    expect(normalizeFeedSummary({ id: '9', name: 'X', feed_type: 'google', is_active: false }).isActive).toBe(false)
  })
  it('coerces a missing id to an empty string (never the literal "undefined")', () => {
    expect(normalizeFeedSummary({ name: 'No id', feed_type: 'google' }).id).toBe('')
  })
  it('maps an unknown feed_type to google', () => {
    expect(normalizeFeedSummary({ id: '1', name: 'X', feed_type: 'tiktok' }).platform).toBe('google')
  })
})

describe('normalizeVehicle', () => {
  it('maps social-dashboard vehicle shape to VehicleSummary, first image, dap_price', () => {
    const v = normalizeVehicle({ id: 'v1', make: 'Kia', model: 'Sportage', build_year: 2024, dap_price: 41990, listing_type: 'demo', stock_number: 'K123', url: 'https://x', images: ['https://cdn.example/a.jpg', 'https://cdn.example/b.jpg'] })
    expect(v).toEqual({ id: 'v1', make: 'Kia', model: 'Sportage', year: 2024, price: 41990, condition: 'demo', stockNumber: 'K123', url: 'https://x', image: 'https://cdn.example/a.jpg' })
  })
  it('falls back to year/price/image scalars and nulls missing fields', () => {
    const v = normalizeVehicle({ id: 2, make: 'Ford', model: 'Ranger', year: 2023, price: 60000, image: 'https://cdn.example/one.jpg' })
    expect(v.year).toBe(2023)
    expect(v.price).toBe(60000)
    expect(v.image).toBe('https://cdn.example/one.jpg')
    expect(normalizeVehicle({ id: 3, make: 'X', model: 'Y' }).image).toBeNull()
  })
  it('uses alternate inventory image fields and condition types', () => {
    const v = normalizeVehicle({ id: 'v1', photos: ['https://img/car.jpg'], category: 'Used' })
    expect(v.image).toBe('https://img/car.jpg')
    expect(v.condition).toBe('Used')
  })
  it('rejects non-http vehicle and image URLs from the upstream provider', () => {
    const v = normalizeVehicle({
      id: 'v1',
      url: 'javascript:alert(1)',
      images: ['data:text/html,<script>alert(1)</script>']
    })
    expect(v.url).toBeNull()
    expect(v.image).toBeNull()
  })
})

describe('normalizeFeedDetail', () => {
  it('extends summary with filters/mappings/source', () => {
    const d = normalizeFeedDetail({ id: '1', name: 'F', feed_type: 'google', is_active: true, filters: { a: 1 }, mappings: {}, source: { type: 'meilisearch' } })
    expect(d.platform).toBe('google')
    expect(d.filters).toEqual({ a: 1 })
    expect(d.source).toEqual({ type: 'meilisearch' })
    expect(normalizeFeedDetail({ id: '1', name: 'F', feed_type: 'google' }).source).toBeNull()
  })
})
