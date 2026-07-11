import { describe, expect, it } from 'vitest'
import { hrDepartmentGoalRevisionSchema, hrRoleProfileRevisionSchema } from '~~/server/utils/hr/schemas'

const validGoalRevision = {
  expectedVersion: 2,
  departmentId: '11111111-1111-4111-8111-111111111111',
  name: 'Improve delivery quality',
  objective: 'Improve verified on-time delivery across the department.',
  metricName: 'On-time delivery',
  unit: '%',
  direction: 'higher_is_better' as const,
  targetValue: 95,
  periodStart: '2026-08-01',
  periodEnd: '2026-12-31',
  sourceType: 'approved_report' as const,
  sourceRef: 'monthly delivery governance report',
  publish: true,
}

describe('HR version revision schemas', () => {
  it('accepts a source-backed department goal revision with optimistic version lock', () => {
    expect(hrDepartmentGoalRevisionSchema.parse(validGoalRevision).expectedVersion).toBe(2)
  })

  it('rejects a revision without a positive current version', () => {
    expect(() => hrDepartmentGoalRevisionSchema.parse({
      ...validGoalRevision,
      expectedVersion: 0,
    })).toThrow()
  })

  it('requires optimistic locking for a role profile revision', () => {
    const role = hrRoleProfileRevisionSchema.parse({
      expectedVersion: 3,
      title: 'Media Buyer',
      purpose: 'Own approved campaign delivery for the client portfolio.',
      responsibilities: ['Maintain campaign pacing'],
      expectedOutcomes: ['Keep pacing within the approved tolerance'],
      benchmarkKey: 'ami-mcf',
      kpis: [{
        name: 'Pacing variance', unit: '%', direction: 'lower_is_better', targetValue: 5,
        cadence: 'monthly', sourceType: 'platform', sourceRef: 'campaign pacing report', weight: 100,
      }],
      publish: true,
    })

    expect(role.expectedVersion).toBe(3)
  })
})
