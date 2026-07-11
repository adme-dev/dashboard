import { describe, expect, it } from 'vitest'
import { hrReviewCycleDraftSchema, hrReviewCycleSchema } from '../../../../server/utils/hr/schemas'

const memberId = '11111111-1111-4111-8111-111111111111'
const roleId = '22222222-2222-4222-8222-222222222222'

describe('HR review cycle schema', () => {
  it('accepts an ISO-dated cycle with unique role-bound participants', () => {
    const parsed = hrReviewCycleDraftSchema.parse({
      name: 'FY27 business review',
      opensAt: '2026-07-13T00:00:00.000Z',
      dueAt: '2026-07-24T07:00:00.000Z',
      closesAt: '2026-07-31T07:00:00.000Z',
      participants: [{ teamMemberId: memberId, roleProfileVersionId: roleId }],
    })
    expect(parsed.timezone).toBe('Australia/Melbourne')
  })

  it('rejects duplicate participants', () => {
    expect(() => hrReviewCycleDraftSchema.parse({
      name: 'FY27 business review',
      opensAt: '2026-07-13T00:00:00.000Z',
      dueAt: '2026-07-24T07:00:00.000Z',
      closesAt: '2026-07-31T07:00:00.000Z',
      participants: [
        { teamMemberId: memberId, roleProfileVersionId: roleId },
        { teamMemberId: memberId, roleProfileVersionId: roleId },
      ],
    })).toThrow()
  })

  it('blocks sending until every recipient questionnaire is frozen and explicitly approved', () => {
    const draft = {
      name: 'FY27 business review',
      opensAt: '2026-07-13T00:00:00.000Z',
      dueAt: '2026-07-24T07:00:00.000Z',
      closesAt: '2026-07-31T07:00:00.000Z',
      participants: [{ teamMemberId: memberId, roleProfileVersionId: roleId }],
    }
    expect(hrReviewCycleSchema.safeParse(draft).success).toBe(false)
    expect(hrReviewCycleSchema.safeParse({
      ...draft,
      ownerConfirmed: true,
      participants: [{
        ...draft.participants[0],
        questions: [{
          id: 'role-1-planning', module: 'role', type: 'single_choice',
          prompt: 'How consistently are you able to complete the agreed planning responsibility?',
          required: true,
          options: [{ value: 'often', label: 'Often' }, { value: 'not_applicable', label: 'Not applicable / insufficient visibility' }],
          recommendationReason: 'Checks an acknowledged role responsibility.',
          sourceRefs: ['role-version:22222222-2222-4222-8222-222222222222'],
        }],
      }],
    }).success).toBe(true)
  })

  it('rejects duplicate question IDs that would collide in the answer map', () => {
    const question = {
      id: 'duplicate', module: 'core', type: 'optional_text',
      prompt: 'What work context should the reviewer understand before the discussion?',
      required: false,
      recommendationReason: 'Provides optional contextual clarification for this review.',
      sourceRefs: [`role-version:${roleId}`],
    }
    expect(hrReviewCycleSchema.safeParse({
      name: 'FY27 business review', ownerConfirmed: true,
      opensAt: '2026-07-13T00:00:00.000Z', dueAt: '2026-07-24T07:00:00.000Z', closesAt: '2026-07-31T07:00:00.000Z',
      participants: [{ teamMemberId: memberId, roleProfileVersionId: roleId, questions: [question, question] }],
    }).success).toBe(false)
  })
})
