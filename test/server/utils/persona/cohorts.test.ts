import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockQueryOne = vi.fn()
const mockQueryRows = vi.fn()
vi.mock('~~/server/utils/db', () => ({
  queryOne: (...args: unknown[]) => mockQueryOne(...args),
  queryRows: (...args: unknown[]) => mockQueryRows(...args)
}))

const mockIsPersonaIdentityEnabled = vi.fn()
vi.mock('~~/server/utils/persona/feature', () => ({
  isPersonaIdentityEnabled: (...args: unknown[]) => mockIsPersonaIdentityEnabled(...args)
}))

import {
  getAudienceCohortPreview,
  normalizeCohortFilters,
  resolveHighestTier,
  resolveIsExcluded,
  scorePersonaDefinition
} from '../../../../server/utils/persona/cohorts'

const CLIENT_ID = '11111111-1111-4111-8111-111111111111'

const definition = {
  positive_signals: ['vehicle_view', 'return_to_vehicle', 'form_start'],
  negative_signals: ['form_abandonment'],
  min_confidence: 0.5
}

beforeEach(() => {
  mockQueryOne.mockReset()
  mockQueryRows.mockReset()
  mockIsPersonaIdentityEnabled.mockReset()
})

describe('persona cohort scoring', () => {
  it('qualifies a subject when enough positive evidence exists', () => {
    const result = scorePersonaDefinition(definition, [
      'vehicle_view',
      'return_to_vehicle'
    ])

    expect(result.qualifies).toBe(true)
    expect(result.confidence).toBe(0.6667)
    expect(result.matchedPositive).toEqual(['vehicle_view', 'return_to_vehicle'])
  })

  it('fails closed when negative evidence exists', () => {
    const result = scorePersonaDefinition(definition, [
      'vehicle_view',
      'return_to_vehicle',
      'form_abandonment'
    ])

    expect(result.qualifies).toBe(false)
    expect(result.matchedNegative).toEqual(['form_abandonment'])
  })

  it('normalizes a default 30-day UTC range', () => {
    expect(normalizeCohortFilters({}, new Date('2026-07-25T12:30:00Z'))).toEqual({
      startDate: '2026-06-26',
      endDate: '2026-07-25',
      platform: null
    })
  })

  it('rejects reversed date ranges', () => {
    expect(() => normalizeCohortFilters({
      startDate: '2026-07-25',
      endDate: '2026-07-01'
    })).toThrow('startDate must not be after endDate')
  })
})

describe('resolveHighestTier', () => {
  const hot = {
    persona_key: 'hot',
    positive_signals: ['form_start', 'add_to_wishlist'],
    negative_signals: [],
    min_confidence: 0.01,
    tier_rank: 1
  }
  const warm = {
    persona_key: 'warm',
    positive_signals: ['vehicle_comparison', 'return_to_vehicle'],
    negative_signals: [],
    min_confidence: 0.01,
    tier_rank: 2
  }
  const cold = {
    persona_key: 'cold',
    positive_signals: ['vehicle_view'],
    negative_signals: [],
    min_confidence: 0.01,
    tier_rank: 3
  }

  it('picks the highest-ranked tier when a subject qualifies for more than one, regardless of input order', () => {
    const result = resolveHighestTier([cold, warm, hot], ['vehicle_view', 'vehicle_comparison', 'form_start'])

    expect(result).toEqual({ personaKey: 'hot', matchedSignals: ['form_start'] })
  })

  it('falls back to a lower tier when the subject only matches its signals', () => {
    const result = resolveHighestTier([cold, warm, hot], ['vehicle_view', 'vehicle_comparison'])

    expect(result).toEqual({ personaKey: 'warm', matchedSignals: ['vehicle_comparison'] })
  })

  it('returns null when no tier signals match', () => {
    const result = resolveHighestTier([cold, warm, hot], ['search'])

    expect(result).toBeNull()
  })
})

describe('resolveIsExcluded', () => {
  const exclusionDefinition = {
    positive_signals: ['competitive_referrer', 'exit_intent'],
    negative_signals: [],
    min_confidence: 0.01
  }

  it('excludes a profile that matched a trigger signal', () => {
    const result = resolveIsExcluded([exclusionDefinition], ['competitive_referrer', 'vehicle_view'])

    expect(result).toEqual({ excluded: true, matchedSignals: ['competitive_referrer'] })
  })

  it('unions matched signals across multiple qualifying exclusion definitions', () => {
    const secondDefinition = {
      positive_signals: ['exit_intent'],
      negative_signals: [],
      min_confidence: 0.01
    }

    const result = resolveIsExcluded(
      [exclusionDefinition, secondDefinition],
      ['competitive_referrer', 'exit_intent']
    )

    expect(result.excluded).toBe(true)
    expect(result.matchedSignals.sort()).toEqual(['competitive_referrer', 'exit_intent'])
  })

  it('does not exclude a profile with no matching trigger signal', () => {
    const result = resolveIsExcluded([exclusionDefinition], ['vehicle_view', 'search'])

    expect(result).toEqual({ excluded: false, matchedSignals: [] })
  })
})

describe('getAudienceCohortPreview definitions query', () => {
  it('excludes is_exclusion definitions from the client-facing preview, same as tier definitions', async () => {
    mockIsPersonaIdentityEnabled.mockResolvedValue(true)
    mockQueryOne.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'snapshot-1' })
    mockQueryRows.mockImplementation(async (sql: string) => {
      if (/FROM crm_persona_definitions/.test(sql)) return []
      if (/FROM crm_customer_signals/.test(sql)) return []
      return []
    })

    await getAudienceCohortPreview(CLIENT_ID, {})

    const definitionsCall = mockQueryRows.mock.calls.find(call => /FROM crm_persona_definitions/.test(call[0] as string))
    expect(definitionsCall?.[0]).toContain('tier_rank IS NULL')
    expect(definitionsCall?.[0]).toContain('is_exclusion = FALSE')
  })
})
