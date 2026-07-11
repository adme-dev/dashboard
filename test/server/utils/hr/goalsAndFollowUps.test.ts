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

  it('accepts bounded Monday role evidence as metadata without raw content', () => {
    const parsed = hrRoleProfileSchema.parse({
      title: 'Social & Traffic Operations Manager',
      purpose: 'Coordinate agreed social media and traffic operations across the client portfolio.',
      responsibilities: ['Prepare the agreed social media and traffic operations summary'],
      expectedOutcomes: ['Stakeholders receive the agreed summary through the approved workflow'],
      benchmarkKey: 'ami-mcf',
      sourceReferences: [{
        sourceType: 'monday_item',
        sourceId: '11140150759',
        label: 'Weekly Social Media & Traffic Summary & Ad Share',
        evidenceScope: 'workflow',
        limitation: 'Shows assigned workflow involvement; it does not establish performance or contractual ownership.',
      }],
    })

    expect(parsed.sourceReferences).toEqual([expect.objectContaining({
      sourceType: 'monday_item',
      sourceId: '11140150759',
      evidenceScope: 'workflow',
    })])
  })

  it('rejects unsupported role evidence types and oversized source metadata', () => {
    const base = {
      title: 'Social & Traffic Operations Manager',
      purpose: 'Coordinate agreed social media and traffic operations across the client portfolio.',
      responsibilities: ['Prepare the agreed social media and traffic operations summary'],
      expectedOutcomes: ['Stakeholders receive the agreed summary through the approved workflow'],
      benchmarkKey: 'ami-mcf',
    }

    expect(() => hrRoleProfileSchema.parse({
      ...base,
      sourceReferences: [{
        sourceType: 'email_message', sourceId: 'private-message', label: 'Private message',
        evidenceScope: 'workflow', limitation: 'Not approved.',
      }],
    })).toThrow()
    expect(() => hrRoleProfileSchema.parse({
      ...base,
      sourceReferences: [{
        sourceType: 'monday_item', sourceId: '1', label: 'x'.repeat(301),
        evidenceScope: 'workflow', limitation: 'Metadata only.',
      }],
    })).toThrow()
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
