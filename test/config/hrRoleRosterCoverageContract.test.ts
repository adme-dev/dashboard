import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const route = readFileSync('server/api/agency/hr/roles/index.get.ts', 'utf8')
const page = readFileSync('app/pages/agency/hr/roles.vue', 'utf8')

describe('HR role roster coverage contract', () => {
  it('returns every active member with current governed assignment state', () => {
    expect(route).toContain('activeMembers')
    expect(route).toContain('current_assignment_id')
    expect(route).toContain('current_role_version_id')
    expect(route).toContain('WHERE member.is_active = TRUE')
  })

  it('keeps assignment human-confirmed and explains deterministic suggestions', () => {
    expect(page).toContain('Role assignment coverage')
    expect(page).toContain('suggestionReason')
    expect(page).toContain('Review assignment')
    expect(page).not.toContain('autoAssignRole')
  })
})
