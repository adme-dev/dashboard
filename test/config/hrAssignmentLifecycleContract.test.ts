import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const route = readFileSync('server/api/agency/hr/assignments/[id]/schedule.patch.ts', 'utf8')
const migration = readFileSync('server/database/migrations/236_hr_assignment_delivery_lifecycle.sql', 'utf8')
const reviewsPage = readFileSync('app/pages/agency/hr/reviews.vue', 'utf8')
const reviewsRoute = readFileSync('server/api/agency/hr/reviews/index.get.ts', 'utf8')

describe('HR assignment delivery lifecycle', () => {
  it('versions delivery idempotency by effective deadline and action', () => {
    expect(migration).toContain('delivery_key')
    expect(migration).toContain('assignment_id, recipient_id, channel, kind, delivery_key')
    expect(migration).toContain("'reschedule', 'cancel', 'reopen'")
  })

  it('allows only HR managers to change schedules with a reason', () => {
    expect(route).toContain('requireHrAdmin(event)')
    expect(route).toContain('hrAssignmentScheduleChangeSchema.safeParse')
    expect(route).toContain('calendar_sequence = calendar_sequence + 1')
    expect(route).toContain('buildHrCalendarInvite')
    expect(route).toContain('sendHrReviewLifecycleEmail')
    expect(route).toContain('recordHrAuditEvent')
  })

  it('updates the same calendar UID and uses cancellation semantics when required', () => {
    expect(route).toContain('assignment.calendar_uid')
    expect(route).toContain("method: input.action === 'cancel' ? 'CANCEL' : 'REQUEST'")
    expect(route).toContain('UPDATE hr_responses')
    expect(route).toContain("status = 'draft', submitted_at = NULL, locked_at = NULL")
  })

  it('gives HR owners a scrollable, reasoned schedule-control workflow', () => {
    expect(reviewsRoute).toContain('calendar_sequence')
    expect(reviewsRoute).toContain('extension_due_at')
    expect(reviewsPage).toContain('Manage deadline')
    expect(reviewsPage).toContain('expectedCalendarSequence')
    expect(reviewsPage).toContain('max-h-[calc(100vh-')
    expect(reviewsPage).toContain('Reason for this change')
  })
})
