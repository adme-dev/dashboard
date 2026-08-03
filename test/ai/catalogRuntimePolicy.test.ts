import { describe, expect, it, vi } from 'vitest'
import {
  composeEffectiveAssistantTools,
  loadCatalogControlRows,
  resolveCatalogRuntimePolicy,
  resolveServerCatalogRuntimePolicy,
  type ActiveCatalogRow,
  type CatalogCompositionDb,
  type CatalogRuntimePolicy
} from '~~/server/utils/ai/governance/catalogComposition'

const DEPARTMENT_ID = '10000000-0000-4000-8000-000000000001'
const USER_ID = '50000000-0000-4000-8000-000000000001'
const PACK_ID = '60000000-0000-4000-8000-000000000001'
const OLD_PACK_VERSION_ID = '30000000-0000-4000-8000-000000000001'
const LATEST_PACK_VERSION_ID = '30000000-0000-4000-8000-000000000002'

const policy = (mode: CatalogRuntimePolicy['mode']): CatalogRuntimePolicy => ({
  mode,
  authenticatedCoreTools: ['search_knowledge', 'get_tasks']
})

const tools = [
  { name: 'search_knowledge' },
  { name: 'get_tasks' },
  { name: 'get_finance_snapshot' },
  { name: 'create_task', mutates: true }
]

function row(overrides: Partial<ActiveCatalogRow> = {}): ActiveCatalogRow {
  return {
    sourceType: 'pack',
    isLatestPackVersion: true,
    releaseState: 'active',
    releaseId: '20000000-0000-4000-8000-000000000001',
    departmentId: '10000000-0000-4000-8000-000000000001',
    packVersionId: '30000000-0000-4000-8000-000000000001',
    packVersion: 1,
    packLabel: 'Finance operations',
    packKey: 'finance_operations',
    instructionsPreamble: 'Use the evaluated finance workflow.',
    packModelFeatureKey: 'finance_assistant',
    packMaxInputTokens: 6000,
    packMaxOutputTokens: 900,
    packMaxCostUsdMicros: 50000,
    packMaxLatencyMs: 15000,
    capabilityVersionId: '40000000-0000-4000-8000-000000000001',
    capabilityKey: 'finance_snapshot',
    requiredPermissionGroup: 'FINANCE',
    capabilityModelFeatureKey: 'finance_assistant',
    capabilityMaxInputTokens: 5000,
    capabilityMaxOutputTokens: 800,
    capabilityMaxCostUsdMicros: 40000,
    capabilityMaxLatencyMs: 12000,
    toolName: 'get_finance_snapshot',
    accessMode: 'read',
    ...overrides
  }
}

function compose(input: {
  mode: CatalogRuntimePolicy['mode']
  rbacFilteredTools?: typeof tools
  catalogRows?: ActiveCatalogRow[]
  permissions?: Array<'ADMIN' | 'FINANCE' | 'PROJECTS'>
  readOnly?: boolean
  disabledTools?: string[]
}) {
  return composeEffectiveAssistantTools({
    rbacFilteredTools: input.rbacFilteredTools ?? tools,
    catalogRows: input.catalogRows ?? [],
    grantedPermissionGroups: input.permissions ?? ['FINANCE'],
    runtimePolicy: policy(input.mode),
    readOnly: input.readOnly,
    disabledTools: input.disabledTools
  })
}

describe('catalog runtime policy validation', () => {
  it.each([
    [undefined, 'legacy'],
    [null, 'legacy'],
    ['', 'legacy'],
    ['unexpected', 'legacy'],
    ['legacy', 'legacy'],
    ['pilot', 'pilot'],
    ['enforced', 'enforced']
  ] as const)('resolves %j to the safe %s mode', (configured, expected) => {
    expect(resolveCatalogRuntimePolicy(configured)).toEqual({
      mode: expected,
      authenticatedCoreTools: ['search_knowledge', 'get_tasks']
    })
  })

  it('prefers the request-bound Cloudflare value over build-time runtime config', () => {
    const event = {
      context: { cloudflare: { env: { AI_GOVERNED_CATALOG_MODE: 'enforced' } } }
    } as never

    expect(resolveServerCatalogRuntimePolicy(event, { aiGovernedCatalogMode: 'pilot' }).mode)
      .toBe('enforced')
  })
})

describe('catalog rollout modes', () => {
  it('preserves legacy intersection but denies latest-version coverage for old active and newer draft releases', async () => {
    const packVersions = [
      { pack_id: PACK_ID, pack_version_id: OLD_PACK_VERSION_ID, version: 1 },
      { pack_id: PACK_ID, pack_version_id: LATEST_PACK_VERSION_ID, version: 2 }
    ]
    const releases = [
      {
        source_type: 'pack',
        release_state: 'active',
        release_id: '20000000-0000-4000-8000-000000000001',
        department_id: DEPARTMENT_ID,
        pack_version_id: OLD_PACK_VERSION_ID,
        pack_version: 1,
        pack_label: 'Old evaluated release',
        pack_key: 'finance_operations',
        instructions_preamble: 'This stale release must not govern runtime.',
        pack_model_feature_key: 'finance_assistant',
        pack_max_input_tokens: 6000,
        pack_max_output_tokens: 900,
        pack_max_cost_usd_micros: 50000,
        pack_max_latency_ms: 15000,
        capability_version_id: '40000000-0000-4000-8000-000000000001',
        capability_key: 'finance_snapshot',
        required_permission_group: 'FINANCE',
        capability_model_feature_key: 'finance_assistant',
        capability_max_input_tokens: 5000,
        capability_max_output_tokens: 800,
        capability_max_cost_usd_micros: 40000,
        capability_max_latency_ms: 12000,
        tool_name: 'get_finance_snapshot',
        access_mode: 'read',
        evaluation_gate_passed: true,
        evaluation_run_status: 'completed'
      },
      {
        source_type: 'pack',
        release_state: 'draft',
        release_id: '20000000-0000-4000-8000-000000000002',
        department_id: DEPARTMENT_ID,
        pack_version_id: LATEST_PACK_VERSION_ID,
        evaluation_gate_passed: false,
        evaluation_run_status: 'pending'
      }
    ]
    const queryRows = vi.fn(async (sql: string, params?: unknown[]) => {
      if (sql.includes('ranked_pack_versions')) {
        const maxVersion = Math.max(...packVersions.map(version => version.version))
        return packVersions.filter(version => version.version === maxVersion)
      }

      const admittedPackVersionIds = new Set((params?.[2] as string[] | undefined)
        ?? packVersions.map(version => version.pack_version_id))
      return releases.filter(release =>
        admittedPackVersionIds.has(release.pack_version_id)
        && ['pilot', 'active', 'suspended', 'retired'].includes(release.release_state)
        && (
          !['pilot', 'active'].includes(release.release_state)
          || (release.evaluation_gate_passed && release.evaluation_run_status === 'completed')
        )
      )
    })
    const catalogRows = await loadCatalogControlRows(
      [DEPARTMENT_ID],
      USER_ID,
      { queryRows } as CatalogCompositionDb
    )

    expect(queryRows).toHaveBeenCalledTimes(2)
    expect(catalogRows).toEqual([
      expect.objectContaining({
        packVersionId: OLD_PACK_VERSION_ID,
        releaseState: 'active',
        isLatestPackVersion: false
      })
    ])

    const legacy = compose({ mode: 'legacy', catalogRows })
    const pilot = compose({ mode: 'pilot', catalogRows })
    const enforced = compose({ mode: 'enforced', catalogRows })
    expect(legacy.tools.map(tool => tool.name)).toEqual(['get_finance_snapshot'])
    expect(legacy.coverageStatus).toBe('governed')
    expect(pilot.tools).toEqual(legacy.tools)
    expect(pilot.coverageStatus).toBe(legacy.coverageStatus)
    expect(enforced.tools.map(tool => tool.name)).toEqual(['search_knowledge', 'get_tasks'])
    expect(enforced.coverageStatus).toBe('authenticated_core')
  })

  it('fails closed when the latest numeric pack version is ambiguous', async () => {
    const queryRows = vi.fn().mockResolvedValue([
      { pack_id: PACK_ID, pack_version_id: LATEST_PACK_VERSION_ID, version: 2 },
      {
        pack_id: PACK_ID,
        pack_version_id: '30000000-0000-4000-8000-000000000003',
        version: 2
      }
    ])

    await expect(loadCatalogControlRows(
      [DEPARTMENT_ID],
      USER_ID,
      { queryRows } as CatalogCompositionDb
    )).rejects.toThrow('ambiguous latest version')
    expect(queryRows).toHaveBeenCalledTimes(1)
  })

  it('applies each mode without expanding admin, employee, viewer, or custom read-only RBAC', () => {
    const roleCases = [
      { label: 'admin', rbacFilteredTools: tools, readOnly: false },
      { label: 'employee', rbacFilteredTools: tools.slice(0, 3), readOnly: false },
      { label: 'viewer', rbacFilteredTools: tools.filter(tool => !tool.mutates), readOnly: true },
      { label: 'custom read-only', rbacFilteredTools: [tools[0]!, tools[1]!, tools[3]!], readOnly: true }
    ]

    for (const roleCase of roleCases) {
      for (const mode of ['legacy', 'pilot', 'enforced'] as const) {
        const result = compose({ mode, ...roleCase })
        const expected = mode === 'enforced'
          ? roleCase.rbacFilteredTools.filter(tool => ['search_knowledge', 'get_tasks'].includes(tool.name))
          : roleCase.rbacFilteredTools.filter(tool => !roleCase.readOnly || !tool.mutates)
        expect(result.tools, `${roleCase.label}:${mode}`).toEqual(expected)
        expect(result.tools.every(tool => roleCase.rbacFilteredTools.includes(tool))).toBe(true)
      }
    }
  })

  it('keeps legacy behavior unchanged for admin and employee registries', () => {
    const admin = compose({ mode: 'legacy', permissions: ['ADMIN', 'FINANCE'] })
    const employee = compose({ mode: 'legacy', permissions: ['FINANCE'] })
    const suspended = compose({ mode: 'legacy', catalogRows: [row({ releaseState: 'suspended' })] })

    expect(admin.tools).toEqual(tools)
    expect(employee.tools).toEqual(tools)
    expect(admin.coverageStatus).toBe('legacy')
    expect(suspended.tools).toEqual([])
    expect(suspended.coverageStatus).toBe('governed')
  })

  it('governs eligible active and assigned-pilot members in pilot mode', () => {
    for (const releaseState of ['active', 'pilot'] as const) {
      const result = compose({ mode: 'pilot', catalogRows: [row({ releaseState })] })
      expect(result.tools.map(tool => tool.name)).toEqual(['get_finance_snapshot'])
      expect(result.coverageStatus).toBe('governed')
    }
  })

  it('keeps an eligible evaluated pack governed in every rollout mode', () => {
    for (const mode of ['legacy', 'pilot', 'enforced'] as const) {
      const result = compose({ mode, catalogRows: [row({ releaseState: 'active' })] })
      expect(result.coverageStatus).toBe('governed')
      expect(result.tools.map(tool => tool.name)).toEqual(['get_finance_snapshot'])
    }
  })

  it('uses the exact rollback composition for ineligible catalog rows in pilot mode', () => {
    for (const catalogRows of [[], [row({ releaseState: 'suspended' })], [row({ releaseState: 'retired' })]]) {
      const legacy = compose({ mode: 'legacy', catalogRows })
      const pilot = compose({ mode: 'pilot', catalogRows })
      expect(pilot.tools).toEqual(legacy.tools)
      expect(pilot.coverageStatus).toBe(legacy.coverageStatus)
      expect(pilot.denials).toEqual(legacy.denials)
    }
  })

  it('limits uncovered admins and employees to authenticated core in enforced mode', () => {
    for (const permissions of [['ADMIN', 'FINANCE'], ['PROJECTS']] as const) {
      const result = compose({ mode: 'enforced', permissions: [...permissions] })
      expect(result.tools.map(tool => tool.name)).toEqual(['search_knowledge', 'get_tasks'])
      expect(result.coverageStatus).toBe('authenticated_core')
      expect(result.denials).toEqual(expect.arrayContaining([
        { toolName: 'get_finance_snapshot', reason: 'not_in_active_catalog' },
        { toolName: 'create_task', reason: 'not_in_active_catalog' }
      ]))
    }
  })

  it('handles a suspended release according to each rollout mode without leaking its old tools', () => {
    const legacy = compose({ mode: 'legacy', catalogRows: [row({ releaseState: 'suspended' })] })
    const pilot = compose({ mode: 'pilot', catalogRows: [row({ releaseState: 'suspended' })] })
    const result = compose({ mode: 'enforced', catalogRows: [row({ releaseState: 'suspended' })] })

    expect(legacy.tools).toEqual([])
    expect(pilot.tools).toEqual(legacy.tools)
    expect(pilot.coverageStatus).toBe(legacy.coverageStatus)
    expect(result.tools.map(tool => tool.name)).toEqual(['search_knowledge', 'get_tasks'])
    expect(result.denials).toContainEqual({
      toolName: 'get_finance_snapshot',
      reason: 'not_in_active_catalog'
    })
    expect(result.denials).not.toContainEqual({
      toolName: 'get_finance_snapshot',
      reason: 'release_suspended'
    })
  })

  it('does not treat a standalone capability release as latest-pack coverage', () => {
    const capabilityOnly = [row({
      sourceType: 'capability',
      packVersionId: null,
      packVersion: null,
      packLabel: null,
      packKey: null,
      instructionsPreamble: '',
      packModelFeatureKey: null,
      packMaxInputTokens: null,
      packMaxOutputTokens: null,
      packMaxCostUsdMicros: null,
      packMaxLatencyMs: null
    })]

    const legacy = compose({ mode: 'legacy', catalogRows: capabilityOnly })
    const pilot = compose({ mode: 'pilot', catalogRows: capabilityOnly })
    expect(pilot.tools).toEqual(legacy.tools)
    expect(pilot.coverageStatus).toBe(legacy.coverageStatus)
    expect(compose({ mode: 'enforced', catalogRows: capabilityOnly }).coverageStatus)
      .toBe('authenticated_core')
  })

  it('keeps viewer and custom read-only restrictions after authenticated-core fallback', () => {
    for (const rbacFilteredTools of [
      tools.filter(tool => !tool.mutates),
      [tools[0]!, tools[1]!, tools[3]!]
    ]) {
      const result = compose({ mode: 'enforced', rbacFilteredTools, readOnly: true })
      expect(result.tools.map(tool => tool.name)).toEqual(['search_knowledge', 'get_tasks'])
      expect(result.tools.every(tool => !tool.mutates)).toBe(true)
    }
  })

  it('keeps core tools subject to personal disables in every mode', () => {
    for (const mode of ['legacy', 'pilot', 'enforced'] as const) {
      const result = compose({ mode, disabledTools: ['search_knowledge'] })

      expect(result.tools.map(tool => tool.name)).not.toContain('search_knowledge')
      expect(result.denials).toContainEqual({
        toolName: 'search_knowledge',
        reason: 'personal_disabled'
      })
    }
  })

  it('does not restore a permission-revoked tool between turns in any mode', () => {
    for (const mode of ['legacy', 'pilot', 'enforced'] as const) {
      const beforeRevocation = compose({ mode })
      const afterRevocation = compose({
        mode,
        rbacFilteredTools: [{ name: 'search_knowledge' }] as typeof tools
      })

      expect(beforeRevocation.tools.map(tool => tool.name)).toContain('get_tasks')
      expect(afterRevocation.tools.map(tool => tool.name)).toEqual(['search_knowledge'])
    }
  })
})
