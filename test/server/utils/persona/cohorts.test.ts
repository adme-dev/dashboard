import { describe, expect, it } from 'vitest'
import {
  normalizeCohortFilters,
  resolveHighestTier,
  scorePersonaDefinition
} from '../../../../server/utils/persona/cohorts'

const definition = {
  positive_signals: ['vehicle_view', 'return_to_vehicle', 'form_start'],
  negative_signals: ['form_abandonment'],
  min_confidence: 0.5
}

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
