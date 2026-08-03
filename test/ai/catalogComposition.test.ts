import { describe, expect, it, vi } from 'vitest'
import {
  composeEffectiveAssistantTools,
  composeGovernedCatalog,
  loadCatalogControlRows,
  loadAssistantDepartmentScope,
  type ActiveCatalogRow,
  type CatalogCompositionDb
} from '~~/server/utils/ai/governance/catalogComposition'

const DEPARTMENT_ID = '10000000-0000-4000-8000-000000000001'
const USER_ID = '50000000-0000-4000-8000-000000000001'
const PACK_ID = '60000000-0000-4000-8000-000000000001'
const PACK_VERSION_ID = '30000000-0000-4000-8000-000000000001'

const tools = [
  { name: 'get_budget_health' },
  { name: 'propose_budget_change', mutates: true },
  { name: 'search_knowledge' }
]

function row(overrides: Partial<ActiveCatalogRow> = {}): ActiveCatalogRow {
  return {
    sourceType: 'pack',
    isLatestPackVersion: true,
    releaseState: 'active',
    releaseId: '20000000-0000-4000-8000-000000000001',
    departmentId: DEPARTMENT_ID,
    packVersionId: '30000000-0000-4000-8000-000000000001',
    packKey: 'paid_media',
    instructionsPreamble: 'Use the governed paid-media playbook.',
    packModelFeatureKey: 'agent_spend_controller',
    packMaxInputTokens: 8_000,
    packMaxOutputTokens: 1_200,
    packMaxCostUsdMicros: 120_000,
    packMaxLatencyMs: 20_000,
    capabilityVersionId: '40000000-0000-4000-8000-000000000001',
    capabilityKey: 'budget_health',
    requiredPermissionGroup: 'MEDIA_BUYING',
    capabilityModelFeatureKey: 'agent_spend_controller',
    capabilityMaxInputTokens: 6_000,
    capabilityMaxOutputTokens: 900,
    capabilityMaxCostUsdMicros: 100_000,
    capabilityMaxLatencyMs: 15_000,
    toolName: 'get_budget_health',
    accessMode: 'read',
    ...overrides
  }
}

describe('composeGovernedCatalog', () => {
  it('preserves legacy behavior when no active catalog release exists', () => {
    const composed = composeGovernedCatalog(tools, [], ['MEDIA_BUYING'])

    expect(composed.mode).toBe('legacy')
    expect(composed.coverageStatus).toBe('legacy')
    expect(composed.tools).toEqual(tools)
    expect(composed.instructionsPreamble).toBe('')
  })

  it('only narrows the already-RBAC-filtered registry and never adds a catalog-only tool', () => {
    const composed = composeGovernedCatalog(tools, [
      row(),
      row({ toolName: 'not_in_rbac_registry', accessMode: 'read' })
    ], ['MEDIA_BUYING'])

    expect(composed.mode).toBe('governed')
    expect(composed.tools.map(tool => tool.name)).toEqual(['get_budget_health'])
    expect(composed.tools.every(tool => tools.includes(tool))).toBe(true)
  })

  it('treats an explicitly assigned pilot release as governed runtime material', () => {
    const composed = composeGovernedCatalog(tools, [row({ releaseState: 'pilot' })], ['MEDIA_BUYING'])

    expect(composed.mode).toBe('governed')
    expect(composed.tools.map(tool => tool.name)).toEqual(['get_budget_health'])
    expect(composed.instructionsPreamble).toBe('Use the governed paid-media playbook.')
  })

  it('requires the capability permission group as an additional narrowing gate', () => {
    const composed = composeGovernedCatalog(tools, [row()], ['CREATIVE'])

    expect(composed.mode).toBe('governed')
    expect(composed.tools).toEqual([])
    expect(composed.instructionsPreamble).toBe('')
  })

  it('allows an authenticated ceiling only for tools already admitted by RBAC', () => {
    const rbacFilteredTools = [{ name: 'search_knowledge' }]
    const composed = composeGovernedCatalog(rbacFilteredTools, [row({
      requiredPermissionGroup: 'AUTHENTICATED',
      toolName: 'search_knowledge',
      accessMode: 'read'
    })], [])

    expect(composed.tools).toEqual(rbacFilteredTools)
    expect(composeGovernedCatalog([], [row({
      requiredPermissionGroup: 'AUTHENTICATED',
      toolName: 'search_knowledge',
      accessMode: 'read'
    })], []).tools).toEqual([])
  })

  it('enforces binding access mode against the registry mutation annotation', () => {
    const composed = composeGovernedCatalog(tools, [
      row({ toolName: 'propose_budget_change', accessMode: 'read' }),
      row({ toolName: 'get_budget_health', accessMode: 'propose' }),
      row({
        capabilityVersionId: '40000000-0000-4000-8000-000000000002',
        toolName: 'propose_budget_change',
        accessMode: 'propose'
      })
    ], ['MEDIA_BUYING'])

    expect(composed.tools.map(tool => tool.name)).toEqual(['propose_budget_change'])
  })

  it('deduplicates instructions and applies the strictest authorized budget ceilings', () => {
    const composed = composeGovernedCatalog(tools, [
      row(),
      row({
        toolName: 'search_knowledge',
        accessMode: 'draft',
        capabilityMaxInputTokens: 4_000,
        capabilityMaxOutputTokens: 700,
        capabilityMaxCostUsdMicros: 80_000,
        capabilityMaxLatencyMs: 12_000
      })
    ], ['MEDIA_BUYING'])

    expect(composed.instructionsPreamble).toBe('Use the governed paid-media playbook.')
    expect(composed.budget).toEqual({
      maxInputTokens: 4_000,
      maxOutputTokens: 700,
      maxCostUsdMicros: 80_000,
      maxLatencyMs: 12_000
    })
    expect(composed.packVersionIds).toEqual(['30000000-0000-4000-8000-000000000001'])
    expect(composed.capabilityVersionIds).toEqual(['40000000-0000-4000-8000-000000000001'])
  })

  it('treats an active empty pack row as governed and fails closed to zero tools', () => {
    const composed = composeGovernedCatalog(tools, [row({
      capabilityVersionId: null,
      capabilityKey: null,
      requiredPermissionGroup: null,
      capabilityModelFeatureKey: null,
      capabilityMaxInputTokens: null,
      capabilityMaxOutputTokens: null,
      capabilityMaxCostUsdMicros: null,
      capabilityMaxLatencyMs: null,
      toolName: null,
      accessMode: null
    })], ['MEDIA_BUYING'])

    expect(composed.mode).toBe('governed')
    expect(composed.tools).toEqual([])
  })

  it('keeps suspended and retired releases as control markers instead of falling back open', () => {
    for (const releaseState of ['suspended', 'retired'] as const) {
      const composed = composeGovernedCatalog(tools, [row({ releaseState })], ['MEDIA_BUYING'])

      expect(composed.mode).toBe('governed')
      expect(composed.tools).toEqual([])
      expect(composed.denials).toContainEqual({
        toolName: 'get_budget_health',
        reason: releaseState === 'suspended' ? 'release_suspended' : 'release_retired'
      })
    }
  })

  it('lets a direct capability suspension override the same version inside an active pack', () => {
    const composed = composeGovernedCatalog(tools, [
      row(),
      row({
        sourceType: 'capability',
        releaseState: 'suspended',
        releaseId: '20000000-0000-4000-8000-000000000002',
        packVersionId: null,
        packKey: null,
        instructionsPreamble: '',
        packModelFeatureKey: null,
        packMaxInputTokens: null,
        packMaxOutputTokens: null,
        packMaxCostUsdMicros: null,
        packMaxLatencyMs: null
      })
    ], ['MEDIA_BUYING'])

    expect(composed.tools).toEqual([])
    expect(composed.denials).toContainEqual({
      toolName: 'get_budget_health',
      reason: 'release_suspended'
    })
  })

  it('returns deterministic permission and access-mode denial reasons', () => {
    const permissionDenied = composeGovernedCatalog(tools, [row()], ['CREATIVE'])
    expect(permissionDenied.denials).toContainEqual({
      toolName: 'get_budget_health',
      reason: 'capability_permission_missing'
    })

    const accessDenied = composeGovernedCatalog(tools, [row({ accessMode: 'propose' })], ['MEDIA_BUYING'])
    expect(accessDenied.denials).toContainEqual({
      toolName: 'get_budget_health',
      reason: 'access_mode_mismatch'
    })
  })
})

describe('composeEffectiveAssistantTools', () => {
  it('applies persona, read-only, and personal disables only as subtraction', () => {
    const composed = composeEffectiveAssistantTools({
      rbacFilteredTools: tools,
      catalogRows: [
        row(),
        row({ toolName: 'search_knowledge', accessMode: 'draft' }),
        row({
          capabilityVersionId: '40000000-0000-4000-8000-000000000002',
          toolName: 'propose_budget_change',
          accessMode: 'propose'
        })
      ],
      grantedPermissionGroups: ['MEDIA_BUYING'],
      personaToolAllowlist: ['get_budget_health', 'propose_budget_change'],
      disabledTools: ['get_budget_health'],
      readOnly: true,
      runtimePolicy: {
        mode: 'pilot',
        authenticatedCoreTools: ['search_knowledge', 'get_tasks']
      }
    })

    expect(composed.tools).toEqual([])
    expect(composed.coverageStatus).toBe('governed')
    expect(composed.denials).toEqual(expect.arrayContaining([
      { toolName: 'search_knowledge', reason: 'persona_narrowed' },
      { toolName: 'propose_budget_change', reason: 'read_only' },
      { toolName: 'get_budget_health', reason: 'personal_disabled' }
    ]))
    expect(composed.tools.every(tool => tools.includes(tool))).toBe(true)
  })
})

describe('loadCatalogControlRows', () => {
  it('loads completed active releases and inactive control markers with a parameterized department list', async () => {
    const queryRows = vi.fn(async (sql: string) => sql.includes('ranked_pack_versions')
      ? [{ pack_id: PACK_ID, pack_version_id: PACK_VERSION_ID, version: 1 }]
      : [])
    const db: CatalogCompositionDb = { queryRows }

    await loadCatalogControlRows([DEPARTMENT_ID], USER_ID, db)

    const [latestSql, latestParams] = queryRows.mock.calls[0]!
    expect(latestParams).toEqual([[DEPARTMENT_ID]])
    expect(latestSql).toContain('DENSE_RANK() OVER')
    expect(latestSql).toContain('ORDER BY candidate.version DESC')
    const [sql, params] = queryRows.mock.calls[1]!
    expect(params).toEqual([[DEPARTMENT_ID], USER_ID])
    expect(sql).not.toContain('pack_release.pack_version_id = ANY($3::uuid[])')
    expect(sql).toContain('release_state IN (\'pilot\', \'active\', \'suspended\', \'retired\')')
    expect(sql).toContain('ai_release_pilot_members')
    expect(sql).toContain('pilot_member.team_member_id = $2')
    expect(sql).toContain('pilot_member.revoked_at IS NULL')
    expect(sql).toContain('department_members pilot_department_member')
    expect(sql).toContain('pilot_actor.is_active = TRUE')
    expect(sql).toContain('pack_release.rollout_scope <> \'pilot\'')
    expect(sql).toContain('capability_release.rollout_scope <> \'pilot\'')
    expect(sql).toContain('evaluation_gate_passed = TRUE')
    expect(sql).toContain('evaluation_run_status = \'completed\'')
    expect(sql).toContain('ANY($1::uuid[])')
    expect(sql).toContain('LEFT JOIN ai_capability_tool_bindings')
  })

  it('skips the database for no departments and rejects invalid or unbounded scopes', async () => {
    const queryRows = vi.fn().mockResolvedValue([])
    const db: CatalogCompositionDb = { queryRows }

    await expect(loadCatalogControlRows([], USER_ID, db)).resolves.toEqual([])
    await expect(loadCatalogControlRows(['not-a-uuid'], USER_ID, db)).rejects.toThrow('valid UUID')
    await expect(loadCatalogControlRows([DEPARTMENT_ID], 'not-a-uuid', db)).rejects.toThrow('user identifier')
    await expect(loadCatalogControlRows(Array.from({ length: 101 }, () => DEPARTMENT_ID), USER_ID, db))
      .rejects.toThrow('at most 100')
    expect(queryRows).not.toHaveBeenCalled()
  })
})

describe('loadAssistantDepartmentScope', () => {
  it('derives ordinary-user scope from membership or department management', async () => {
    const queryRows = vi.fn().mockResolvedValue([{ id: DEPARTMENT_ID }])
    const db: CatalogCompositionDb = { queryRows }

    await expect(loadAssistantDepartmentScope(
      '50000000-0000-4000-8000-000000000001',
      'account_manager',
      db
    )).resolves.toEqual([DEPARTMENT_ID])

    const [sql, params] = queryRows.mock.calls[0]!
    expect(sql).toContain('department_members')
    expect(sql).toContain('manager_id')
    expect(params).toEqual(['50000000-0000-4000-8000-000000000001', false])
  })

  it('uses server-derived company-wide scope for owner/admin and bounds the result', async () => {
    const queryRows = vi.fn().mockResolvedValue([{ id: DEPARTMENT_ID }])
    const db: CatalogCompositionDb = { queryRows }

    await loadAssistantDepartmentScope('50000000-0000-4000-8000-000000000001', 'admin', db)
    expect(queryRows.mock.calls[0]![1]).toEqual(['50000000-0000-4000-8000-000000000001', true])
    expect(queryRows.mock.calls[0]![0]).toContain(
      'department.department_kind = \'organizational\' AND $2::boolean'
    )

    queryRows.mockResolvedValueOnce(Array.from({ length: 101 }, (_, index) => ({
      id: `10000000-0000-4000-8000-${index.toString().padStart(12, '0')}`
    })))
    await expect(loadAssistantDepartmentScope(
      '50000000-0000-4000-8000-000000000001',
      'owner',
      db
    )).rejects.toThrow('at most 100')
  })
})
