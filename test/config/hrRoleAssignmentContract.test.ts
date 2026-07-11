import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

describe('HR pre-review role assignment contract', () => {
  it('provides an owner-only validated and audited assignment API', () => {
    const route = readFileSync('server/api/agency/hr/role-assignments/index.post.ts', 'utf8')

    expect(route).toContain('requireHrAdmin(event)')
    expect(route).toContain('hrRoleAssignmentSchema.safeParse')
    expect(route).toContain("version.status = 'published'")
    expect(route).toContain('member.is_active = TRUE')
    expect(route).toContain('effective_to IS NULL')
    expect(route).toContain('recordHrAuditEvent')
    expect(route).toContain("action: 'role_assignment.created'")
  })

  it('surfaces pre-review assignment controls in the roles workspace', () => {
    const page = readFileSync('app/pages/agency/hr/roles.vue', 'utf8')

    expect(page).toContain("'/api/agency/hr/role-assignments'")
    expect(page).toContain('Assign published role')
    expect(page).toContain('selectedTeamMemberId')
    expect(page).toContain('selectedRoleVersionId')
  })
})
