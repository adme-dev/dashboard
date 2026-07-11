import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const assignmentRoute = readFileSync('server/api/agency/hr/assignments/[id]/index.get.ts', 'utf8')
const responseRoute = readFileSync('server/api/agency/hr/assignments/[id]/response.put.ts', 'utf8')
const assignmentPage = readFileSync('app/pages/agency/hr/assignments/[id].vue', 'utf8')

describe('HR participant response privacy and locking', () => {
  it('keeps draft answers visible only to the participant', () => {
    expect(assignmentRoute).toContain("['submitted', 'locked'].includes(assignment.response_status)")
    expect(assignmentRoute).not.toContain('isParticipant || canManageHr(user) ||')
    expect(assignmentRoute).toContain('response: canSeeAnswers')
  })

  it('locks submitted responses until an audited owner reopen action', () => {
    expect(responseRoute).toContain("['submitted', 'locked'].includes(assignment.response_status)")
    expect(responseRoute).toContain("locked_at = CASE WHEN EXCLUDED.status = 'submitted' THEN NOW() ELSE NULL END")
    expect(assignmentRoute).toContain("!['submitted', 'locked'].includes(assignment.response_status)")
    expect(assignmentRoute).toContain("assignment.status !== 'closed'")
    expect(responseRoute).toContain("assignment.status === 'closed'")
    expect(responseRoute).toContain('FOR UPDATE')
    expect(responseRoute).toContain('lockedResponse.status')
  })

  it('requires participant confirmation before the irreversible submit action', () => {
    expect(assignmentPage).toContain('showSubmitConfirmation')
    expect(assignmentPage).toContain('Submit and lock response')
    expect(assignmentPage).toContain('Your draft remains private')
  })
})
