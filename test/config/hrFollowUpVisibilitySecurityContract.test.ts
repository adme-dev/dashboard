import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const createFollowUp = readFileSync(new URL('../../server/api/agency/hr/reviews/participants/[id]/follow-ups.post.ts', import.meta.url), 'utf8')
const overview = readFileSync(new URL('../../server/api/agency/hr/index.get.ts', import.meta.url), 'utf8')

describe('HR follow-up visibility security', () => {
  it('does not notify or expose HR-only actions to the participant', () => {
    expect(createFollowUp).toContain("input.visibility === 'participant_and_hr'")
    expect(createFollowUp).toContain('An HR-only follow-up cannot be assigned to the participant')
    expect(overview).toContain("participant.team_member_id = $1 AND follow_up.visibility = 'participant_and_hr'")
  })

  it('still exposes a restricted action to its accountable owner', () => {
    expect(overview).toContain('OR follow_up.owner_id = $1')
  })
})
