import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { describe, expect, expectTypeOf, it } from 'vitest'

import type { NearbyMarketCandidateDecision } from '~~/app/types/site-intelligence'

import {
  candidateDecisionSchema,
  nearbySearchSchema,
  portalNominationSchema
} from '~~/server/utils/siteIntelligence/nearbyMarketContracts'
import type { CandidateDecisionInput } from '~~/server/utils/siteIntelligence/nearbyMarketContracts'

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

  it('keeps the public candidate decision type aligned with its strict runtime union', async () => {
    const typePath = fileURLToPath(new URL(
      '../../../../app/types/site-intelligence.ts',
      import.meta.url
    ))
    const source = await readFile(typePath, 'utf8')

    expect(source).toMatch(/export interface NearbyMarketCandidateDecisionContext \{[\s\S]*clientId: string[\s\S]*marketLocationId: string[\s\S]*radiusKm: NearbyMarketRadius[\s\S]*\}/)
    expect(source).toMatch(/export type NearbyMarketCandidateDecision\s*=[\s\S]*action: 'save'[\s\S]*action: 'dismiss'[\s\S]*reviewerReason: string[\s\S]*action: 'approve_and_index'[\s\S]*reviewerReason: string[\s\S]*websiteUri\?: string/)
    expectTypeOf<NearbyMarketCandidateDecision>().toEqualTypeOf<CandidateDecisionInput>()
  })
})
