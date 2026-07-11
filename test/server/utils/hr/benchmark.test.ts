import { describe, expect, it } from 'vitest'
import { buildBenchmarkScorecard } from '../../../../server/utils/hr/benchmark'

describe('industry benchmark scorecards', () => {
  it.each(['ami-mcf', 'sfia-9', 'pmi-pmcd'] as const)('builds a 100-point %s scorecard linked to role evidence', (benchmarkKey) => {
    const scorecard = buildBenchmarkScorecard({
      benchmarkKey,
      responsibilities: ['Own the agreed workflow'],
      expectedOutcomes: ['Deliver the agreed monthly outcome'],
      kpis: [],
    })
    expect(scorecard.reduce((total, criterion) => total + criterion.weight, 0)).toBe(100)
    expect(scorecard.every(criterion => criterion.frameworkKey === benchmarkKey)).toBe(true)
    expect(scorecard[0]?.evidenceRequired).toEqual(['Deliver the agreed monthly outcome'])
    expect(scorecard.slice(1).every(criterion => criterion.evidenceRequired.length === 2)).toBe(true)
  })

  it('reserves 30 percent for verified KPIs without treating questionnaire opinion as KPI evidence', () => {
    const scorecard = buildBenchmarkScorecard({
      benchmarkKey: 'ami-mcf',
      responsibilities: ['Own the campaign workflow'],
      expectedOutcomes: ['Stay within approved budget'],
      kpis: [{
        name: 'Budget pacing variance', unit: '%', direction: 'lower_is_better',
        targetValue: 5, cadence: 'monthly', sourceType: 'platform', sourceRef: 'campaign budget report', weight: 100,
      }],
    })
    expect(scorecard[0]).toMatchObject({ id: 'role-outcomes-kpis', weight: 30 })
    expect(scorecard[0]?.evidenceRequired[0]).toContain('campaign budget report')
  })
})
