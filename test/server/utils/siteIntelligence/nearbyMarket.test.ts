import { describe, expect, it } from 'vitest'

import { classifyDealer, haversineDistanceKm } from '~~/server/utils/siteIntelligence/nearbyMarket'

describe('nearby market helpers', () => {
  it('classifies explicit used-dealer signals before franchise aliases', () => {
    expect(classifyDealer({ displayName: 'Toyota Used Cars Melbourne', primaryType: 'car_dealer', types: [] }))
      .toBe('used')
  })

  it('recognises known Australian franchise aliases only with positive evidence', () => {
    expect(classifyDealer({ displayName: 'Berwick Toyota', primaryType: 'car_dealer', types: ['car_dealer'] }))
      .toBe('franchise_new')
    expect(classifyDealer({ displayName: 'Example Automotive Group', primaryType: 'car_dealer', types: ['car_dealer'] }))
      .toBe('unclassified')
  })

  it('matches franchise aliases as whole words or phrases, not name substrings', () => {
    expect(classifyDealer({ displayName: 'Affordable Motors', primaryType: 'car_dealer', types: [] }))
      .toBe('unclassified')
    expect(classifyDealer({ displayName: 'Bertram Motors', primaryType: 'car_dealer', types: [] }))
      .toBe('unclassified')
    expect(classifyDealer({ displayName: 'South East Ford', primaryType: 'car_dealer', types: [] }))
      .toBe('franchise_new')
    expect(classifyDealer({ displayName: 'Land Rover Melbourne', primaryType: 'car_dealer', types: [] }))
      .toBe('franchise_new')
  })

  it('does not infer independent from the absence of evidence', () => {
    expect(classifyDealer({ displayName: 'Local Motors', primaryType: null, types: [] })).toBe('unclassified')
  })

  it('calculates distance without display rounding', () => {
    const distance = haversineDistanceKm(
      { latitude: -37.8136, longitude: 144.9631 },
      { latitude: -37.8136, longitude: 145.9631 }
    )

    expect(distance).toBeGreaterThan(87)
    expect(distance).toBeLessThan(89)
    expect(Number.isInteger(distance)).toBe(false)
  })
})
