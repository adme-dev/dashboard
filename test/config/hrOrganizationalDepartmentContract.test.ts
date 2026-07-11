import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const migration = readFileSync('server/database/migrations/243_hr_organizational_departments.sql', 'utf8')
const listRoute = readFileSync('server/api/agency/hr/organizational-departments/index.get.ts', 'utf8')
const assignmentRoute = readFileSync('server/api/agency/hr/organizational-departments/assignments/[memberId].patch.ts', 'utf8')
const page = readFileSync('app/pages/agency/hr/departments.vue', 'utf8')
const rolesPage = readFileSync('app/pages/agency/hr/roles.vue', 'utf8')

describe('HR organizational department boundary', () => {
  it('classifies existing Monday workspaces separately from governed organizational departments', () => {
    expect(migration).toContain('department_kind')
    expect(migration).toContain("CHECK (department_kind IN ('organizational', 'workspace'))")
    expect(migration).toContain("slug IN ('creative', 'marketing', 'production', 'account-services', 'operations')")
    expect(migration).toContain("SET department_kind = 'organizational'")
  })

  it('lists only organizational departments for HR mapping', () => {
    expect(listRoute).toContain('requireHrAdmin(event)')
    expect(listRoute).toContain("department.department_kind = 'organizational'")
    expect(listRoute).toContain('team_members')
  })

  it('validates and audits primary department assignment without changing board memberships', () => {
    expect(assignmentRoute).toContain('requireHrAdmin(event)')
    expect(assignmentRoute).toContain('hrOrganizationalDepartmentAssignmentSchema.safeParse')
    expect(assignmentRoute).toContain("department_kind = 'organizational'")
    expect(assignmentRoute).toContain('UPDATE team_members')
    expect(assignmentRoute).not.toContain('department_members')
    expect(assignmentRoute).toContain("action: 'organizational_department.assigned'")
    expect(assignmentRoute).toContain('recordHrAuditEvent')
  })

  it('provides a scroll-safe owner mapping workspace with a route from the role library', () => {
    expect(page).toContain("'/api/agency/hr/organizational-departments'")
    expect(page).toContain('overflow-y-auto')
    expect(page).toContain('Primary organisational department')
    expect(page).toContain('assignDepartment')
    expect(rolesPage).toContain('Map departments')
    expect(rolesPage).toContain('/agency/hr/departments')
  })
})
