import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync('server/database/migrations/237_hr_review_interviews.sql', 'utf8')
const interviewsGet = readFileSync('server/api/agency/hr/reviews/participants/[id]/interviews.get.ts', 'utf8')
const interviewsPost = readFileSync('server/api/agency/hr/reviews/participants/[id]/interviews.post.ts', 'utf8')
const interviewPatch = readFileSync('server/api/agency/hr/interviews/[id].patch.ts', 'utf8')
const scorecardPut = readFileSync('server/api/agency/hr/reviews/participants/[id]/scorecard.put.ts', 'utf8')
const scorecardGet = readFileSync('server/api/agency/hr/reviews/participants/[id]/scorecard.get.ts', 'utf8')
const reviewerPage = readFileSync('app/pages/agency/hr/reviews/participants/[id].vue', 'utf8')
const participantPage = readFileSync('app/pages/agency/hr/assignments/[id].vue', 'utf8')

describe('HR reviewer workflow', () => {
  it('stores interview schedule, participant summary, private notes, and calendar identity separately', () => {
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS hr_review_interviews')
    expect(migration).toContain('participant_summary')
    expect(migration).toContain('private_notes')
    expect(migration).toContain('calendar_uid')
    expect(migration).toContain('calendar_sequence')
  })

  it('authorizes interview access and never exposes private notes to participants', () => {
    expect(interviewsGet).toContain('canAccessHrParticipant')
    expect(interviewsGet).toContain('canSeePrivateNotes')
    expect(interviewsGet).toContain('privateNotes: canSeePrivateNotes')
    expect(interviewsPost).toContain("'score'")
    expect(interviewsPost).toContain('A submitted response is required before scheduling an interview')
    expect(interviewPatch).toContain("'score'")
  })

  it('schedules and cancels the same calendar event with notifications and audit records', () => {
    expect(interviewsPost).toContain('buildHrCalendarInvite')
    expect(interviewsPost).toContain('sendHrReviewLifecycleEmail')
    expect(interviewsPost).toContain('recordHrAuditEvent')
    expect(interviewPatch).toContain("method: input.status === 'cancelled' ? 'CANCEL' : 'REQUEST'")
    expect(interviewPatch).toContain('calendar_sequence = calendar_sequence + 1')
    expect(interviewPatch).toContain('hr_notification_deliveries')
  })

  it('blocks score publication until the response is submitted and role disputes are resolved', () => {
    expect(scorecardPut).toContain('response_status')
    expect(scorecardPut).toContain('role_acknowledgement_status')
    expect(scorecardPut).toContain('A submitted response is required before publication')
    expect(scorecardPut).toContain('Resolve the role baseline dispute before publication')
    expect(scorecardGet).toContain('canScore')
    expect(reviewerPage).toContain('data.participant.canScore')
  })

  it('provides scrollable reviewer controls for interviews and follow-up transitions', () => {
    expect(reviewerPage).toContain('Schedule interview')
    expect(reviewerPage).toContain('Participant-visible summary')
    expect(reviewerPage).toContain('Private reviewer notes')
    expect(reviewerPage).toContain('updateFollowUpStatus')
    expect(reviewerPage).toContain('max-h-[calc(100vh-')
    expect(participantPage).toContain('Agreed factual summary')
    expect(participantPage).toContain('/interviews')
  })
})
