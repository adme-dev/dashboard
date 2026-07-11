import { describe, expect, it } from 'vitest'
import {
  buildHrCalendarInvite,
  deriveHrAssignmentStatus,
  validateHrSchedule,
} from '~~/server/utils/hr/schedule'

describe('HR scheduling', () => {
  it('requires the questionnaire deadline to fall within the cycle', () => {
    expect(validateHrSchedule({
      opensAt: '2026-07-10T09:00:00+10:00',
      dueAt: '2026-07-20T17:00:00+10:00',
      closesAt: '2026-07-31T17:00:00+10:00',
      timezone: 'Australia/Melbourne',
    })).toMatchObject({ isValid: true })

    expect(validateHrSchedule({
      opensAt: '2026-07-10T09:00:00+10:00',
      dueAt: '2026-08-01T17:00:00+10:00',
      closesAt: '2026-07-31T17:00:00+10:00',
      timezone: 'Australia/Melbourne',
    })).toMatchObject({ isValid: false, code: 'DUE_AFTER_CLOSE' })
  })

  it('marks an unfinished assignment overdue and honours an active extension', () => {
    expect(deriveHrAssignmentStatus({
      now: '2026-07-21T00:00:00Z',
      dueAt: '2026-07-20T00:00:00Z',
      submittedAt: null,
    })).toBe('overdue')

    expect(deriveHrAssignmentStatus({
      now: '2026-07-21T00:00:00Z',
      dueAt: '2026-07-20T00:00:00Z',
      extensionDueAt: '2026-07-25T00:00:00Z',
      submittedAt: null,
    })).toBe('extension_granted')
  })

  it('builds a stable, escaped calendar request without private response content', () => {
    const invite = buildHrCalendarInvite({
      uid: 'hr-assignment-123@example.test',
      method: 'REQUEST',
      startsAt: '2026-07-20T06:45:00Z',
      endsAt: '2026-07-20T07:00:00Z',
      timezone: 'Australia/Melbourne',
      summary: 'Business review questionnaire due',
      description: 'Complete your private review. Do not include answers here.',
      url: 'https://example.test/agency/hr/my-reviews/123',
      sequence: 0,
    })

    expect(invite).toContain('BEGIN:VCALENDAR')
    expect(invite).toContain('METHOD:REQUEST')
    expect(invite).toContain('UID:hr-assignment-123@example.test')
    expect(invite).toContain('SEQUENCE:0')
    expect(invite).not.toContain('questionnaire response')
  })
})
