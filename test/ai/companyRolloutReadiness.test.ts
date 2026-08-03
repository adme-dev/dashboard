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
  return { id, name: id === departmentId ? 'Creative' : 'Media', owner_ready: true, ...overrides }
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
    release_id: releaseId,
    release_state: 'active',
    evaluation_gate_passed: true,
    evaluation_run_status: 'completed',
    ...overrides
  }
}

function pilot(overrides: Record<string, unknown> = {}) {
  return { team_member_id: employeeId, release_id: releaseId, ...overrides }
}

function readinessDb(rows: unknown[][]): CompanyRolloutReadinessDb {
  return { queryRows: vi.fn().mockImplementation(async () => rows.shift() ?? []) }
}

describe('company assistant rollout readiness', () => {
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
      if (sql.includes('FROM ai_capability_packs pack')) return [release()]
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

  it('ignores inactive employees and revoked pilot memberships', async () => {
    const result = await getCompanyAssistantRolloutReadiness(readinessDb([
      [department()], [employee()], [membership()], [release({ release_state: 'pilot' })], []
    ]))

    expect(result.activeEmployeeCount).toBe(1)
    expect(result.readyForPilot).toBe(false)
    expect(result.blockers).toContain('no_eligible_pilot_membership')
  })

  it('passes pilot readiness while other non-pilot departments remain draft', async () => {
    const result = await getCompanyAssistantRolloutReadiness(readinessDb([
      [department(), department(secondDepartmentId)], [employee()], [membership()], [release({ release_state: 'pilot' }), release({ department_id: secondDepartmentId, release_id: '30000000-0000-4000-8000-000000000002', release_state: 'draft', evaluation_gate_passed: null, evaluation_run_status: null })], [pilot()]
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
})
