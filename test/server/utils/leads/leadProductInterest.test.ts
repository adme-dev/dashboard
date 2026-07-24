import { describe, expect, it } from 'vitest'
import { extractProductInterest } from '../../../../server/utils/leads/leadProductInterest'

describe('lead product interest extraction', () => {
  it('normalizes automotive and generic product identifiers without copying customer PII', () => {
    const result = extractProductInterest({
      vehicle_vin: ' jt123 456 ',
      stock_number: ' s-2048 ',
      product_sku: ' sku 10 ',
      vehicle_url: 'https://dealer.example/cars/one#photos',
      vehicle_make: 'Toyota',
      email: 'person@example.com'
    })
    expect(result?.identifiers).toEqual([
      { type: 'vin', value: 'JT123456' },
      { type: 'stock_id', value: 'S-2048' },
      { type: 'sku', value: 'SKU10' },
      { type: 'product_url', value: 'https://dealer.example/cars/one' }
    ])
    expect(result?.snapshot).toMatchObject({ vehicle_make: 'Toyota' })
    expect(result?.snapshot).not.toHaveProperty('email')
  })
})
