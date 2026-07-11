import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const route = readFileSync(
  new URL('../../server/api/agency/hr/goals/[id]/versions.post.ts', import.meta.url),
  'utf8',
)

describe('HR department goal revision API contract', () => {
  it('requires HR access, validation, optimistic locking and atomic audit', () => {
    expect(route).toContain('requireHrAdmin(event)')
    expect(route).toContain('hrDepartmentGoalRevisionSchema.safeParse')
    expect(route).toContain('FOR UPDATE')
    expect(route).toContain('input.expectedVersion')
    expect(route).toContain('statusCode: 409')
    expect(route).toContain('recordHrAuditEvent')
    expect(route).toContain('}, db)')
  })

  it('preserves history by superseding published versions instead of overwriting them', () => {
    expect(route).toContain("SET status = 'superseded'")
    expect(route).toContain('COALESCE(MAX(version), 0) + 1')
    expect(route).toContain('department_goal.revised')
  })
})
