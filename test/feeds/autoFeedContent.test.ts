import { describe, expect, it } from 'vitest'
import {
  autoFeedEventType,
  isAutoFeedVehicleReady,
  missingAutoFeedContentFields
} from '~~/server/utils/feeds/autoFeedContent'
import type { VehicleSummary } from '~~/server/utils/feeds/types'

function vehicle(overrides: Partial<VehicleSummary> = {}): VehicleSummary {
  return {
    id: 'vehicle-1',
    make: 'GWM',
    model: 'Cannon',
    year: 2026,
    price: 42990,
    condition: 'New',
    stockNumber: 'A100',
    url: 'https://dealer.example/vehicle-1',
    image: 'https://cdn.example/vehicle-1.jpg',
    ...overrides
  }
}

describe('Auto Feed content safety', () => {
  it('requires a landing URL, positive price, and image before Compose or cron drafting', () => {
    const incomplete = vehicle({ url: null, price: 0, image: null })

    expect(missingAutoFeedContentFields(incomplete)).toEqual(['url', 'price', 'image'])
    expect(isAutoFeedVehicleReady(incomplete)).toBe(false)
    expect(isAutoFeedVehicleReady(vehicle())).toBe(true)
  })

  it('derives only the event types supported by rule creation', () => {
    expect(autoFeedEventType(vehicle({ condition: 'Brand New' }))).toBe('new')
    expect(autoFeedEventType(vehicle({ condition: 'Used' }))).toBe('listing')
    expect(autoFeedEventType(vehicle({ condition: null }))).toBe('listing')
  })
})
