import { describe, expect, it } from 'vitest'
import { hrDepartmentGoalSchema, hrFollowUpSchema, hrRoleProfileSchema } from '../../../../server/utils/hr/schemas'

describe('HR goals, KPIs, and follow-up schemas', () => {
  it('requires role KPI weights to total 100 and structured targets', () => {
    const base = {
      title: 'Media Buyer', purpose: 'Own approved campaign delivery for the client portfolio.',
      responsibilities: ['Maintain campaign pacing'], expectedOutcomes: ['Keep pacing within tolerance'],
      benchmarkKey: 'ami-mcf',
    }
    expect(() => hrRoleProfileSchema.parse({
      ...base,
      kpis: [
        { name: 'Pacing variance', unit: '%', direction: 'lower_is_better', targetValue: 5, cadence: 'monthly', sourceType: 'platform', sourceRef: 'campaign pacing report', weight: 60 },
        { name: 'Report delivery', unit: '%', direction: 'higher_is_better', targetValue: 100, cadence: 'monthly', sourceType: 'platform', sourceRef: 'report delivery register', weight: 20 },
      ],
    })).toThrow('KPI weights must total 100')
  })

  it('requires department goal periods and target semantics', () => {
    expect(() => hrDepartmentGoalSchema.parse({
      departmentId: '11111111-1111-4111-8111-111111111111',
      name: 'Improve delivery', objective: 'Improve on-time delivery across the department.',
      metricName: 'On-time delivery', unit: '%', direction: 'higher_is_better',
      periodStart: '2026-09-01', periodEnd: '2026-06-30', sourceType: 'platform', sourceRef: 'delivery dashboard',
    })).toThrow()
  })

  it('requires learning detail only for learning actions', () => {
    const common = {
      title: 'Analytics training', description: 'Build capability to interpret the approved monthly analytics report.',
      ownerId: '11111111-1111-4111-8111-111111111111', dueAt: '2026-08-31T07:00:00.000Z',
      employeeResponsibility: 'Attend the agreed session and practise against the approved report.',
      businessResponsibility: 'Protect focused learning time and keep workload within the agreed capacity.',
      supportCommitment: 'Provide access to training, examples, and a reviewer for questions.',
      successMeasure: 'Explain and apply the report measures accurately in the follow-up review.',
      reviewAt: '2026-09-07T07:00:00.000Z',
    }
    expect(() => hrFollowUpSchema.parse({ ...common, actionType: 'learning' })).toThrow()
    expect(hrFollowUpSchema.parse({ ...common, actionType: 'process_change' }).actionType).toBe('process_change')
  })
})
