import { describe, expect, it, vi } from 'vitest'
import {
  renderPersonalAssistantContext,
  resolvePersonalAssistantContext
} from '~~/server/utils/ai/personalAssistantContext'
import type {
  PersonalAssistantAdmissionError,
  PersonalAssistantContextDb
} from '~~/server/utils/ai/personalAssistantContext'
import type { CatalogRuntimePolicy } from '~~/server/utils/ai/governance/catalogComposition'

const USER_ID = '50000000-0000-4000-8000-000000000001'
const CREATIVE_ID = '10000000-0000-4000-8000-000000000001'
const PRODUCTION_ID = '10000000-0000-4000-8000-000000000002'
const CLIENT_ID = '60000000-0000-4000-8000-000000000001'
const PACK_ID = '60000000-0000-4000-8000-000000000002'
const PACK_VERSION_ID = '30000000-0000-4000-8000-000000000001'
const pilotPolicy: CatalogRuntimePolicy = {
  mode: 'pilot',
  authenticatedCoreTools: ['search_knowledge', 'get_tasks']
}

function db(overrides: Partial<PersonalAssistantContextDb> = {}): PersonalAssistantContextDb {
  return {
    queryOne: vi.fn(async (sql: string) => {
      if (sql.includes('FROM team_members actor')) {
        return { id: USER_ID, role: 'creative', custom_role_id: null }
      }
      if (sql.includes('FROM ai_agent_configs')) {
        return {
          persona_key: 'creative',
          tool_overrides: { disabled: ['propose_budget_change'] },
          memory_enabled: false
        }
      }
      return null
    }) as PersonalAssistantContextDb['queryOne'],
    queryRows: vi.fn(async (sql: string) => {
      if (sql.includes('FROM departments department')) {
        return [
          {
            department_id: CREATIVE_ID,
            department_name: 'Creative',
            department_slug: 'creative',
            department_kind: 'organizational',
            membership_role: 'senior',
            is_primary: true,
            is_manager: false,
            manager_id: '70000000-0000-4000-8000-000000000001',
            manager_name: 'Creative Lead'
          },
          {
            department_id: PRODUCTION_ID,
            department_name: 'Production',
            department_slug: 'production',
            department_kind: 'organizational',
            membership_role: 'member',
            is_primary: false,
            is_manager: false,
            manager_id: null,
            manager_name: null
          }
        ]
      }
      if (sql.includes('FROM client_team_assignments assignment')) {
        return [{ client_id: CLIENT_ID, client_name: 'Example Client', assignment_role: 'support' }]
      }
      if (sql.includes('ranked_pack_versions')) {
        return [{ pack_id: PACK_ID, pack_version_id: PACK_VERSION_ID, version: 3 }]
      }
      if (sql.includes('active_pack_rows AS')) {
        return [{
          source_type: 'pack',
          release_state: 'active',
          release_id: '20000000-0000-4000-8000-000000000001',
          department_id: CREATIVE_ID,
          pack_version_id: PACK_VERSION_ID,
          pack_version: 3,
          pack_label: 'Creative Studio',
          pack_key: 'creative_studio',
          instructions_preamble: 'Use the approved creative workflow.',
          pack_model_feature_key: 'creative_assistant',
          pack_max_input_tokens: 6000,
          pack_max_output_tokens: 1000,
          pack_max_cost_usd_micros: 50000,
          pack_max_latency_ms: 15000,
          capability_version_id: '40000000-0000-4000-8000-000000000001',
          capability_key: 'creative_brief',
          required_permission_group: 'CREATIVE',
          capability_model_feature_key: 'creative_assistant',
          capability_max_input_tokens: 5000,
          capability_max_output_tokens: 900,
          capability_max_cost_usd_micros: 40000,
          capability_max_latency_ms: 12000,
          tool_name: 'search_knowledge',
          access_mode: 'read'
        }]
      }
      return []
    }) as PersonalAssistantContextDb['queryRows'],
    resolvePermissions: vi.fn(async () => ({
      groups: ['CREATIVE'],
      isReadOnly: false
    })),
    ...overrides
  }
}

describe('resolvePersonalAssistantContext', () => {
  it('composes minimal multi-department, manager, client, preference, and active-pack context', async () => {
    const contextDb = db()

    const context = await resolvePersonalAssistantContext({
      userId: USER_ID,
      runtimePolicy: pilotPolicy,
      observedMemoryEnabled: false
    }, contextDb)

    expect(context.identity).toEqual({ userId: USER_ID, role: 'creative' })
    expect(context.permissionGroups).toEqual(['CREATIVE'])
    expect(context.departments).toHaveLength(2)
    expect(context.departments[0]).toMatchObject({
      departmentId: CREATIVE_ID,
      membershipRole: 'senior',
      isPrimary: true,
      accessReason: 'membership',
      escalationManager: {
        userId: '70000000-0000-4000-8000-000000000001',
        name: 'Creative Lead'
      }
    })
    expect(context.clientScope).toEqual({
      mode: 'assigned',
      assignments: [{ clientId: CLIENT_ID, name: 'Example Client', role: 'support' }]
    })
    expect(context.preferences).toEqual({
      personaKey: 'creative',
      disabledTools: ['propose_budget_change'],
      memoryEnabled: false
    })
    expect(context.activePacks).toEqual([{
      releaseId: '20000000-0000-4000-8000-000000000001',
      departmentId: CREATIVE_ID,
      packVersionId: PACK_VERSION_ID,
      packKey: 'creative_studio',
      version: 3,
      label: 'Creative Studio',
      releaseState: 'active',
      accessBasis: 'catalog_policy'
    }])
    expect(context.catalogRows).toHaveLength(1)
    expect(context.runtimePolicy).toBe(pilotPolicy)
    expect(context.observedMemoryEnabled).toBe(false)

    const catalogCall = vi.mocked(contextDb.queryRows).mock.calls.find(([sql]) =>
      sql.includes('active_pack_rows AS')
    )
    expect(catalogCall?.[1]).toEqual([[CREATIVE_ID, PRODUCTION_ID], USER_ID])

    const rendered = renderPersonalAssistantContext(context)
    expect(rendered).toContain('Governed personal assistant scope')
    expect(rendered).toContain('Creative Lead')
    expect(rendered).toContain('creative_studio')
    expect(rendered).not.toContain('email')
    expect(rendered).not.toContain('tool_overrides')
  })

  it('uses the current database role and permission resolution at admission', async () => {
    const resolvePermissions = vi.fn(async (input: { userId: string, role: string }) => ({
      groups: input.role === 'creative' ? ['CREATIVE' as const] : [],
      isReadOnly: false
    }))
    const context = await resolvePersonalAssistantContext({ userId: USER_ID }, db({ resolvePermissions }))

    expect(context.identity.role).toBe('creative')
    expect(resolvePermissions).toHaveBeenCalledWith({
      userId: USER_ID,
      role: 'creative',
      customRoleId: null,
      event: undefined
    })
  })

  it('fails closed before loading any scope when the user is missing or offboarded', async () => {
    const queryOne = vi.fn().mockResolvedValue(null)
    const queryRows = vi.fn()
    const contextDb = db({ queryOne, queryRows })

    for (const mode of ['legacy', 'pilot', 'enforced'] as const) {
      await expect(resolvePersonalAssistantContext({
        userId: USER_ID,
        runtimePolicy: { ...pilotPolicy, mode }
      }, contextDb))
        .rejects.toMatchObject<Partial<PersonalAssistantAdmissionError>>({
          code: 'assistant_identity_inactive'
        })
    }
    expect(queryRows).not.toHaveBeenCalled()
    expect(contextDb.resolvePermissions).not.toHaveBeenCalled()
  })

  it('represents management client access without copying every client into prompt context', async () => {
    const contextDb = db({
      resolvePermissions: vi.fn(async () => ({ groups: ['MANAGEMENT', 'CREATIVE'], isReadOnly: false }))
    })

    const context = await resolvePersonalAssistantContext({ userId: USER_ID }, contextDb)

    expect(context.clientScope.mode).toBe('all_active')
    expect(context.clientScope.assignments).toEqual([{ clientId: CLIENT_ID, name: 'Example Client', role: 'support' }])
    const departmentCall = vi.mocked(contextDb.queryRows).mock.calls.find(([sql]) => sql.includes('FROM departments department'))
    expect(departmentCall?.[1]).toEqual([USER_ID, false])
  })

  it('limits company-wide department scope to organizational departments', async () => {
    const contextDb = db({
      queryOne: vi.fn(async (sql: string) => {
        if (sql.includes('FROM team_members actor')) {
          return { id: USER_ID, role: 'owner', custom_role_id: null }
        }
        if (sql.includes('FROM ai_agent_configs')) return null
        return null
      }) as PersonalAssistantContextDb['queryOne'],
      queryRows: vi.fn().mockResolvedValue([]) as PersonalAssistantContextDb['queryRows'],
      resolvePermissions: vi.fn(async () => ({ groups: ['ADMIN'], isReadOnly: false }))
    })

    await resolvePersonalAssistantContext({ userId: USER_ID }, contextDb)

    const departmentCall = vi.mocked(contextDb.queryRows).mock.calls.find(([sql]) =>
      sql.includes('FROM departments department')
    )
    expect(departmentCall?.[0]).toContain(
      "department.department_kind = 'organizational' AND $2::boolean"
    )
    expect(departmentCall?.[1]).toEqual([USER_ID, true])
  })

  it('derives owner pack access from the database identity', async () => {
    const contextDb = db({
      queryOne: vi.fn(async (sql: string) => {
        if (sql.includes('FROM team_members actor')) {
          return { id: USER_ID, role: 'owner', custom_role_id: null }
        }
        if (sql.includes('FROM ai_agent_configs')) {
          return {
            persona_key: 'creative',
            tool_overrides: { disabled: ['propose_budget_change'] },
            memory_enabled: false
          }
        }
        return null
      }) as PersonalAssistantContextDb['queryOne']
    })

    const context = await resolvePersonalAssistantContext({ userId: USER_ID }, contextDb)

    expect(context.activePacks[0]?.accessBasis).toBe('company_owner')
    const catalogCall = vi.mocked(contextDb.queryRows).mock.calls.find(([sql]) =>
      sql.includes('active_pack_rows AS')
    )
    expect(catalogCall?.[1]).toEqual([[CREATIVE_ID, PRODUCTION_ID], USER_ID])
  })

  it('rejects unbounded department context instead of silently truncating authority', async () => {
    const queryRows = vi.fn(async (sql: string) => {
      if (sql.includes('FROM departments department')) {
        return Array.from({ length: 101 }, (_, index) => ({
          department_id: `10000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
          department_name: `Department ${index}`,
          department_slug: `department-${index}`,
          department_kind: 'organizational',
          membership_role: 'member',
          is_primary: false,
          is_manager: false,
          manager_id: null,
          manager_name: null
        }))
      }
      return []
    }) as PersonalAssistantContextDb['queryRows']

    await expect(resolvePersonalAssistantContext({ userId: USER_ID }, db({ queryRows })))
      .rejects.toMatchObject({ code: 'assistant_department_scope_unbounded' })
  })

  it('does not bypass personal narrowing when its configuration read fails', async () => {
    const queryOne = vi.fn(async (sql: string) => {
      if (sql.includes('FROM team_members actor')) {
        return { id: USER_ID, role: 'creative', custom_role_id: null }
      }
      throw new Error('database unavailable')
    }) as PersonalAssistantContextDb['queryOne']

    await expect(resolvePersonalAssistantContext({ userId: USER_ID }, db({ queryOne })))
      .rejects.toThrow('database unavailable')
  })
})
