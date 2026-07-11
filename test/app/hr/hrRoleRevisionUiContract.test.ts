import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const page = readFileSync(new URL('../../../app/pages/agency/hr/roles.vue', import.meta.url), 'utf8')
const listRoute = readFileSync(new URL('../../../server/api/agency/hr/roles/index.get.ts', import.meta.url), 'utf8')

describe('HR role revision UI contract', () => {
  it('prefills and locks an existing role version for revision', () => {
    expect(page).toContain('function reviseRole(role: RoleProfile)')
    expect(page).toContain('editingRoleId')
    expect(page).toContain('expectedVersion')
    expect(page).toContain('Revise role')
    expect(page).toContain('`/api/agency/hr/roles/${editingRoleId.value}/versions`')
  })

  it('loads enough versioned data to reproduce the governed role baseline', () => {
    for (const field of ['version_status', 'decision_authority', 'dependencies', 'out_of_scope', "'description', kpi.description", "'dataOwner', kpi.data_owner", "'goalRationale', goal_link.rationale"]) {
      expect(listRoute).toContain(field)
    }
  })
})
