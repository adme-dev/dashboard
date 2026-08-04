import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { MockLanguageModelV3 } from 'ai/test'
import { z } from 'zod'

import type { GodModeAuthority } from '~~/server/utils/godMode/authority'
import {
  composeEffectiveAssistantTools,
  loadCatalogControlRows,
  type ActiveCatalogRow,
  type CatalogCompositionDb
} from '~~/server/utils/ai/governance/catalogComposition'
import { buildMyAssistantExplainability } from '~~/server/utils/ai/assistantExplainability'
import type { PersonalAssistantContext } from '~~/server/utils/ai/personalAssistantContext'
import { filterToolsForUser, toSdkTools, type AiTool } from '~~/server/utils/ai/toolRegistry'
import { ok } from '~~/server/utils/ai/toolContext'
import { runToolLoop } from '~~/server/utils/ai/toolLoop'

const USER_ID = '50000000-0000-4000-8000-000000000001'
const OTHER_USER_ID = '50000000-0000-4000-8000-000000000002'
const DEPARTMENT_ID = '10000000-0000-4000-8000-000000000001'
const PACK_ID = '60000000-0000-4000-8000-000000000001'
const PACK_VERSION_ID = '30000000-0000-4000-8000-000000000001'

const godModeAuthority: GodModeAuthority = {
  active: true,
  actorUserId: USER_ID,
  reason: 'active_owner',
  emergencyDisabled: false
}

const emergencyDisabledAuthority: GodModeAuthority = {
  active: false,
  actorUserId: USER_ID,
  reason: 'emergency_disabled',
  emergencyDisabled: true
}

function catalogRow(overrides: Partial<ActiveCatalogRow> = {}): ActiveCatalogRow {
  return {
    sourceType: 'pack',
    isLatestPackVersion: true,
    releaseState: 'active',
    releaseId: '20000000-0000-4000-8000-000000000001',
    departmentId: DEPARTMENT_ID,
    packVersionId: PACK_VERSION_ID,
    packVersion: 1,
    packLabel: 'Owner operations',
    packKey: 'owner_operations',
    instructionsPreamble: 'Use the registered owner operations material.',
    packModelFeatureKey: 'owner_operations',
    packMaxInputTokens: 1,
    packMaxOutputTokens: 1,
    packMaxCostUsdMicros: 1,
    packMaxLatencyMs: 1,
    capabilityVersionId: '40000000-0000-4000-8000-000000000001',
    capabilityKey: 'owner_read',
    requiredPermissionGroup: 'FINANCE',
    capabilityModelFeatureKey: 'owner_operations',
    capabilityMaxInputTokens: 1,
    capabilityMaxOutputTokens: 1,
    capabilityMaxCostUsdMicros: 1,
    capabilityMaxLatencyMs: 1,
    toolName: 'owner_read',
    accessMode: 'read',
    ...overrides
  }
}

const registeredTools = [
  { name: 'owner_read' },
  { name: 'owner_write', mutates: true }
]

function composeGodMode(overrides: Partial<Parameters<typeof composeEffectiveAssistantTools>[0]> = {}) {
  return composeEffectiveAssistantTools({
    rbacFilteredTools: registeredTools,
    catalogRows: [
      catalogRow(),
      catalogRow({
        capabilityVersionId: '40000000-0000-4000-8000-000000000002',
        capabilityKey: 'owner_write',
        toolName: 'owner_write',
        accessMode: 'propose'
      })
    ],
    grantedPermissionGroups: [],
    personaToolAllowlist: [],
    disabledTools: ['owner_read', 'owner_write'],
    readOnly: true,
    runtimePolicy: {
      mode: 'enforced',
      authenticatedCoreTools: ['search_knowledge', 'get_tasks']
    },
    authority: godModeAuthority,
    actorUserId: USER_ID,
    ...overrides
  } as any)
}

describe('God-mode catalog admission', () => {
  it.each(['draft', 'pilot', 'active', 'suspended', 'retired'] as const)(
    'admits the complete registered catalog when the latest material is %s',
    (releaseState) => {
      const result = composeGodMode({
        catalogRows: [
          catalogRow({ releaseState }),
          catalogRow({
            releaseState,
            capabilityVersionId: '40000000-0000-4000-8000-000000000002',
            capabilityKey: 'owner_write',
            toolName: 'owner_write',
            accessMode: 'propose'
          })
        ]
      } as any)

      expect(result.tools).toEqual(registeredTools)
      expect(result.instructionsPreamble).toContain('registered owner operations material')
      expect(result.budget).toBeNull()
      expect(result.coverageStatus).toBe('god_mode')
    }
  )

  it('bypasses permission ceilings, persona narrowing, personal disables, read-only, and application budgets', () => {
    const result = composeGodMode()

    expect(result.tools).toEqual(registeredTools)
    expect(result.denials).toEqual([])
    expect(result.budget).toBeNull()
    expect(result.bypassedControls).toEqual(expect.arrayContaining([
      'permission',
      'feature_flag',
      'release_policy',
      'evaluation_policy',
      'personal_policy',
      'budget',
      'rate_limit'
    ]))
  })

  it('does not accept an active authority object resolved for a different actor', () => {
    const result = composeGodMode({
      authority: { ...godModeAuthority, actorUserId: OTHER_USER_ID }
    } as any)

    expect(result.tools).toEqual([])
    expect(result.coverageStatus).toBe('governed')
  })

  it('falls back to existing governed owner behavior when the emergency control is active', () => {
    const result = composeGodMode({
      authority: emergencyDisabledAuthority,
      personaToolAllowlist: undefined,
      disabledTools: undefined,
      readOnly: false,
      grantedPermissionGroups: ['FINANCE'],
      runtimePolicy: {
        mode: 'pilot',
        authenticatedCoreTools: ['search_knowledge', 'get_tasks']
      }
    } as any)

    expect(result.coverageStatus).toBe('governed')
    expect(result.tools.map(tool => tool.name)).toEqual(['owner_read', 'owner_write'])
    expect(result.bypassedControls ?? []).toEqual([])
  })

  it('keeps ordinary admin and member catalog outcomes byte-for-byte compatible', () => {
    const input = {
      rbacFilteredTools: registeredTools,
      catalogRows: [catalogRow()],
      grantedPermissionGroups: ['FINANCE'] as const,
      personaToolAllowlist: ['owner_read'],
      disabledTools: [] as string[],
      readOnly: false,
      runtimePolicy: {
        mode: 'pilot' as const,
        authenticatedCoreTools: ['search_knowledge', 'get_tasks'] as const
      }
    }
    const existing = composeEffectiveAssistantTools(input)

    expect(composeEffectiveAssistantTools({ ...input, authority: undefined } as any)).toEqual(existing)
    expect(composeEffectiveAssistantTools({
      ...input,
      authority: { ...godModeAuthority, active: false, reason: 'not_owner' }
    } as any)).toEqual(existing)
  })
})

describe('God-mode catalog loading', () => {
  it('loads latest registered material from every release/evaluation/pilot state with parameterized scope', async () => {
    const queryRows = vi.fn(async (sql: string) => sql.includes('ranked_pack_versions')
      ? [{ pack_id: PACK_ID, pack_version_id: PACK_VERSION_ID, version: 1 }]
      : [])

    await loadCatalogControlRows(
      [DEPARTMENT_ID],
      USER_ID,
      { queryRows } as CatalogCompositionDb,
      godModeAuthority
    )

    const [sql, params] = queryRows.mock.calls[1]!
    expect(params).toEqual([[DEPARTMENT_ID], [PACK_VERSION_ID]])
    expect(sql).toContain("release_state IN ('draft', 'pilot', 'active', 'suspended', 'retired')")
    expect(sql).toContain('pack_version.id = ANY($2::uuid[])')
    expect(sql).toContain('MAX(candidate.version)')
    expect(sql).not.toContain('evaluation_gate_passed')
    expect(sql).not.toContain('evaluation_run_status')
    expect(sql).not.toContain('ai_release_pilot_members')
    expect(sql).not.toContain('department_members')
    expect(sql).not.toContain("user_role = 'owner'")
  })
})

describe('God-mode SDK wrapper admission', () => {
  const executed: string[] = []
  const tools: AiTool<any>[] = [
    {
      name: 'denied_read',
      description: 'Normally denied read.',
      parameters: z.object({}),
      requiredPermission: 'FINANCE',
      handler: async () => {
        executed.push('denied_read')
        return ok({ admitted: true })
      }
    },
    {
      name: 'denied_write',
      description: 'Normally denied write proposal.',
      parameters: z.object({}),
      requiredPermission: 'FINANCE',
      mutates: true,
      handler: async () => {
        executed.push('denied_write')
        return ok({ proposalId: 'proposal-1' })
      }
    }
  ]

  beforeEach(() => executed.splice(0))

  it('admits and executes registered reads and proposal handlers only from matching server authority', async () => {
    const admitted = filterToolsForUser(tools, 'viewer', [], true, godModeAuthority, USER_ID)
    const sdkTools = toSdkTools(admitted, {
      userId: USER_ID,
      userRole: 'viewer',
      permissionGroups: [],
      assistantReadOnly: true,
      event: {} as any
    }, 'seed', godModeAuthority)

    await expect((sdkTools.denied_read as any).execute({}, {})).resolves.toEqual({
      ok: true,
      data: { admitted: true }
    })
    await expect((sdkTools.denied_write as any).execute({}, {})).resolves.toEqual({
      ok: true,
      data: { proposalId: 'proposal-1' }
    })
    expect(executed).toEqual(['denied_read', 'denied_write'])
  })

  it('does not allow owner role strings, mismatched authority, or emergency-disabled authority to bypass', async () => {
    expect(filterToolsForUser(tools, 'owner', [], true)).toEqual([])
    expect(filterToolsForUser(tools, 'viewer', [], true, {
      ...godModeAuthority,
      actorUserId: OTHER_USER_ID
    }, USER_ID)).toEqual([])
    expect(filterToolsForUser(tools, 'viewer', [], true, emergencyDisabledAuthority, USER_ID)).toEqual([])

    const sdkTools = toSdkTools(tools, {
      userId: USER_ID,
      userRole: 'viewer',
      permissionGroups: [],
      assistantReadOnly: true,
      event: {} as any
    }, 'seed')
    await expect((sdkTools.denied_read as any).execute({}, {})).resolves.toEqual({
      ok: false,
      error: 'Not permitted.'
    })
    await expect((sdkTools.denied_write as any).execute({}, {})).resolves.toEqual({
      ok: false,
      error: 'Not permitted.'
    })
    expect(executed).toEqual([])
  })
})

const mockRecordAiInvocation = vi.fn()
const mockResolveModelWithTransport = vi.fn()

vi.mock('~~/server/utils/claudeClient', async (importOriginal) => ({
  ...await importOriginal<typeof import('~~/server/utils/claudeClient')>(),
  resolveModelWithTransport: (...args: unknown[]) => mockResolveModelWithTransport(...args)
}))

vi.mock('~~/server/utils/ai/modelAssignments', async (importOriginal) => ({
  ...await importOriginal<typeof import('~~/server/utils/ai/modelAssignments')>(),
  resolveAiModelAssignment: vi.fn().mockResolvedValue(null)
}))

vi.mock('~~/server/utils/ai/invocationLedger', () => ({
  recordAiInvocation: (...args: unknown[]) => mockRecordAiInvocation(...args)
}))

const textModel = new MockLanguageModelV3({
  doGenerate: async () => ({
    content: [{ type: 'text', text: 'Owner response.' }],
    finishReason: 'stop',
    usage: { inputTokens: 100, outputTokens: 100, totalTokens: 200 },
    warnings: []
  })
})

describe('God-mode model hard boundaries and budgets', () => {
  beforeAll(() => vi.stubGlobal('useRuntimeConfig', () => ({})))
  afterAll(() => vi.unstubAllGlobals())

  beforeEach(() => {
    mockRecordAiInvocation.mockReset()
    mockRecordAiInvocation.mockResolvedValue(undefined)
    mockResolveModelWithTransport.mockReset()
  })

  it('uses Cloudflare AI Gateway while ignoring application token/cost/latency/usage/rate ceilings', async () => {
    mockResolveModelWithTransport.mockReturnValue({ model: textModel, gatewayUsed: true })

    await runToolLoop({
      ctx: { userId: USER_ID, userRole: 'owner', event: {} as any },
      system: 'system',
      messages: [{ role: 'user', content: 'hello' }],
      seed: 'owner',
      modelSpec: 'groq/openai/gpt-oss-120b',
      fallbackSpec: '',
      catalogRows: [catalogRow()],
      runtimePolicy: {
        mode: 'enforced',
        authenticatedCoreTools: ['search_knowledge', 'get_tasks']
      },
      authority: godModeAuthority
    } as any)

    expect(mockResolveModelWithTransport).toHaveBeenCalledWith(
      'groq/openai/gpt-oss-120b',
      expect.any(Object)
    )
    expect(mockRecordAiInvocation).toHaveBeenCalledWith(expect.objectContaining({
      gatewayUsed: true,
      metadata: expect.objectContaining({
        catalogCoverageStatus: 'god_mode',
        bypassedControls: expect.arrayContaining(['budget', 'rate_limit'])
      })
    }))
  })

  it('fails closed instead of calling a provider directly when AI_GATEWAY_URL is unavailable', async () => {
    mockResolveModelWithTransport.mockReturnValue({ model: textModel, gatewayUsed: false })

    await expect(runToolLoop({
      ctx: { userId: USER_ID, userRole: 'owner', event: {} as any },
      system: 'system',
      messages: [{ role: 'user', content: 'hello' }],
      seed: 'owner',
      modelSpec: 'groq/openai/gpt-oss-120b',
      fallbackSpec: '',
      authority: godModeAuthority
    } as any)).rejects.toThrow('AI Gateway')
  })

  it('fails closed when gateway/provider credentials cannot resolve a model', async () => {
    mockResolveModelWithTransport.mockImplementation(() => {
      throw new Error('provider credentials unavailable')
    })

    await expect(runToolLoop({
      ctx: { userId: USER_ID, userRole: 'owner', event: {} as any },
      system: 'system',
      messages: [{ role: 'user', content: 'hello' }],
      seed: 'owner',
      modelSpec: 'groq/openai/gpt-oss-120b',
      fallbackSpec: '',
      authority: godModeAuthority
    } as any)).rejects.toThrow('provider credentials unavailable')
  })
})

describe('God-mode explainability', () => {
  const context: PersonalAssistantContext = {
    identity: { userId: USER_ID, role: 'owner' },
    godModeAuthority,
    permissionGroups: [],
    isReadOnly: true,
    runtimePolicy: {
      mode: 'enforced',
      authenticatedCoreTools: ['search_knowledge', 'get_tasks']
    },
    observedMemoryEnabled: false,
    departments: [],
    clientScope: { mode: 'all_active', assignments: [] },
    preferences: { personaKey: 'creative', disabledTools: ['owner_read'], memoryEnabled: true },
    activePacks: [{
      releaseId: '20000000-0000-4000-8000-000000000001',
      departmentId: DEPARTMENT_ID,
      packVersionId: PACK_VERSION_ID,
      packKey: 'owner_operations',
      version: 1,
      label: 'Owner operations',
      releaseState: 'draft',
      accessBasis: 'god_mode'
    }],
    catalogInstructionsPreamble: 'private',
    catalogRows: [catalogRow({ releaseState: 'draft' })]
  } as PersonalAssistantContext

  it('reports stable God-mode authority, full registry coverage, and hard-boundary language', () => {
    const view = buildMyAssistantExplainability(context, registeredTools.map(tool => ({
      ...tool,
      description: `${tool.name} description`,
      requiredPermission: 'FINANCE'
    })))

    expect(view.authority).toMatchObject({
      accessBasis: 'god_mode',
      label: 'God mode active',
      toolCoverage: { available: 2, registered: 2, complete: true }
    })
    expect(view.authority.description).toContain('identity')
    expect(view.authority.description).toContain('tenant isolation')
    expect(view.authority.description).toContain('audit')
    expect(view.tools.map(tool => tool.name)).toEqual(['owner_read', 'owner_write'])
    expect(view.restrictions).toEqual([])
  })

  it('returns the existing company-owner basis when emergency disablement is active', () => {
    const view = buildMyAssistantExplainability({
      ...context,
      godModeAuthority: emergencyDisabledAuthority,
      activePacks: context.activePacks.map(pack => ({
        ...pack,
        releaseState: 'active',
        accessBasis: 'company_owner'
      }))
    }, registeredTools.map(tool => ({ ...tool, description: `${tool.name} description` })))

    expect(view.authority.accessBasis).toBe('company_owner')
    expect(view.authority.label).not.toBe('God mode active')
  })
})
