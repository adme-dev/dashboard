import { describe, expect, it, vi } from 'vitest'
import { DEPARTMENT_PACK_BLUEPRINTS } from '~~/server/utils/ai/governance/departmentPackBlueprints'
import {
  DepartmentPackReadinessError,
  getDepartmentPackReadiness,
  type DepartmentPackReadinessDb
} from '~~/server/utils/ai/governance/departmentPackReadiness'
import { registry } from '~~/server/utils/ai/tools'

const toolMetadata = registry.map(tool => ({ name: tool.name, mutates: tool.mutates === true }))

function department(index: number, overrides: Record<string, unknown> = {}) {
  return {
    id: `10000000-0000-4000-8000-${index.toString().padStart(12, '0')}`,
    name: `Department ${index}`,
    slug: `department-${index}`,
    manager_id: null,
    manager_name: null,
    manager_is_active: null,
    manager_is_member: false,
    ...overrides
  }
}

describe('department assistant pack readiness', () => {
  it('matches organizational departments and reports every owner blocker without guessing', async () => {
    const rows = [
      department(1, { name: 'Creative', slug: 'creative', manager_id: '20000000-0000-4000-8000-000000000001', manager_name: 'Creative Manager', manager_is_active: true, manager_is_member: true }),
      department(2, { name: 'Marketing', slug: 'marketing' }),
      department(3, { name: 'Production', slug: 'production', manager_id: '20000000-0000-4000-8000-000000000003', manager_name: 'Former Manager', manager_is_active: false, manager_is_member: true }),
      department(4, { name: 'Account Services', slug: 'account-services', manager_id: '20000000-0000-4000-8000-000000000004', manager_name: 'Account Manager', manager_is_active: true, manager_is_member: false }),
      department(5, { name: 'Operations', slug: 'operations' }),
      department(6, { name: 'Ops', slug: 'ops' })
    ]
    const queryRows = vi.fn().mockResolvedValue(rows)
    const db: DepartmentPackReadinessDb = { queryRows }

    const result = await getDepartmentPackReadiness(db, DEPARTMENT_PACK_BLUEPRINTS, toolMetadata)

    expect(result.summary).toEqual({
      total: 12,
      readyForOwnerConfirmation: 1,
      blocked: 11,
      missingDepartments: 7
    })
    expect(result.items.find(item => item.key === 'creative')).toMatchObject({
      status: 'ready_for_owner_confirmation',
      ownerCandidate: { id: '20000000-0000-4000-8000-000000000001', name: 'Creative Manager', source: 'department_manager' }
    })
    expect(result.items.find(item => item.key === 'marketing')?.status).toBe('missing_owner')
    expect(result.items.find(item => item.key === 'production')?.status).toBe('owner_inactive')
    expect(result.items.find(item => item.key === 'account_management')?.status).toBe('owner_not_member')
    expect(result.items.find(item => item.key === 'operations')?.status).toBe('ambiguous_department')
    expect(result.items.find(item => item.key === 'paid_media')?.status).toBe('missing_department')
    expect(result.items.every(item => item.releaseState === 'not_seeded')).toBe(true)

    const [sql, params] = queryRows.mock.calls[0]!
    expect(params).toEqual([])
    expect(sql).toContain('department.department_kind = \'organizational\'')
    expect(sql).toContain('department.is_active = TRUE')
    expect(sql).toContain('department_members')
    expect(sql).toContain('LIMIT 101')
  })

  it('fails closed when the checked-in blueprint manifest is invalid', async () => {
    const invalid = structuredClone(DEPARTMENT_PACK_BLUEPRINTS)
    invalid[0]!.capabilities[0]!.toolBindings[0]!.toolName = 'not_registered'

    await expect(getDepartmentPackReadiness(
      { queryRows: vi.fn().mockResolvedValue([]) },
      invalid,
      toolMetadata
    )).rejects.toMatchObject({ code: 'blueprint_integrity_error', statusCode: 500 })
  })

  it('bounds organizational input and rejects malformed database identity rows', async () => {
    await expect(getDepartmentPackReadiness(
      { queryRows: vi.fn().mockResolvedValue(Array.from({ length: 101 }, (_, index) => department(index + 1))) },
      DEPARTMENT_PACK_BLUEPRINTS,
      toolMetadata
    )).rejects.toBeInstanceOf(DepartmentPackReadinessError)

    await expect(getDepartmentPackReadiness(
      { queryRows: vi.fn().mockResolvedValue([department(1, { id: 'not-a-uuid', name: 'Creative', slug: 'creative' })]) },
      DEPARTMENT_PACK_BLUEPRINTS,
      toolMetadata
    )).rejects.toMatchObject({ code: 'invalid_department_record', statusCode: 500 })
  })
})
