import { describe, expect, it } from 'vitest'

import {
  candidateDecisionSchema,
  nearbySearchSchema,
  portalNominationSchema
} from '~~/server/utils/siteIntelligence/nearbyMarketContracts'

const clientId = '11111111-1111-4111-8111-111111111111'
const marketLocationId = '22222222-2222-4222-8222-222222222222'

describe('nearby market contracts', () => {
  it('defaults a bounded nearby search to agency-safe discovery options', () => {
    expect(nearbySearchSchema.parse({ clientId, radiusKm: 25 })).toEqual({
      clientId,
      radiusKm: 25,
      includeUsedIndependent: false
    })
  })

  it('rejects an unsupported nearby search radius', () => {
    expect(() => nearbySearchSchema.parse({ clientId, radiusKm: 30 })).toThrow()
  })

  it('rejects a blank portal nomination reason', () => {
    expect(() => portalNominationSchema.parse({
      marketLocationId,
      radiusKm: 25,
      reason: '  '
    })).toThrow()
  })

  it('rejects a body-supplied portal client ID', () => {
    expect(() => portalNominationSchema.parse({
      clientId,
      marketLocationId,
      radiusKm: 25,
      reason: 'Local rival'
    })).toThrow()
  })

  it('rejects unsupported candidate decisions', () => {
    expect(() => candidateDecisionSchema.parse({
      clientId,
      marketLocationId,
      radiusKm: 25,
      action: 'nominate'
    })).toThrow()
  })
})
