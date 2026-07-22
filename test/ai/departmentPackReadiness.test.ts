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
    const queryRows = vi.fn()
      .mockResolvedValueOnce(rows)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
    const db: DepartmentPackReadinessDb = { queryRows }

    const result = await getDepartmentPackReadiness(db, DEPARTMENT_PACK_BLUEPRINTS, toolMetadata)

    expect(result.summary).toEqual({
      total: 12,
      readyForOwnerConfirmation: 1,
      blocked: 11,
      missingDepartments: 7,
      draftSeeded: 0,
      released: 0
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

  it('surfaces bounded owner candidates without treating primary assignment as catalog eligibility', async () => {
    const queryRows = vi.fn()
      .mockResolvedValueOnce([
        department(1, { name: 'Marketing', slug: 'marketing' })
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          department_id: '10000000-0000-4000-8000-000000000001',
          user_id: '20000000-0000-4000-8000-000000000001',
          user_name: 'Morgan Lead',
          membership_role: 'lead',
          is_explicit_member: true,
          is_primary_assignment: true,
          is_department_manager: false
        },
        {
          department_id: '10000000-0000-4000-8000-000000000001',
          user_id: '20000000-0000-4000-8000-000000000002',
          user_name: 'Taylor Assigned',
          membership_role: null,
          is_explicit_member: false,
          is_primary_assignment: true,
          is_department_manager: false
        }
      ])

    const result = await getDepartmentPackReadiness(
      { queryRows },
      DEPARTMENT_PACK_BLUEPRINTS,
      toolMetadata
    )

    expect(result.items.find(item => item.key === 'marketing')).toMatchObject({
      status: 'missing_owner',
      ownerCandidate: null,
      ownerCandidates: [
        {
          id: '20000000-0000-4000-8000-000000000001',
          name: 'Morgan Lead',
          source: 'department_member',
          membershipRole: 'lead',
          isManager: false,
          eligible: true
        },
        {
          id: '20000000-0000-4000-8000-000000000002',
          name: 'Taylor Assigned',
          source: 'primary_department_assignment',
          membershipRole: null,
          isManager: false,
          eligible: false
        }
      ]
    })
    expect(result.summary).toMatchObject({ readyForOwnerConfirmation: 0, blocked: 12 })

    const [candidateSql, candidateParams] = queryRows.mock.calls[2]!
    expect(candidateParams).toEqual([])
    expect(candidateSql).toContain('department_members')
    expect(candidateSql).toContain('member.department_id')
    expect(candidateSql).toContain('LIMIT 1001')
    expect(candidateSql).not.toContain('member.email')
  })

  it('reports an existing draft from catalog authority instead of claiming it is unseeded', async () => {
    const queryRows = vi.fn()
      .mockResolvedValueOnce([
        department(1, { name: 'Creative', slug: 'creative', manager_id: '20000000-0000-4000-8000-000000000009', manager_name: 'Different Manager', manager_is_active: true, manager_is_member: true })
      ])
      .mockResolvedValueOnce([{
        department_id: '10000000-0000-4000-8000-000000000001',
        pack_key: 'creative_read_draft',
        pack_id: '30000000-0000-4000-8000-000000000001',
        pack_version_id: '30000000-0000-4000-8000-000000000002',
        pack_release_id: '30000000-0000-4000-8000-000000000003',
        owner_user_id: '20000000-0000-4000-8000-000000000001',
        owner_name: 'Confirmed Pack Owner',
        owner_is_active: true,
        owner_is_department_member: true,
        version: 1,
        release_state: 'draft'
      }])
      .mockResolvedValueOnce([])

    const result = await getDepartmentPackReadiness(
      { queryRows },
      DEPARTMENT_PACK_BLUEPRINTS,
      toolMetadata
    )

    expect(result.items.find(item => item.key === 'creative')).toMatchObject({
      status: 'draft_seeded',
      releaseState: 'draft',
      ownerCandidate: {
        id: '20000000-0000-4000-8000-000000000001',
        name: 'Confirmed Pack Owner',
        source: 'catalog_owner'
      }
    })
    expect(result.summary).toMatchObject({ draftSeeded: 1, released: 0 })
    expect(queryRows.mock.calls[1]?.[0]).toContain('ai_capability_packs')
    expect(queryRows.mock.calls[1]?.[1]).toEqual([DEPARTMENT_PACK_BLUEPRINTS.map(item => item.packKey)])
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

  it('bounds and validates owner candidate records before exposing them', async () => {
    const tooManyCandidates = vi.fn()
      .mockResolvedValueOnce([department(1, { name: 'Marketing', slug: 'marketing' })])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(Array.from({ length: 1001 }, (_, index) => ({
        department_id: '10000000-0000-4000-8000-000000000001',
        user_id: `20000000-0000-4000-8000-${(index + 1).toString().padStart(12, '0')}`,
        user_name: `Candidate ${index + 1}`,
        membership_role: 'member',
        is_explicit_member: true,
        is_primary_assignment: false,
        is_department_manager: false
      })))

    await expect(getDepartmentPackReadiness(
      { queryRows: tooManyCandidates },
      DEPARTMENT_PACK_BLUEPRINTS,
      toolMetadata
    )).rejects.toMatchObject({ code: 'owner_candidate_limit_exceeded', statusCode: 500 })

    const malformedCandidate = vi.fn()
      .mockResolvedValueOnce([department(1, { name: 'Marketing', slug: 'marketing' })])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{
        department_id: '10000000-0000-4000-8000-000000000001',
        user_id: 'not-a-uuid',
        user_name: 'Invalid Candidate',
        membership_role: 'owner',
        is_explicit_member: true,
        is_primary_assignment: false,
        is_department_manager: false
      }])

    await expect(getDepartmentPackReadiness(
      { queryRows: malformedCandidate },
      DEPARTMENT_PACK_BLUEPRINTS,
      toolMetadata
    )).rejects.toMatchObject({ code: 'invalid_owner_candidate_record', statusCode: 500 })
  })

  it('rejects malformed catalog authority rows before exposing readiness', async () => {
    const queryRows = vi.fn()
      .mockResolvedValueOnce([
        department(1, { name: 'Creative', slug: 'creative' })
      ])
      .mockResolvedValueOnce([{
        department_id: '10000000-0000-4000-8000-000000000001',
        pack_key: 'creative_read_draft',
        pack_id: 'not-a-uuid',
        pack_version_id: '30000000-0000-4000-8000-000000000002',
        pack_release_id: '30000000-0000-4000-8000-000000000003',
        owner_user_id: '20000000-0000-4000-8000-000000000001',
        owner_name: 'Confirmed Pack Owner',
        owner_is_active: true,
        owner_is_department_member: true,
        version: 1,
        release_state: 'draft'
      }])
      .mockResolvedValueOnce([])

    await expect(getDepartmentPackReadiness(
      { queryRows },
      DEPARTMENT_PACK_BLUEPRINTS,
      toolMetadata
    )).rejects.toMatchObject({ code: 'invalid_catalog_record', statusCode: 500 })
  })
})
