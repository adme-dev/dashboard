import { describe, expect, it } from 'vitest'
import {
  normalizeCohortFilters,
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
