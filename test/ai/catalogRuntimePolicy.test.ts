import { describe, expect, it } from 'vitest'
import {
  composeEffectiveAssistantTools,
  resolveCatalogRuntimePolicy,
  resolveServerCatalogRuntimePolicy,
  type ActiveCatalogRow,
  type CatalogRuntimePolicy
} from '~~/server/utils/ai/governance/catalogComposition'

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

  it('leaves non-pilot, revoked, stale, suspended, no-department, and no-row users on legacy behavior in pilot mode', () => {
    for (const catalogRows of [[], [row({ releaseState: 'suspended' })], [row({ releaseState: 'retired' })]]) {
      const result = compose({ mode: 'pilot', catalogRows })
      expect(result.tools).toEqual(tools)
      expect(result.coverageStatus).toBe('legacy')
      expect(result.denials).toEqual([])
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
    expect(pilot.tools).toEqual(tools)
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

  it('does not treat a standalone capability release as evaluated pack coverage', () => {
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

    expect(compose({ mode: 'pilot', catalogRows: capabilityOnly }).coverageStatus).toBe('legacy')
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
