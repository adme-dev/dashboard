import { describe, expect, it } from 'vitest'
import {
  CRM_SEARCH_MAX_INPUT_TOKENS,
  CRM_SEARCH_VECTOR_DIMENSIONS
} from '~~/server/utils/crm/searchIndex/contracts'
import {
  CRM_SEARCH_CAPACITY_ADMISSION_PERCENT,
  CRM_SEARCH_VECTORIZE_MAX_NAMESPACES,
  CRM_SEARCH_VECTORIZE_MAX_VECTORS,
  calculateCrmSearchProviderReservation,
  evaluateCrmSearchUsageAdmission,
  forecastCrmSearchCapacity,
  vectorizeUsage
} from '~~/server/utils/crm/searchIndex/usage'

const reservationAt = '2026-08-10T00:00:00.000Z'
const baseRateCard = {
  revision: 'cloudflare-2026-08-09',
  modelId: '@cf/baai/bge-base-en-v1.5',
  validFrom: '2026-08-09T00:00:00.000Z',
  validUntil: '2026-09-09T00:00:00.000Z',
  revokedAt: null,
  modelInputUsdMicrosPerMillionTokens: 67_000,
  queriedDimensionUsdMicrosPerMillion: 10_000,
  insertedDimensionUsdMicrosPerMillion: 10_000,
  storedDimensionUsdMicrosPerMillionMonth: 500
} as const

const emptyInventory = {
  active: { namespaces: 0, vectors: 0 },
  candidate: { namespaces: 0, vectors: 0 },
  retiring: { namespaces: 0, vectors: 0 },
  sentinel: { namespaces: 0, vectors: 0 },
  deletionPending: { namespaces: 0, vectors: 0 }
} as const

describe('CRM search provider usage arithmetic', () => {
  it('pins the 768-dimension provider contract and 80% independent capacity ceiling', () => {
    expect(CRM_SEARCH_VECTOR_DIMENSIONS).toBe(768)
    expect(CRM_SEARCH_MAX_INPUT_TOKENS).toBe(512)
    expect(CRM_SEARCH_CAPACITY_ADMISSION_PERCENT).toBe(80)
    expect(CRM_SEARCH_VECTORIZE_MAX_NAMESPACES).toBe(50_000)
    expect(CRM_SEARCH_VECTORIZE_MAX_VECTORS).toBe(20_000_000)
  })

  it('accounts query, inserted, billable-queried, and stored dimensions without multiplying by topK', () => {
    const topOne = vectorizeUsage({
      queryVectors: 1,
      insertedVectors: 2,
      storedVectors: 3,
      dimensions: 768,
      topK: 1
    })
    const topFifty = vectorizeUsage({
      queryVectors: 1,
      insertedVectors: 2,
      storedVectors: 3,
      dimensions: 768,
      topK: 50
    })

    expect(topOne).toEqual({
      queryDimensions: 768,
      insertedDimensions: 1536,
      billableQueriedDimensions: 2304,
      storedDimensions: 2304
    })
    expect(topFifty).toEqual(topOne)
  })

  it('reserves the full 512 model-input tokens for every possible Workers AI invocation', () => {
    const reservation = calculateCrmSearchProviderReservation({
      workersAiInvocations: 2,
      vectorizeQueryCalls: 1,
      vectorizeMutationCalls: 1,
      queryVectors: 1,
      insertedVectors: 1,
      storedVectors: 0,
      dimensions: 768,
      topK: 30,
      reservationAt,
      rateCard: baseRateCard
    })

    expect(reservation).toMatchObject({
      providerCalls: 4,
      rateCardRevision: 'cloudflare-2026-08-09',
      modelInputTokens: 2 * CRM_SEARCH_MAX_INPUT_TOKENS,
      queryDimensions: 768,
      insertedDimensions: 768,
      billableQueriedDimensions: 1536,
      storedDimensions: 0
    })
    expect(reservation.cost).toEqual({
      modelInputUsdMicros: 69,
      queriedDimensionUsdMicros: 8,
      insertedDimensionUsdMicros: 8,
      storedDimensionUsdMicros: 0,
      totalUsdMicros: 85
    })
  })

  it('ceiling-rounds each positive micro-USD component conservatively', () => {
    const reservation = calculateCrmSearchProviderReservation({
      workersAiInvocations: 1,
      vectorizeQueryCalls: 1,
      vectorizeMutationCalls: 1,
      queryVectors: 1,
      insertedVectors: 1,
      storedVectors: 1,
      dimensions: 768,
      topK: 30,
      reservationAt,
      rateCard: {
        ...baseRateCard,
        modelInputUsdMicrosPerMillionTokens: 1,
        queriedDimensionUsdMicrosPerMillion: 1,
        insertedDimensionUsdMicrosPerMillion: 1,
        storedDimensionUsdMicrosPerMillionMonth: 1
      }
    })

    expect(reservation.cost).toEqual({
      modelInputUsdMicros: 1,
      queriedDimensionUsdMicros: 1,
      insertedDimensionUsdMicros: 1,
      storedDimensionUsdMicros: 1,
      totalUsdMicros: 4
    })
  })

  it('uses exact ceiling arithmetic for large accepted quantities and integer micro-USD rates', () => {
    const reservation = calculateCrmSearchProviderReservation({
      workersAiInvocations: 0,
      vectorizeQueryCalls: 0,
      vectorizeMutationCalls: 0,
      queryVectors: 0,
      insertedVectors: 0,
      storedVectors: 11_728_124_029_601,
      dimensions: 768,
      topK: 1,
      reservationAt,
      rateCard: {
        ...baseRateCard,
        modelInputUsdMicrosPerMillionTokens: 0,
        queriedDimensionUsdMicrosPerMillion: 0,
        insertedDimensionUsdMicrosPerMillion: 0,
        storedDimensionUsdMicrosPerMillionMonth: 67_000
      }
    })

    expect(reservation.storedDimensions).toBe(9_007_199_254_733_568)
    expect(reservation.cost.storedDimensionUsdMicros).toBe(603_482_350_067_150)
  })

  it('fails closed for expired, revoked, wrong-model, or unrevisioned rate-card evidence', () => {
    const input = {
      workersAiInvocations: 1,
      vectorizeQueryCalls: 0,
      vectorizeMutationCalls: 0,
      queryVectors: 0,
      insertedVectors: 0,
      storedVectors: 0,
      dimensions: 768,
      topK: 1,
      reservationAt,
      rateCard: baseRateCard
    } as const

    expect(() => calculateCrmSearchProviderReservation({
      ...input,
      rateCard: { ...baseRateCard, validUntil: reservationAt }
    })).toThrow(/rate card/i)
    expect(() => calculateCrmSearchProviderReservation({
      ...input,
      rateCard: { ...baseRateCard, revokedAt: '2026-08-09T12:00:00.000Z' }
    })).toThrow(/rate card/i)
    expect(() => calculateCrmSearchProviderReservation({
      ...input,
      rateCard: { ...baseRateCard, modelId: '@cf/not-the-pinned-model' }
    })).toThrow(/rate card/i)
    expect(() => calculateCrmSearchProviderReservation({
      ...input,
      rateCard: { ...baseRateCard, revision: '' }
    })).toThrow(/rate card/i)
  })

  it('rejects provider-call counts that understate dimension-bearing operations', () => {
    expect(() => calculateCrmSearchProviderReservation({
      workersAiInvocations: 0,
      vectorizeQueryCalls: 0,
      vectorizeMutationCalls: 0,
      queryVectors: 1,
      insertedVectors: 0,
      storedVectors: 0,
      dimensions: 768,
      topK: 30,
      reservationAt,
      rateCard: baseRateCard
    })).toThrow(/query call/i)
    expect(() => calculateCrmSearchProviderReservation({
      workersAiInvocations: 0,
      vectorizeQueryCalls: 0,
      vectorizeMutationCalls: 0,
      queryVectors: 0,
      insertedVectors: 1,
      storedVectors: 0,
      dimensions: 768,
      topK: 30,
      reservationAt,
      rateCard: baseRateCard
    })).toThrow(/mutation call/i)
  })

  it('checks every projected provider cap independently and fails closed when a cap is unknown', () => {
    const projected = {
      providerCalls: 2,
      modelInputTokens: 512,
      queryDimensions: 768,
      insertedDimensions: 0,
      storedDimensions: 7680,
      usdMicros: 50
    }
    const caps = {
      providerCalls: 2,
      modelInputTokens: 512,
      queryDimensions: 768,
      insertedDimensions: 0,
      storedDimensions: 7680,
      usdMicros: 50
    }

    expect(evaluateCrmSearchUsageAdmission({ projected, caps })).toEqual({
      allowed: true,
      exceeded: [],
      unknown: []
    })
    expect(evaluateCrmSearchUsageAdmission({
      projected: { ...projected, queryDimensions: 769 },
      caps
    })).toMatchObject({ allowed: false, exceeded: ['queryDimensions'] })
    expect(evaluateCrmSearchUsageAdmission({
      projected,
      caps: { ...caps, usdMicros: null }
    })).toMatchObject({ allowed: false, unknown: ['usdMicros'] })
  })

  it('forecasts namespace and vector inventory independently across every durable lifecycle bucket', () => {
    const forecast = forecastCrmSearchCapacity({
      limits: { namespaces: 100, vectors: 1000 },
      inventory: {
        active: { namespaces: 50, vectors: 500 },
        candidate: { namespaces: 10, vectors: 100 },
        retiring: { namespaces: 5, vectors: 50 },
        sentinel: { namespaces: 1, vectors: 1 },
        deletionPending: { namespaces: 4, vectors: 139 }
      }
    })

    expect(forecast).toMatchObject({
      capacityReady: true,
      totalNamespaces: 70,
      totalVectors: 790,
      namespaceHeadroom: 30,
      vectorHeadroom: 210,
      namespaceAdmissionReady: true,
      vectorAdmissionReady: true,
      unknownLimits: []
    })
  })

  it('blocks at, not above, 80% for either capacity dimension', () => {
    const namespaceBlocked = forecastCrmSearchCapacity({
      limits: { namespaces: 10, vectors: 100 },
      inventory: { ...emptyInventory, active: { namespaces: 8, vectors: 1 } }
    })
    const vectorBlocked = forecastCrmSearchCapacity({
      limits: { namespaces: 10, vectors: 100 },
      inventory: { ...emptyInventory, active: { namespaces: 1, vectors: 80 } }
    })

    expect(namespaceBlocked).toMatchObject({
      capacityReady: false,
      namespaceAdmissionReady: false,
      vectorAdmissionReady: true
    })
    expect(vectorBlocked).toMatchObject({
      capacityReady: false,
      namespaceAdmissionReady: true,
      vectorAdmissionReady: false
    })
  })

  it('compares the 80% ceiling exactly at the highest accepted provider caps', () => {
    const forecast = forecastCrmSearchCapacity({
      limits: { namespaces: 50_000, vectors: 20_000_000 },
      inventory: {
        ...emptyInventory,
        active: { namespaces: 39_999, vectors: 15_999_999 }
      }
    })

    expect(forecast.namespaceAdmissionReady).toBe(true)
    expect(forecast.capacityReady).toBe(true)
  })

  it('fails capacity admission closed when either provider limit is missing or malformed', () => {
    expect(forecastCrmSearchCapacity({
      limits: { namespaces: null, vectors: 20_000_000 },
      inventory: emptyInventory
    })).toMatchObject({
      capacityReady: false,
      namespaceAdmissionReady: false,
      vectorAdmissionReady: true,
      namespaceHeadroom: null,
      unknownLimits: ['namespaces']
    })

    expect(() => forecastCrmSearchCapacity({
      limits: { namespaces: 50_000, vectors: Number.NaN },
      inventory: emptyInventory
    })).toThrow(/capacity limit/i)
    expect(() => forecastCrmSearchCapacity({
      limits: { namespaces: 50_001, vectors: 20_000_000 },
      inventory: emptyInventory
    })).toThrow(/provider maximum/i)
    expect(() => forecastCrmSearchCapacity({
      limits: { namespaces: 50_000, vectors: 20_000_001 },
      inventory: emptyInventory
    })).toThrow(/provider maximum/i)
  })

  it.each([
    ['negative count', { queryVectors: -1, insertedVectors: 0, storedVectors: 0, dimensions: 768, topK: 30 }],
    ['wrong dimensions', { queryVectors: 1, insertedVectors: 0, storedVectors: 0, dimensions: 1536, topK: 30 }],
    ['oversized server topK', { queryVectors: 1, insertedVectors: 0, storedVectors: 0, dimensions: 768, topK: 51 }]
  ])('rejects %s instead of producing untrustworthy usage', (_case, input) => {
    expect(() => vectorizeUsage(input)).toThrow()
  })
})
