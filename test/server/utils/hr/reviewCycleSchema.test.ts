import { describe, expect, it } from 'vitest'
import { hrReviewCycleSchema } from '../../../../server/utils/hr/schemas'

const memberId = '11111111-1111-4111-8111-111111111111'
const roleId = '22222222-2222-4222-8222-222222222222'

describe('HR review cycle schema', () => {
  it('accepts an ISO-dated cycle with unique role-bound participants', () => {
    const parsed = hrReviewCycleSchema.parse({
      name: 'FY27 business review',
      opensAt: '2026-07-13T00:00:00.000Z',
      dueAt: '2026-07-24T07:00:00.000Z',
      closesAt: '2026-07-31T07:00:00.000Z',
      participants: [{ teamMemberId: memberId, roleProfileVersionId: roleId }],
    })
    expect(parsed.timezone).toBe('Australia/Melbourne')
  })

  it('rejects duplicate participants', () => {
    expect(() => hrReviewCycleSchema.parse({
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
})
