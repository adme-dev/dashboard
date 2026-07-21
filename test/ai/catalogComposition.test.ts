import { describe, expect, it, vi } from 'vitest'
import {
  composeGovernedCatalog,
  loadActiveCatalogRows,
  type ActiveCatalogRow,
  type CatalogCompositionDb
} from '~~/server/utils/ai/governance/catalogComposition'

const DEPARTMENT_ID = '10000000-0000-4000-8000-000000000001'

const tools = [
  { name: 'get_budget_health' },
  { name: 'propose_budget_change', mutates: true },
  { name: 'search_knowledge' }
]

function row(overrides: Partial<ActiveCatalogRow> = {}): ActiveCatalogRow {
  return {
    sourceType: 'pack',
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

  it('requires the capability permission group as an additional narrowing gate', () => {
    const composed = composeGovernedCatalog(tools, [row()], ['CREATIVE'])

    expect(composed.mode).toBe('governed')
    expect(composed.tools).toEqual([])
    expect(composed.instructionsPreamble).toBe('')
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
})

describe('loadActiveCatalogRows', () => {
  it('loads only completed passing active releases with a parameterized department list', async () => {
    const queryRows = vi.fn().mockResolvedValue([])
    const db: CatalogCompositionDb = { queryRows }

    await loadActiveCatalogRows([DEPARTMENT_ID], db)

    const [sql, params] = queryRows.mock.calls[0]!
    expect(params).toEqual([[DEPARTMENT_ID]])
    expect(sql).toContain('release_state = \'active\'')
    expect(sql).toContain('evaluation_gate_passed = TRUE')
    expect(sql).toContain('evaluation_run_status = \'completed\'')
    expect(sql).toContain('ANY($1::uuid[])')
    expect(sql).toContain('LEFT JOIN ai_capability_tool_bindings')
  })

  it('skips the database for no departments and rejects invalid or unbounded scopes', async () => {
    const queryRows = vi.fn().mockResolvedValue([])
    const db: CatalogCompositionDb = { queryRows }

    await expect(loadActiveCatalogRows([], db)).resolves.toEqual([])
    await expect(loadActiveCatalogRows(['not-a-uuid'], db)).rejects.toThrow('valid UUID')
    await expect(loadActiveCatalogRows(Array.from({ length: 101 }, () => DEPARTMENT_ID), db))
      .rejects.toThrow('at most 100')
    expect(queryRows).not.toHaveBeenCalled()
  })
})
