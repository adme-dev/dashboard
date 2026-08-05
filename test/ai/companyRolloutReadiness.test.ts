import { describe, expect, it, vi } from 'vitest'
import {
  getCompanyAssistantRolloutReadiness,
  type CompanyRolloutReadinessDb
} from '~~/server/utils/ai/governance/companyRolloutReadiness'

const departmentId = '10000000-0000-4000-8000-000000000001'
const secondDepartmentId = '10000000-0000-4000-8000-000000000002'
const employeeId = '20000000-0000-4000-8000-000000000001'
const secondEmployeeId = '20000000-0000-4000-8000-000000000002'
const releaseId = '30000000-0000-4000-8000-000000000001'

function department(id = departmentId, overrides: Record<string, unknown> = {}) {
  return { id, name: id === departmentId ? 'Creative' : 'Media', slug: id === departmentId ? 'creative' : 'media', owner_ready: true, ...overrides }
}

function employee(id = employeeId, overrides: Record<string, unknown> = {}) {
  return { id, name: id === employeeId ? 'Alex Example' : 'Blair Example', role: 'staff', ...overrides }
}

function membership(userId = employeeId, departmentIds: string[] = [departmentId]) {
  return { user_id: userId, department_ids: departmentIds }
}

function release(overrides: Record<string, unknown> = {}) {
  return {
    department_id: departmentId,
    pack_id: '40000000-0000-4000-8000-000000000001',
    pack_key: 'creative_read_draft',
    pack_version_id: '50000000-0000-4000-8000-000000000001',
    pack_version: 1,
    release_id: releaseId,
    release_state: 'active',
    evaluation_gate_passed: true,
    evaluation_run_status: 'completed',
    owner_user_id: employeeId,
    owner_is_active: true,
    owner_is_department_member: true,
    ...overrides
  }
}

function pilot(overrides: Record<string, unknown> = {}) {
  return {
    team_member_id: employeeId,
    release_id: releaseId,
    department_id: departmentId,
    release_department_id: departmentId,
    is_current_department_member: true,
    ...overrides
  }
}

function readinessDb(rows: unknown[][]): CompanyRolloutReadinessDb {
  return {
    queryRows: vi.fn().mockImplementation(async (sql: string) => sql.includes('active_owner_count')
      ? [{ active_owner_count: 0 }]
      : rows.shift() ?? [])
  }
}

function repositoryFixture(input: {
  members: Array<{ id: string, name: string, role: string, active: boolean, departmentIds: string[] }>
  releases: unknown[]
  pilots: Array<ReturnType<typeof pilot> & { revoked: boolean }>
}): CompanyRolloutReadinessDb {
  const activeMembers = input.members.filter(member => member.active)
  return readinessDb([
    [department()],
    activeMembers.map(member => ({ id: member.id, name: member.name, role: member.role })),
    activeMembers.map(member => membership(member.id, member.departmentIds)),
    input.releases,
    input.pilots
      .filter(member => !member.revoked && activeMembers.some(active => active.id === member.team_member_id))
      .map(({ revoked: _revoked, ...member }) => member)
  ])
}

describe('company assistant rollout readiness', () => {
  it('counts only active exact-role owners independently of pilot membership', async () => {
    const queryRows = vi.fn(async (sql: string) => {
      if (sql.includes('active_owner_count')) return [{ active_owner_count: 2 }]
      if (sql.includes('ai_release_pilot_members')) return Array.from({ length: 20 }, () => pilot())
      if (sql.includes('ai_capability_packs pack')) return [release({ release_state: 'pilot' })]
      if (sql.includes('ARRAY_AGG')) return [membership()]
      if (sql.includes('FROM departments department')) return [department()]
      if (sql.includes('FROM team_members member')) return [employee()]
      return []
    })

    const result = await getCompanyAssistantRolloutReadiness({ queryRows }, { emergencyDisabled: false })
    const ownerSql = queryRows.mock.calls.map(([sql]) => sql).find(sql => sql.includes('active_owner_count'))!

    expect(result.godMode).toEqual({ activeOwnerCount: 2, emergencyDisabled: false })
    expect(ownerSql).toContain('member.user_role = \'owner\'')
    expect(ownerSql).toContain('member.is_active = TRUE')
    expect(ownerSql).not.toContain('ai_release_pilot_members')
    const employeeSql = queryRows.mock.calls.map(([sql]) => sql).find(sql => sql.includes('SELECT member.id, member.name, member.role'))!
    const pilotSql = queryRows.mock.calls.map(([sql]) => sql).find(sql => sql.includes('ai_release_pilot_members'))!
    expect(employeeSql).toContain('member.user_role <> \'owner\'')
    expect(pilotSql).toContain('member.user_role <> \'owner\'')
  })

  it('reports the emergency disable state without changing employee rollout metrics', async () => {
    const result = await getCompanyAssistantRolloutReadiness(readinessDb([
      [department()], [employee()], [membership()], [release({ release_state: 'draft' })], []
    ]), { emergencyDisabled: true })

    expect(result.godMode).toEqual({ activeOwnerCount: 0, emergencyDisabled: true })
    expect(result.departmentCoverage[0]).toMatchObject({ releaseState: 'draft', latestGatePassed: true })
    expect(result.readyForEnforcement).toBe(false)
  })

  it('blocks enforcement when one active employee has no organizational department', async () => {
    const result = await getCompanyAssistantRolloutReadiness(readinessDb([
      [department()], [employee()], [membership(employeeId, [])], [release()], [pilot()]
    ]))

    expect(result.readyForEnforcement).toBe(false)
    expect(result.uncoveredEmployees).toEqual([{ userId: employeeId, name: 'Alex Example', role: 'staff', reasons: ['no_department'] }])
    expect(result.blockers).toContain(`employee:${employeeId}:no_department`)
  })

  it('blocks enforcement when a department has only a draft release', async () => {
    const result = await getCompanyAssistantRolloutReadiness(readinessDb([
      [department()], [employee()], [membership()], [release({ release_state: 'draft', evaluation_gate_passed: null, evaluation_run_status: null })], []
    ]))

    expect(result.readyForEnforcement).toBe(false)
    expect(result.departmentCoverage).toEqual([expect.objectContaining({ departmentId, releaseState: 'draft', latestGatePassed: false })])
    expect(result.uncoveredEmployees[0]?.reasons).toEqual(['no_evaluated_release'])
    expect(result.blockers).toContain(`department:${departmentId}:release_draft`)
  })

  it('does not count an employee as covered by an evaluated draft release', async () => {
    const result = await getCompanyAssistantRolloutReadiness(readinessDb([
      [department()], [employee()], [membership()], [release({ release_state: 'draft' })], []
    ]))

    expect(result.coveredEmployeeCount).toBe(0)
    expect(result.uncoveredEmployees).toEqual([{ userId: employeeId, name: 'Alex Example', role: 'staff', reasons: ['no_evaluated_release'] }])
    expect(result.readyForEnforcement).toBe(false)
  })

  it('does not count an employee as covered by an evaluated pilot release', async () => {
    const result = await getCompanyAssistantRolloutReadiness(readinessDb([
      [department()], [employee()], [membership()], [release({ release_state: 'pilot' })], [pilot()]
    ]))

    expect(result.coveredEmployeeCount).toBe(0)
    expect(result.uncoveredEmployees).toEqual([{ userId: employeeId, name: 'Alex Example', role: 'staff', reasons: ['no_evaluated_release'] }])
    expect(result.readyForPilot).toBe(true)
    expect(result.readyForEnforcement).toBe(false)
  })

  it('blocks enforcement when the latest evaluation gate failed', async () => {
    const result = await getCompanyAssistantRolloutReadiness(readinessDb([
      [department()], [employee()], [membership()], [release({ release_state: 'draft', evaluation_gate_passed: false, evaluation_run_status: 'completed' })], []
    ]))

    expect(result.readyForEnforcement).toBe(false)
    expect(result.departmentCoverage[0]).toMatchObject({ latestGatePassed: false })
    expect(result.blockers).toContain(`department:${departmentId}:evaluation_gate_failed`)
  })

  it('accepts an employee covered by two departments without double counting', async () => {
    const result = await getCompanyAssistantRolloutReadiness(readinessDb([
      [department(), department(secondDepartmentId)], [employee()], [membership(employeeId, [departmentId, secondDepartmentId])], [release(), release({ department_id: secondDepartmentId, release_id: '30000000-0000-4000-8000-000000000002' })], [pilot()]
    ]))

    expect(result.activeEmployeeCount).toBe(1)
    expect(result.coveredEmployeeCount).toBe(1)
    expect(result.uncoveredEmployees).toEqual([])
  })

  it('recognizes a primary organizational department assignment as coverage', async () => {
    const queryRows = vi.fn(async (sql: string) => {
      if (sql.includes('active_owner_count')) return [{ active_owner_count: 0 }]
      if (sql.includes('ai_capability_packs pack')) return [release()]
      if (sql.includes('ARRAY_AGG')) {
        return sql.includes('member.department_id') ? [membership()] : [membership(employeeId, [])]
      }
      if (sql.includes('FROM departments department')) return [department()]
      if (sql.includes('FROM team_members member')) return [employee()]
      return [pilot()]
    })

    const result = await getCompanyAssistantRolloutReadiness({ queryRows })

    expect(result.coveredEmployeeCount).toBe(1)
    expect(result.uncoveredEmployees).toEqual([])
  })

  it('uses the highest material version of the canonical department pack, not an unrelated pack', async () => {
    const result = await getCompanyAssistantRolloutReadiness(readinessDb([
      [department()],
      [employee()],
      [membership()],
      [
        release({
          pack_id: '40000000-0000-4000-8000-000000000002',
          pack_key: 'unrelated_read_draft',
          pack_version_id: '50000000-0000-4000-8000-000000000002',
          release_id: '30000000-0000-4000-8000-000000000002',
          release_state: 'draft',
          evaluation_gate_passed: null,
          evaluation_run_status: null
        }),
        release({ release_state: 'draft', evaluation_gate_passed: null, evaluation_run_status: null }),
        release({
          pack_version_id: '50000000-0000-4000-8000-000000000003',
          pack_version: 2,
          release_id: '30000000-0000-4000-8000-000000000003'
        })
      ],
      []
    ]))

    expect(result.departmentCoverage).toEqual([expect.objectContaining({ releaseState: 'active', latestGatePassed: true })])
    expect(result.readyForEnforcement).toBe(true)
  })

  it('resolves a canonical pack by the organizational department slug', async () => {
    const result = await getCompanyAssistantRolloutReadiness(readinessDb([
      [department(departmentId, { name: 'Creative Delivery', slug: 'creative' })], [employee()], [membership()], [release()], []
    ]))

    expect(result.departmentCoverage[0]).toMatchObject({ releaseState: 'active', ownerReady: true })
  })

  it('fails closed when canonical mapped release rows are ambiguous', async () => {
    const result = await getCompanyAssistantRolloutReadiness(readinessDb([
      [department()], [employee()], [membership()], [
        release(),
        release({ release_id: '30000000-0000-4000-8000-000000000002' })
      ], []
    ]))

    expect(result.readyForEnforcement).toBe(false)
    expect(result.blockers).toContain(`department:${departmentId}:ambiguous_mapped_pack`)
  })

  it('requires the canonical governed pack owner to be active and a current department member', async () => {
    const result = await getCompanyAssistantRolloutReadiness(readinessDb([
      [department()], [employee()], [membership()], [release({ owner_is_active: false, owner_is_department_member: false })], []
    ]))

    expect(result.departmentCoverage[0]).toMatchObject({ ownerReady: false })
    expect(result.blockers).toContain(`department:${departmentId}:owner_not_ready`)
    expect(result.readyForEnforcement).toBe(false)
  })

  it('ignores inactive employees and revoked pilot memberships', async () => {
    const result = await getCompanyAssistantRolloutReadiness(readinessDb([
      [department()], [employee()], [membership()], [release({ release_state: 'pilot' })], []
    ]))

    expect(result.activeEmployeeCount).toBe(1)
    expect(result.readyForPilot).toBe(false)
    expect(result.blockers).toContain('no_eligible_pilot_membership')
  })

  it('does not count a stale pilot whose current department membership was removed', async () => {
    const result = await getCompanyAssistantRolloutReadiness(readinessDb([
      [department()], [employee()], [membership()], [release({ release_state: 'pilot' })], [pilot({ is_current_department_member: false })]
    ]))

    expect(result.readyForPilot).toBe(false)
    expect(result.blockers).toContain('no_eligible_pilot_membership')
  })

  it('does not let an unrelated pack release satisfy pilot readiness', async () => {
    const unrelatedReleaseId = '30000000-0000-4000-8000-000000000002'
    const result = await getCompanyAssistantRolloutReadiness(readinessDb([
      [department()], [employee()], [membership()], [
        release(),
        release({
          pack_id: '40000000-0000-4000-8000-000000000002',
          pack_key: 'unrelated_read_draft',
          pack_version_id: '50000000-0000-4000-8000-000000000002',
          release_id: unrelatedReleaseId,
          release_state: 'pilot'
        })
      ],
      [pilot({ release_id: unrelatedReleaseId })]
    ]))

    expect(result.readyForPilot).toBe(false)
    expect(result.blockers).toContain('no_evaluated_pilot_release')
  })

  it('ignores inactive employees and revoked pilot memberships from repository fixtures', async () => {
    const inactiveEmployeeId = '20000000-0000-4000-8000-000000000003'
    const result = await getCompanyAssistantRolloutReadiness(repositoryFixture({
      members: [
        { id: employeeId, name: 'Alex Example', role: 'staff', active: true, departmentIds: [departmentId] },
        { id: inactiveEmployeeId, name: 'Former Example', role: 'staff', active: false, departmentIds: [departmentId] }
      ],
      releases: [release({ release_state: 'pilot' })],
      pilots: [{ ...pilot(), revoked: true }]
    }))

    expect(result.activeEmployeeCount).toBe(1)
    expect(result.readyForPilot).toBe(false)
  })

  it('passes pilot readiness while other non-pilot departments remain draft', async () => {
    const result = await getCompanyAssistantRolloutReadiness(readinessDb([
      [department(), department(secondDepartmentId, { name: 'Paid Media', slug: 'paid-media' })], [employee()], [membership()], [release({ release_state: 'pilot' }), release({
        department_id: secondDepartmentId,
        pack_id: '40000000-0000-4000-8000-000000000002',
        pack_key: 'paid_media_read_draft',
        pack_version_id: '50000000-0000-4000-8000-000000000002',
        release_id: '30000000-0000-4000-8000-000000000002',
        release_state: 'draft',
        evaluation_gate_passed: null,
        evaluation_run_status: null
      })], [pilot()]
    ]))

    expect(result.readyForPilot).toBe(true)
    expect(result.readyForEnforcement).toBe(false)
  })

  it('passes enforcement only when every active employee is covered', async () => {
    const result = await getCompanyAssistantRolloutReadiness(readinessDb([
      [department()], [employee(), employee(secondEmployeeId)], [membership(employeeId), membership(secondEmployeeId)], [release()], []
    ]))

    expect(result.readyForEnforcement).toBe(true)
    expect(result.coveredEmployeeCount).toBe(2)
    expect(result.uncoveredEmployees).toEqual([])
  })

  it('adds a stable enforcement blocker when a covered department remains pilot-only', async () => {
    const result = await getCompanyAssistantRolloutReadiness(readinessDb([
      [department()], [employee()], [membership()], [release({ release_state: 'pilot' })], [pilot()]
    ]))

    expect(result.readyForPilot).toBe(true)
    expect(result.readyForEnforcement).toBe(false)
    expect(result.blockers).toContain(`department:${departmentId}:release_pilot`)
  })

  it.each([
    ['departments', 'departments_unbounded', [Array.from({ length: 101 }, () => department()), [], [], [], []]],
    ['employees', 'employees_unbounded', [[department()], Array.from({ length: 101 }, () => employee()), [], [], []]],
    ['employee departments', 'employee_departments_unbounded', [[department()], [employee()], Array.from({ length: 101 }, () => membership()), [], []]],
    ['releases', 'releases_unbounded', [[department()], [employee()], [membership()], Array.from({ length: 101 }, () => release()), []]],
    ['pilot memberships', 'pilot_memberships_unbounded', [[department()], [employee()], [membership()], [release({ release_state: 'pilot' })], Array.from({ length: 101 }, () => pilot())]]
  ])('fails closed with a stable code when %s exceed the 101-row sentinel', async (_source, code, rows) => {
    await expect(getCompanyAssistantRolloutReadiness(readinessDb(rows))).rejects.toMatchObject({ code })
  })

  it('fails closed with stable codes for invalid catalog identifiers and states', async () => {
    await expect(getCompanyAssistantRolloutReadiness(readinessDb([
      [department()], [employee()], [membership()], [release({ release_id: 'not-a-uuid' })], []
    ]))).rejects.toMatchObject({ code: 'invalid_release_row' })

    await expect(getCompanyAssistantRolloutReadiness(readinessDb([
      [department()], [employee()], [membership()], [release({ release_state: 'deleted' })], []
    ]))).rejects.toMatchObject({ code: 'invalid_release_row' })
  })

  it('converts database failures into a stable readiness code', async () => {
    await expect(getCompanyAssistantRolloutReadiness({
      queryRows: vi.fn().mockRejectedValue(new Error('database password must not leak'))
    })).rejects.toMatchObject({ code: 'readiness_query_failed' })
  })
})
