import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { MockLanguageModelV3 } from 'ai/test'
import { z } from 'zod'

import {
  resolveGodModeAuthority,
  type GodModeAuthority
} from '~~/server/utils/godMode/authority'
import {
  getGodModeRouteAuditState,
  seedGodModeRouteAuditState
} from '~~/server/utils/godMode/featureGate'
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

async function issueActiveAuthority(actorUserId: string): Promise<GodModeAuthority> {
  return await resolveGodModeAuthority({ context: {} } as any, actorUserId, {
    queryOneFresh: async () => ({ id: actorUserId }),
    processEnv: {}
  })
}

const godModeAuthority = await issueActiveAuthority(USER_ID)
const otherActorAuthority = await issueActiveAuthority(OTHER_USER_ID)
const emergencyDisabledAuthority = await resolveGodModeAuthority(
  { context: {} } as any,
  USER_ID,
  { queryOneFresh: async () => ({ id: USER_ID }), processEnv: { GOD_MODE_DISABLED: 'true' } }
)

async function auditedGodModeEvent(
  appendGodModeAuditEvent = vi.fn().mockResolvedValue(undefined)
) {
  const path = '/api/agency/ai/chat/conversations/90000000-0000-4000-8000-000000000001/messages'
  const event = {
    method: 'POST',
    context: { user: { id: USER_ID } },
    node: {
      req: { originalUrl: path, headers: { host: 'app.xeroflow.test' }, connection: {} },
      res: { statusCode: 200, statusMessage: 'OK' }
    }
  } as any
  const authority = await resolveGodModeAuthority(event, USER_ID, {
    queryOneFresh: async () => ({ id: USER_ID }),
    processEnv: {}
  })
  seedGodModeRouteAuditState(event, {
    actorUserId: USER_ID,
    correlationId: '70000000-0000-4000-8000-000000000001',
    sessionDigest: 'a'.repeat(64),
    routeOrTool: `POST ${path}`,
    emergencyDisabled: false
  }, {
    appendGodModeAuditEvent
  })
  return { event, authority, appendGodModeAuditEvent }
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
      authority: otherActorAuthority
    } as any)

    expect(result.tools).toEqual([])
    expect(result.coverageStatus).toBe('governed')
  })

  it('does not accept an actor-matching structural authority forgery', () => {
    const result = composeGodMode({
      authority: { ...godModeAuthority }
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

  it('selects the newest registered pack version rather than a newer unpublished version', async () => {
    const unpublishedV2 = '30000000-0000-4000-8000-000000000002'
    const queryRows = vi.fn(async (sql: string, params?: unknown[]) => {
      if (sql.includes('ranked_pack_versions')) {
        return sql.includes('JOIN ai_pack_releases registered_release')
          ? [{ pack_id: PACK_ID, pack_version_id: PACK_VERSION_ID, version: 1 }]
          : [{ pack_id: PACK_ID, pack_version_id: unpublishedV2, version: 2 }]
      }
      const selectedVersionId = (params?.[1] as string[])[0]
      return [{
        source_type: 'pack',
        release_state: 'active',
        release_id: '20000000-0000-4000-8000-000000000001',
        department_id: DEPARTMENT_ID,
        pack_version_id: selectedVersionId,
        pack_version: selectedVersionId === PACK_VERSION_ID ? 1 : 2,
        pack_label: selectedVersionId === PACK_VERSION_ID ? 'Registered v1' : 'Unpublished v2',
        pack_key: 'owner_operations',
        instructions_preamble: 'registered',
        pack_model_feature_key: null,
        pack_max_input_tokens: null,
        pack_max_output_tokens: null,
        pack_max_cost_usd_micros: null,
        pack_max_latency_ms: null,
        capability_version_id: null,
        capability_key: null,
        required_permission_group: null,
        capability_model_feature_key: null,
        capability_max_input_tokens: null,
        capability_max_output_tokens: null,
        capability_max_cost_usd_micros: null,
        capability_max_latency_ms: null,
        tool_name: null,
        access_mode: null
      }]
    })

    const rows = await loadCatalogControlRows(
      [DEPARTMENT_ID],
      USER_ID,
      { queryRows } as CatalogCompositionDb,
      godModeAuthority
    )

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ packVersionId: PACK_VERSION_ID, isLatestPackVersion: true })
  })

  it('batches more than 100 server-derived departments and deterministically merges the catalog', async () => {
    const departmentIds = Array.from({ length: 205 }, (_, index) =>
      `10000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`)
    const queryRows = vi.fn(async (sql: string, params?: unknown[]) => {
      if (sql.includes('ranked_pack_versions')) return []
      const chunk = params?.[0] as string[]
      return chunk.map(departmentId => ({
        source_type: 'capability',
        release_state: 'draft',
        release_id: `20000000-0000-4000-8000-${departmentId.slice(-12)}`,
        department_id: departmentId,
        pack_version_id: null,
        pack_version: null,
        pack_label: null,
        pack_key: null,
        instructions_preamble: '',
        pack_model_feature_key: null,
        pack_max_input_tokens: null,
        pack_max_output_tokens: null,
        pack_max_cost_usd_micros: null,
        pack_max_latency_ms: null,
        capability_version_id: `40000000-0000-4000-8000-${departmentId.slice(-12)}`,
        capability_key: 'registered',
        required_permission_group: 'AUTHENTICATED',
        capability_model_feature_key: null,
        capability_max_input_tokens: null,
        capability_max_output_tokens: null,
        capability_max_cost_usd_micros: null,
        capability_max_latency_ms: null,
        tool_name: 'search_knowledge',
        access_mode: 'read'
      }))
    })

    const rows = await loadCatalogControlRows(
      [...departmentIds].reverse(),
      USER_ID,
      { queryRows } as CatalogCompositionDb,
      godModeAuthority
    )

    const queriedChunks = queryRows.mock.calls
      .filter(([sql]) => sql.includes('ranked_pack_versions'))
      .map(([, params]) => (params?.[0] as string[]).length)
    expect(queriedChunks).toEqual([100, 100, 5])
    expect(rows).toHaveLength(205)
    expect(rows.map(row => row.departmentId)).toEqual([...departmentIds].sort())
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

  it('admits reads but routes owner writes directly through the audited coordinator', async () => {
    const executeGodModeTool = vi.fn().mockResolvedValue(ok({ resultRef: 'task-1', directExecution: true }))
    const executeGodModeReadTool = vi.fn(async ({ args, tool }: any) => tool.handler(args, {
      userId: USER_ID, userRole: 'viewer', event: {} as any
    }))
    const admitted = filterToolsForUser(tools, 'viewer', [], true, godModeAuthority, USER_ID)
    const sdkTools = toSdkTools(admitted, {
      userId: USER_ID,
      userRole: 'viewer',
      permissionGroups: [],
      assistantReadOnly: true,
      event: {} as any
    }, 'seed', godModeAuthority, {
      executionIdentity: 'message-7',
      claimGodModeToolCall: vi.fn().mockResolvedValue({
        claimId: '77777777-7777-4777-8777-777777777777',
        messageId: 'message-7',
        ordinal: 1,
        toolName: 'denied_write',
        argsDigest: 'a'.repeat(64)
      }),
      executeGodModeTool,
      executeGodModeReadTool
    })

    await expect((sdkTools.denied_read as any).execute({}, { toolCallId: 'read-1' })).resolves.toEqual({
      ok: true,
      data: { admitted: true }
    })
    await expect((sdkTools.denied_write as any).execute({}, { toolCallId: 'write-1' })).resolves.toEqual({
      ok: true,
      data: { resultRef: 'task-1', directExecution: true }
    })
    expect(executed).toEqual(['denied_read'])
    expect(executeGodModeTool).toHaveBeenCalledWith(expect.objectContaining({
      event: expect.anything(),
      toolName: 'denied_write',
      idempotencyKey: expect.stringMatching(/^tool-claim:/),
      args: {}
    }))
  })

  it('derives write identity from a persisted DB tool-call claim, never the provider toolCallId', async () => {
    const requests: any[] = []
    const claimGodModeToolCall = vi.fn().mockResolvedValue({
      claimId: '77777777-7777-4777-8777-777777777777',
      messageId: 'message-7',
      ordinal: 0,
      toolName: 'denied_write',
      argsDigest: 'a'.repeat(64)
    })
    const makeTools = () => toSdkTools(filterToolsForUser(tools, 'viewer', [], true, godModeAuthority, USER_ID), {
      userId: USER_ID,
      userRole: 'viewer',
      permissionGroups: [],
      assistantReadOnly: true,
      event: {} as any
    }, 'seed', godModeAuthority, {
      executionIdentity: 'message-7',
      claimGodModeToolCall,
      executeGodModeTool: vi.fn(async request => {
        requests.push(request)
        return ok({ resultRef: 'task-1' })
      }),
      executeGodModeReadTool: vi.fn()
    } as any)

    await (makeTools().denied_write as any).execute({}, { toolCallId: 'provider-call-a' })
    await (makeTools().denied_write as any).execute({}, { toolCallId: 'provider-call-b' })

    expect(claimGodModeToolCall).toHaveBeenCalledTimes(2)
    expect(claimGodModeToolCall).toHaveBeenNthCalledWith(1, expect.objectContaining({
      messageId: 'message-7', ordinal: 0, toolName: 'denied_write', args: {}
    }))
    expect(requests[0].idempotencyKey).toBe(requests[1].idempotencyKey)
    expect(requests[0].idempotencyKey).toMatch(/^tool-claim:/)
    expect(JSON.stringify(requests)).not.toContain('provider-call-')
  })

  it('does not allow owner role strings, mismatched authority, or emergency-disabled authority to bypass', async () => {
    expect(filterToolsForUser(tools, 'owner', [], true)).toEqual([])
    expect(filterToolsForUser(tools, 'viewer', [], true, otherActorAuthority, USER_ID)).toEqual([])
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

  it('durably persists exact server-classified bypasses before provider resolution', async () => {
    const order: string[] = []
    let releasePersistence!: () => void
    const persistence = new Promise<void>((resolve) => {
      releasePersistence = resolve
    })
    const appendGodModeAuditEvent = vi.fn(async () => {
      order.push('persistence-started')
      await persistence
      order.push('persistence-resolved')
    })
    mockResolveModelWithTransport.mockImplementation(() => {
      order.push('provider-resolved')
      return { model: textModel, gatewayUsed: true }
    })
    const { event, authority } = await auditedGodModeEvent(appendGodModeAuditEvent)

    const result = runToolLoop({
      ctx: { userId: USER_ID, userRole: 'owner', event },
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
      authority
    } as any)

    await vi.waitFor(() => expect(appendGodModeAuditEvent).toHaveBeenCalledTimes(1))
    expect(mockResolveModelWithTransport).not.toHaveBeenCalled()
    expect(appendGodModeAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      actorUserId: USER_ID,
      correlationId: '70000000-0000-4000-8000-000000000001',
      sessionDigest: 'a'.repeat(64),
      phase: 'bypass',
      outcomeCode: 'pre_execution',
      bypassedControls: [
        'budget',
        'evaluation_policy',
        'feature_flag',
        'permission',
        'personal_policy',
        'rate_limit',
        'release_policy'
      ]
    }))

    releasePersistence()
    await result

    expect(order).toEqual(['persistence-started', 'persistence-resolved', 'provider-resolved'])
  })

  it('prevents provider resolution when durable pre-execution persistence fails', async () => {
    const appendGodModeAuditEvent = vi.fn().mockRejectedValue(new Error('database unavailable'))
    mockResolveModelWithTransport.mockReturnValue({ model: textModel, gatewayUsed: true })
    const { event, authority } = await auditedGodModeEvent(appendGodModeAuditEvent)

    await expect(runToolLoop({
      ctx: { userId: USER_ID, userRole: 'owner', event },
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
      authority
    } as any)).rejects.toMatchObject({
      statusCode: 503,
      statusMessage: 'God mode audit unavailable'
    })

    expect(mockResolveModelWithTransport).not.toHaveBeenCalled()
  })

  it('uses Cloudflare AI Gateway while ignoring application token/cost/latency/usage/rate ceilings', async () => {
    mockResolveModelWithTransport.mockReturnValue({ model: textModel, gatewayUsed: true })
    const { event, authority } = await auditedGodModeEvent()

    await runToolLoop({
      ctx: { userId: USER_ID, userRole: 'owner', event },
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
      authority
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
    expect([...getGodModeRouteAuditState(event)!.bypassedControls]).toEqual(expect.arrayContaining([
      'permission',
      'feature_flag',
      'release_policy',
      'evaluation_policy',
      'personal_policy',
      'budget',
      'rate_limit'
    ]))
  })

  it('fails before provider resolution when immutable route audit state is absent', async () => {
    const event = {
      method: 'POST',
      context: { user: { id: USER_ID } },
      node: {
        req: {
          originalUrl: '/api/agency/ai/chat/conversations/90000000-0000-4000-8000-000000000001/messages',
          headers: { host: 'app.xeroflow.test' },
          connection: {}
        },
        res: { statusCode: 200, statusMessage: 'OK' }
      }
    } as any
    const authority = await resolveGodModeAuthority(event, USER_ID, {
      queryOneFresh: async () => ({ id: USER_ID }),
      processEnv: {}
    })
    mockResolveModelWithTransport.mockReturnValue({ model: textModel, gatewayUsed: true })

    await expect(runToolLoop({
      ctx: { userId: USER_ID, userRole: 'owner', event },
      system: 'system',
      messages: [{ role: 'user', content: 'hello' }],
      seed: 'owner',
      modelSpec: 'groq/openai/gpt-oss-120b',
      fallbackSpec: '',
      authority
    } as any)).rejects.toMatchObject({ statusCode: 503 })
    expect(mockResolveModelWithTransport).not.toHaveBeenCalled()
  })

  it('fails closed instead of calling a provider directly when AI_GATEWAY_URL is unavailable', async () => {
    mockResolveModelWithTransport.mockReturnValue({ model: textModel, gatewayUsed: false })
    const { event, authority } = await auditedGodModeEvent()

    await expect(runToolLoop({
      ctx: { userId: USER_ID, userRole: 'owner', event },
      system: 'system',
      messages: [{ role: 'user', content: 'hello' }],
      seed: 'owner',
      modelSpec: 'groq/openai/gpt-oss-120b',
      fallbackSpec: '',
      authority
    } as any)).rejects.toThrow('AI Gateway')
  })

  it('fails closed when gateway/provider credentials cannot resolve a model', async () => {
    mockResolveModelWithTransport.mockImplementation(() => {
      throw new Error('provider credentials unavailable')
    })

    const { event, authority } = await auditedGodModeEvent()
    await expect(runToolLoop({
      ctx: { userId: USER_ID, userRole: 'owner', event },
      system: 'system',
      messages: [{ role: 'user', content: 'hello' }],
      seed: 'owner',
      modelSpec: 'groq/openai/gpt-oss-120b',
      fallbackSpec: '',
      authority
    } as any)).rejects.toThrow('provider credentials unavailable')
  })

  it('rejects an injected primary model before active God-mode execution', async () => {
    await expect(runToolLoop({
      ctx: { userId: USER_ID, userRole: 'owner', event: {} as any },
      system: 'system',
      messages: [{ role: 'user', content: 'hello' }],
      seed: 'owner',
      model: textModel,
      authority: godModeAuthority
    } as any)).rejects.toThrow(/inject/i)
  })

  it('rejects an injected fallback model before active God-mode execution', async () => {
    mockResolveModelWithTransport.mockReturnValue({ model: textModel, gatewayUsed: true })

    await expect(runToolLoop({
      ctx: { userId: USER_ID, userRole: 'owner', event: {} as any },
      system: 'system',
      messages: [{ role: 'user', content: 'hello' }],
      seed: 'owner',
      modelSpec: 'groq/openai/gpt-oss-120b',
      fallbackModel: textModel,
      authority: godModeAuthority
    } as any)).rejects.toThrow(/inject/i)
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
