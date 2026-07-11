import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const route = readFileSync(
  new URL('../../server/api/agency/hr/roles/[id]/versions.post.ts', import.meta.url),
  'utf8',
)

describe('HR role profile revision API contract', () => {
  it('uses validation, HR authorization and optimistic version locking', () => {
    expect(route).toContain('requireHrAdmin(event)')
    expect(route).toContain('hrRoleProfileRevisionSchema.safeParse')
    expect(route).toContain('FOR UPDATE')
    expect(route).toContain('input.expectedVersion')
    expect(route).toContain('statusCode: 409')
  })

  it('creates version-locked KPIs, scorecard and questionnaire without changing historical versions', () => {
    expect(route).toContain('hr_role_profile_versions')
    expect(route).toContain('hr_role_kpi_definitions')
    expect(route).toContain('hr_role_scorecard_versions')
    expect(route).toContain('hr_questionnaire_versions')
    expect(route).toContain("SET status = 'superseded'")
    expect(route).toContain('role_profile.revised')
    expect(route).toContain('}, db)')
  })
})
