import { describe, expect, it, vi } from 'vitest'
import {
  createPostgresCatalogPilotMembershipTransaction,
  listCatalogPilotMembers,
  type CatalogPilotMembershipReadDb
} from '~~/server/utils/ai/governance/catalogPilotMembership'

const RELEASE_ID = '10000000-0000-4000-8000-000000000001'
const DEPARTMENT_ID = '20000000-0000-4000-8000-000000000001'
const MEMBER_ID = '30000000-0000-4000-8000-000000000001'
const ACTOR_ID = '40000000-0000-4000-8000-000000000001'
const MEMBERSHIP_ID = '50000000-0000-4000-8000-000000000001'

function membershipRow(index = 1) {
  return {
    id: index === 1
      ? MEMBERSHIP_ID
      : `50000000-0000-4000-8000-${index.toString().padStart(12, '0')}`,
    release_id: RELEASE_ID,
    release_kind: 'pack',
    department_id: DEPARTMENT_ID,
    team_member_id: MEMBER_ID,
    member_name: 'Pilot Member',
    assigned_by: ACTOR_ID,
    assignment_reason: 'Controlled pilot.',
    assigned_at: '2026-07-22T00:00:00.000Z',
    eligible: true
  }
}

describe('Postgres catalog pilot membership adapter', () => {
  it('locks a release through a static kind mapping and returns its rollout scope', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{
      id: RELEASE_ID,
      department_id: DEPARTMENT_ID,
      release_state: 'pilot',
      rollout_scope: 'pilot'
    }] })
    const adapter = createPostgresCatalogPilotMembershipTransaction({ query })

    await expect(adapter.lockRelease('pack', RELEASE_ID)).resolves.toEqual({
      id: RELEASE_ID,
      kind: 'pack',
      departmentId: DEPARTMENT_ID,
      state: 'pilot',
      rolloutScope: 'pilot'
    })
    expect(query).toHaveBeenCalledWith(
      expect.stringMatching(/FROM ai_pack_releases[\s\S]*FOR UPDATE/),
      [RELEASE_ID]
    )
  })

  it('requires current department membership and an active employee record', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ user_id: MEMBER_ID, name: 'Pilot Member' }] })
    const adapter = createPostgresCatalogPilotMembershipTransaction({ query })

    await expect(adapter.getEligibleDepartmentMember(DEPARTMENT_ID, MEMBER_ID)).resolves.toEqual({
      userId: MEMBER_ID,
      name: 'Pilot Member'
    })
    const [sql, params] = query.mock.calls[0]!
    expect(sql).toContain('department_members')
    expect(sql).toContain('member.is_active = TRUE')
    expect(params).toEqual([DEPARTMENT_ID, MEMBER_ID])
  })

  it('uses the capability release column from a closed mapping and parameterizes all values', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{
      ...membershipRow(),
      release_kind: 'capability'
    }] })
    const adapter = createPostgresCatalogPilotMembershipTransaction({ query })

    await adapter.insertMembership({
      kind: 'capability',
      releaseId: RELEASE_ID,
      departmentId: DEPARTMENT_ID,
      memberUserId: MEMBER_ID,
      memberName: 'Pilot Member',
      actorUserId: ACTOR_ID,
      reason: 'Controlled pilot.'
    })

    const [sql, params] = query.mock.calls[0]!
    expect(sql).toContain('capability_release_id')
    expect(sql).not.toContain('pack_release_id')
    expect(params).toEqual([
      'capability',
      RELEASE_ID,
      DEPARTMENT_ID,
      MEMBER_ID,
      ACTOR_ID,
      'Controlled pilot.',
      'Pilot Member',
      true
    ])
  })

  it('revokes in place so assignment history remains auditable', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] })
    const adapter = createPostgresCatalogPilotMembershipTransaction({ query })

    await adapter.revokeMembership({
      id: MEMBERSHIP_ID,
      releaseId: RELEASE_ID,
      kind: 'pack',
      departmentId: DEPARTMENT_ID,
      memberUserId: MEMBER_ID,
      memberName: 'Pilot Member',
      assignedBy: ACTOR_ID,
      assignmentReason: 'Controlled pilot.',
      assignedAt: '2026-07-22T00:00:00.000Z',
      eligible: true
    }, { actorUserId: ACTOR_ID, reason: 'Pilot complete.' })

    const [sql, params] = query.mock.calls[0]!
    expect(sql).toContain('SET revoked_at = NOW(), revoked_by = $2, revocation_reason = $3')
    expect(sql).toContain('revoked_at IS NULL')
    expect(params).toEqual([MEMBERSHIP_ID, ACTOR_ID, 'Pilot complete.'])
  })
})

describe('listCatalogPilotMembers', () => {
  it('returns at most the live named cohort without exposing email or raw history', async () => {
    const queryRows = vi.fn()
      .mockResolvedValueOnce([{
        id: RELEASE_ID,
        department_id: DEPARTMENT_ID,
        release_state: 'pilot',
        rollout_scope: 'pilot'
      }])
      .mockResolvedValueOnce([membershipRow()])
    const db: CatalogPilotMembershipReadDb = { queryRows }

    await expect(listCatalogPilotMembers({ kind: 'pack', releaseId: RELEASE_ID }, db))
      .resolves.toEqual({
        release: {
          id: RELEASE_ID,
          kind: 'pack',
          departmentId: DEPARTMENT_ID,
          state: 'pilot',
          rolloutScope: 'pilot'
        },
        memberships: [expect.objectContaining({
          memberUserId: MEMBER_ID,
          memberName: 'Pilot Member'
        })]
      })

    const [sql, params] = queryRows.mock.calls[1]!
    expect(sql).toContain('pilot.revoked_at IS NULL')
    expect(sql).toContain('AS eligible')
    expect(sql).toContain('LIMIT 101')
    expect(sql).not.toMatch(/email|revocation_reason/i)
    expect(params).toEqual(['pack', RELEASE_ID])
  })

  it('fails closed when a cohort exceeds the bounded read contract', async () => {
    const queryRows = vi.fn()
      .mockResolvedValueOnce([{
        id: RELEASE_ID,
        department_id: DEPARTMENT_ID,
        release_state: 'pilot',
        rollout_scope: 'pilot'
      }])
      .mockResolvedValueOnce(Array.from({ length: 101 }, (_, index) => membershipRow(index + 2)))

    await expect(listCatalogPilotMembers(
      { kind: 'pack', releaseId: RELEASE_ID },
      { queryRows }
    )).rejects.toMatchObject({ code: 'pilot_cohort_unbounded', statusCode: 409 })
  })
})
