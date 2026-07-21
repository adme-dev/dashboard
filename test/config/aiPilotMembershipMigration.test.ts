import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  new URL('../../server/database/migrations/272_ai_release_pilot_membership.sql', import.meta.url),
  'utf8'
)
const runbook = readFileSync(
  new URL('../../docs/runbooks/ai-release-pilot-membership-migration-272.md', import.meta.url),
  'utf8'
)

describe('AI release pilot membership migration 272', () => {
  it('binds every pilot assignment to one release, one department, and one department member', () => {
    expect(migration).toContain('rollout_scope')
    expect(migration).toContain('release_state = \'pilot\' AND rollout_scope = \'pilot\'')
    expect(migration).toContain('release_state = \'active\' AND rollout_scope = \'department\'')
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS ai_release_pilot_members')
    expect(migration).toContain('REFERENCES ai_pack_releases(id, department_id)')
    expect(migration).toContain('REFERENCES ai_capability_releases(id, department_id)')
    expect(migration).toContain('validate_ai_release_pilot_department_member')
    expect(migration).toContain('FOR KEY SHARE')
    expect(migration).not.toContain('FOREIGN KEY (department_id, team_member_id)')
    expect(migration).toContain('release_kind = \'pack\'')
    expect(migration).toContain('release_kind = \'capability\'')
  })

  it('allows only one live assignment per release and member while retaining revocation history', () => {
    expect(migration).toContain('WHERE revoked_at IS NULL')
    expect(migration).toContain('revoked_by')
    expect(migration).toContain('revocation_reason')
    expect(migration).toContain('assigned_by')
    expect(migration).toContain('assignment_reason')
  })

  it('revalidates current department membership at insertion without blocking later transfers', () => {
    expect(migration).toContain('BEFORE INSERT OR UPDATE OF department_id, team_member_id')
    expect(migration).toContain('ERRCODE = \'23503\'')
  })

  it('is additive and does not enroll or activate anyone', () => {
    expect(migration).not.toMatch(/INSERT\s+INTO\s+ai_release_pilot_members/i)
    expect(migration).not.toMatch(/SET\s+release_state/i)
  })

  it('documents migrate-before-code ordering, zero-enrollment evidence, and non-destructive rollback', () => {
    expect(runbook).toContain('must be applied before merging')
    expect(runbook).toContain('pilot_memberships` is `0`')
    expect(runbook).toContain('release-state counts match the preflight')
    expect(runbook).toContain('do not drop them during an incident')
  })
})
