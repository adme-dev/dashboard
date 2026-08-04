import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { MockLanguageModelV3 } from 'ai/test'
import { extractLoopOutput, runToolLoop, estimateCostUsd } from '~~/server/utils/ai/toolLoop'
import * as economics from '~~/server/utils/ai/tools/economics'
import type { ActiveCatalogRow } from '~~/server/utils/ai/governance/catalogComposition'

const mockRecordAiInvocation = vi.fn()
const mockResolveModelWithTransport = vi.fn()

vi.mock('~~/server/utils/claudeClient', async (importOriginal) => ({
  ...await importOriginal<typeof import('~~/server/utils/claudeClient')>(),
  resolveModelWithTransport: (...args: unknown[]) => mockResolveModelWithTransport(...args),
}))

vi.mock('~~/server/utils/ai/modelAssignments', async (importOriginal) => {
  const original = await importOriginal<typeof import('~~/server/utils/ai/modelAssignments')>()
  return {
    ...original,
    resolveAiModelAssignment: vi.fn().mockResolvedValue(null),
  }
})

// Stub fetchClientEconomics so the get_client_profitability handler never touches the DB.
// Imported back via `economics` so tests can assert the REAL registered handler ran (the loop's
// registry → toSdkTools → execute path actually called it), not just that the mock emitted a call.
vi.mock('~~/server/utils/ai/tools/economics', async (importOriginal) => {
  const original = await importOriginal<typeof import('~~/server/utils/ai/tools/economics')>()
  return {
    ...original,
    fetchClientEconomics: vi.fn().mockResolvedValue([
      { clientId: 'a', name: 'Acme', revenueCents: 10000_00, passthroughCents: 2000_00, laborCents: 3000_00, hours: 100 },
    ]),
  }
})

vi.mock('~~/server/utils/ai/invocationLedger', () => ({
  recordAiInvocation: (...args: unknown[]) => mockRecordAiInvocation(...args),
}))

// toolLoop calls useRuntimeConfig() (Nuxt auto-import). Stub it for unit tests; model specs
// aren't read when a model is injected, so an empty config is enough.
beforeAll(() => vi.stubGlobal('useRuntimeConfig', () => ({})))
afterAll(() => vi.unstubAllGlobals())

const ctx = { userId: 'u1', userRole: 'owner', conversationId: 'c1', event: {} as any }
const textModel = (text: string) => new MockLanguageModelV3({
  doGenerate: async () => ({
    content: [{ type: 'text', text }],
    finishReason: 'stop',
    usage: { inputTokens: 10, outputTokens: 8, totalTokens: 18 },
    warnings: [],
  }),
})

describe('extractLoopOutput (pure)', () => {
  it('handles an empty result', () => {
    expect(extractLoopOutput({})).toEqual({ text: '', toolCalls: [], proposedAction: null, usage: undefined })
  })

  it('collects the read-tool trace across steps, no proposal', () => {
    const result = {
      text: 'Runway is 86 days.',
      steps: [
        { toolCalls: [{ toolName: 'get_finance_snapshot', input: {} }], toolResults: [{ toolName: 'get_finance_snapshot', output: { ok: true, data: {} } }] },
      ],
    }
    const out = extractLoopOutput(result)
    expect(out.text).toBe('Runway is 86 days.')
    expect(out.toolCalls).toEqual([{ name: 'get_finance_snapshot', args: {} }])
    expect(out.proposedAction).toBeNull()
  })

  it('extracts a create_task proposal from the tool RESULT (Option B)', () => {
    const result = {
      text: 'I prepared a task for your confirmation.',
      steps: [
        { toolCalls: [{ toolName: 'create_task', input: { title: 'X' } }],
          toolResults: [{ toolName: 'create_task', output: { ok: true, data: { proposalId: 'p1', resolved: { title: 'X' } } } }] },
      ],
    }
    const out = extractLoopOutput(result)
    expect(out.proposedAction).toEqual({ proposalId: 'p1', resolved: { title: 'X' }, toolName: 'create_task' })
    expect(out.toolCalls).toEqual([{ name: 'create_task', args: { title: 'X' } }])
  })

  it('surfaces a proposal for ANY propose tool, carrying its toolName (e.g. propose_budget_change)', () => {
    const result = {
      text: 'Prepared a budget change.',
      steps: [
        { toolResults: [{ toolName: 'propose_budget_change', output: { ok: true, data: { proposalId: 'b9', resolved: { campaignName: 'Acme', newDailyBudget: 40 } } } }] },
      ],
    }
    expect(extractLoopOutput(result).proposedAction).toEqual({
      proposalId: 'b9', resolved: { campaignName: 'Acme', newDailyBudget: 40 }, toolName: 'propose_budget_change',
    })
  })

  it('does NOT surface a proposal when the propose tool failed (ok:false)', () => {
    const result = { text: 'x', steps: [{ toolResults: [{ toolName: 'create_task', output: { ok: false, error: 'nope' } }] }] }
    expect(extractLoopOutput(result).proposedAction).toBeNull()
  })
})

describe('estimateCostUsd', () => {
  it('prices a known model from token usage', () => {
    // gpt-oss-120b: $0.15/Mtok in + $0.60/Mtok out
    expect(estimateCostUsd({ inputTokens: 1_000_000, outputTokens: 1_000_000 }, 'groq/openai/gpt-oss-120b')).toBeCloseTo(0.75, 6)
  })
  it('returns 0 for an unknown model or missing usage', () => {
    expect(estimateCostUsd({ inputTokens: 1000, outputTokens: 1000 }, 'groq/unknown-model')).toBe(0)
    expect(estimateCostUsd(undefined, 'groq/openai/gpt-oss-120b')).toBe(0)
  })
})

describe('runToolLoop (injected mock model)', () => {
  beforeEach(() => {
    mockRecordAiInvocation.mockReset()
    mockRecordAiInvocation.mockResolvedValue(undefined)
    mockResolveModelWithTransport.mockReset()
  })

  it('returns the model text with no tool calls when the model just answers', async () => {
    const out = await runToolLoop({
      ctx: ctx as any, system: 'sys', messages: [{ role: 'user', content: "what's our runway?" }],
      seed: 'c1', model: textModel('Your cash runway is 86 days.'),
    })
    expect(out.text).toContain('86 days')
    expect(out.toolCalls).toEqual([])
    expect(out.proposedAction).toBeNull()
    expect(mockRecordAiInvocation).toHaveBeenCalledWith(expect.objectContaining({
      featureKey: 'agency_ai_tool_loop',
      modelId: 'injected',
      userId: 'u1',
      status: 'success',
    }))
  })

  it('records direct provider calls as not using the Gateway', async () => {
    mockResolveModelWithTransport.mockReturnValue({ model: textModel('Direct provider response.'), gatewayUsed: false })

    await runToolLoop({
      ctx: ctx as any, system: 'sys', messages: [{ role: 'user', content: 'hi' }],
      seed: 'c1', modelSpec: 'groq/openai/gpt-oss-120b',
    })

    expect(mockRecordAiInvocation).toHaveBeenCalledWith(expect.objectContaining({
      gatewayUsed: false,
      provider: 'groq',
    }))
  })

  it('records Gateway-configured provider calls as using the Gateway', async () => {
    mockResolveModelWithTransport.mockReturnValue({ model: textModel('Gateway provider response.'), gatewayUsed: true })

    await runToolLoop({
      ctx: ctx as any, system: 'sys', messages: [{ role: 'user', content: 'hi' }],
      seed: 'c1', modelSpec: 'groq/openai/gpt-oss-120b',
    })

    expect(mockRecordAiInvocation).toHaveBeenCalledWith(expect.objectContaining({
      gatewayUsed: true,
      provider: 'groq',
    }))
  })

  it('passes the shared non-unique entity guard to the agency tool model', async () => {
    let system = ''
    const model = new MockLanguageModelV3({
      doGenerate: async (options: any) => {
        system = options.prompt.find((message: { role: string }) => message.role === 'system')?.content ?? ''
        return {
          content: [{ type: 'text', text: 'Please choose one.' }],
          finishReason: 'stop',
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
          warnings: []
        }
      }
    })

    await runToolLoop({
      ctx: ctx as any,
      system: 'sys',
      messages: [{ role: 'user', content: 'Which record do you mean?' }],
      seed: 'c1',
      model
    })

    expect(system).toContain('When supplied or retrieved data contains multiple plausible matching entities')
    expect(system).toContain('Do not guess, act, prepare a proposal, or claim an effect')
  })

  it('falls back to the second model when the primary throws', async () => {
    const badModel = new MockLanguageModelV3({ doGenerate: async () => { throw new Error('provider down') } })
    const out = await runToolLoop({
      ctx: ctx as any, system: 'sys', messages: [{ role: 'user', content: 'hi' }],
      seed: 'c1', model: badModel, fallbackModel: textModel('Recovered via fallback.'), turnId: 'turn-1', loopId: 'l1',
    })
    expect(out.text).toContain('fallback')
    expect(mockRecordAiInvocation).toHaveBeenCalledTimes(2)
    expect(mockRecordAiInvocation.mock.calls[0]?.[0]).toMatchObject({
      fallbackUsed: false, status: 'error', metadata: expect.objectContaining({ turnId: 'turn-1', attemptId: 'turn-1:l1:primary', terminal: false })
    })
    expect(mockRecordAiInvocation.mock.calls[1]?.[0]).toMatchObject({
      fallbackUsed: true, status: 'success', metadata: expect.objectContaining({ turnId: 'turn-1', attemptId: 'turn-1:l1:fallback', terminal: true })
    })
  })

  it('records both terminal provider errors with immutable attempt identities', async () => {
    const bad = new MockLanguageModelV3({ doGenerate: async () => { throw new Error('provider down') } })
    await expect(runToolLoop({ ctx: ctx as any, system: 'sys', messages: [{ role: 'user', content: 'hi' }], seed: 'c1', model: bad, fallbackModel: bad, turnId: 'turn-error', loopId: 'l1' } as any)).rejects.toThrow('provider down')
    expect(mockRecordAiInvocation).toHaveBeenCalledTimes(2)
    expect(mockRecordAiInvocation.mock.calls.map(([row]) => ({ status: row.status, attemptId: row.metadata.attemptId, terminal: row.metadata.terminal }))).toEqual([
      { status: 'error', attemptId: 'turn-error:l1:primary', terminal: false },
      { status: 'error', attemptId: 'turn-error:l1:fallback', terminal: true }
    ])
  })

  it('records only a durable evidence correlation id and does not self-assert live safety', async () => {
    await runToolLoop({
      ctx: ctx as any, system: 'sys', messages: [{ role: 'user', content: 'hi' }], seed: 'c1', model: textModel('Done'),
      turnId: 'turn-untrusted', loopId: 'l1',
      pilotEvidenceId: '10000000-0000-4000-8000-000000000001'
    } as any)
    expect(mockRecordAiInvocation.mock.calls[0]?.[0].metadata).toMatchObject({ pilotEvidenceId: '10000000-0000-4000-8000-000000000001' })
    expect(mockRecordAiInvocation.mock.calls[0]?.[0].metadata.pilotEvidence).toBeUndefined()
    expect(mockRecordAiInvocation.mock.calls[0]?.[0].metadata.liveSafety).toBeUndefined()
  })

  it('intersects the live registry with evaluated active catalog releases', async () => {
    const catalogRow: ActiveCatalogRow = {
      sourceType: 'pack',
      isLatestPackVersion: true,
      releaseState: 'active',
      releaseId: '20000000-0000-4000-8000-000000000001',
      departmentId: '10000000-0000-4000-8000-000000000001',
      packVersionId: '30000000-0000-4000-8000-000000000001',
      packKey: 'finance_operations',
      instructionsPreamble: 'Use the evaluated finance workflow.',
      packModelFeatureKey: 'finance_assistant',
      packMaxInputTokens: 6000,
      packMaxOutputTokens: 900,
      packMaxCostUsdMicros: 50000,
      packMaxLatencyMs: 15000,
      capabilityVersionId: '40000000-0000-4000-8000-000000000001',
      capabilityKey: 'client_profitability',
      requiredPermissionGroup: 'FINANCE',
      capabilityModelFeatureKey: 'finance_assistant',
      capabilityMaxInputTokens: 5000,
      capabilityMaxOutputTokens: 800,
      capabilityMaxCostUsdMicros: 40000,
      capabilityMaxLatencyMs: 12000,
      toolName: 'get_client_profitability',
      accessMode: 'read'
    }

    await runToolLoop({
      ctx: ctx as any,
      system: 'sys',
      messages: [{ role: 'user', content: 'Show profitability.' }],
      seed: 'c1',
      model: textModel('Done.'),
      catalogRows: [catalogRow],
      permissionGroups: ['FINANCE'],
      runtimePolicy: {
        mode: 'pilot',
        authenticatedCoreTools: ['search_knowledge', 'get_tasks']
      }
    })

    expect(mockRecordAiInvocation).toHaveBeenCalledWith(expect.objectContaining({
      metadata: expect.objectContaining({
        catalogMode: 'governed',
        catalogRuntimeMode: 'pilot',
        catalogCoverageStatus: 'governed',
        catalogReleaseIds: [catalogRow.releaseId],
        toolCount: 1
      })
    }))
  })
})

describe('runToolLoop (Slice-2 tool selection)', () => {
  // Positive: model emits a tool-call for get_client_profitability on step 1, then text on step 2.
  // The handler resolves via the mocked fetchClientEconomics (stubbed at module level above).
  it('selects get_client_profitability for a finance question and records it in the trace', async () => {
    vi.mocked(economics.fetchClientEconomics).mockClear()
    let callCount = 0
    const model = new MockLanguageModelV3({
      doGenerate: async () => {
        callCount++
        if (callCount === 1) {
          // Step 1: model asks to call the profitability tool
          return {
            content: [{ type: 'tool-call', toolCallId: 'tc-prof-1', toolName: 'get_client_profitability', input: '{"period":"mtd"}' }],
            finishReason: 'stop',
            usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
            warnings: [],
          }
        }
        // Step 2: model answers after seeing the tool result
        return {
          content: [{ type: 'text', text: 'Acme has a 62.5% delivery margin.' }],
          finishReason: 'stop',
          usage: { inputTokens: 20, outputTokens: 10, totalTokens: 30 },
          warnings: [],
        }
      },
    })

    const out = await runToolLoop({
      ctx: ctx as any,
      system: 'sys',
      messages: [{ role: 'user', content: 'Which client is most profitable this month?' }],
      seed: 'c1',
      model,
    })

    // The tool must appear exactly once in the trace
    expect(out.toolCalls).toHaveLength(1)
    expect(out.toolCalls[0].name).toBe('get_client_profitability')
    expect((out.toolCalls[0].args as any).period).toBe('mtd')
    // The REAL registered profitabilityTool handler must have executed via the loop's
    // registry → toSdkTools → execute path. This is the assertion that fails if the tool is
    // dropped from the registry — out.toolCalls alone would still echo the mock's emitted call.
    expect(vi.mocked(economics.fetchClientEconomics)).toHaveBeenCalledTimes(1)
    // The final answer text must be present
    expect(out.text).toContain('Acme')
    // No proposal was created (this is a read tool)
    expect(out.proposedAction).toBeNull()
  })

  // Negative: model answers with plain text for chit-chat — no tool is ever called.
  it('does not invoke any tool when the model answers chit-chat with plain text', async () => {
    const out = await runToolLoop({
      ctx: ctx as any,
      system: 'sys',
      messages: [{ role: 'user', content: 'What is the weather like today?' }],
      seed: 'c1',
      model: textModel('I am an agency assistant and cannot check the weather.'),
    })

    expect(out.toolCalls).toEqual([])
    expect(out.proposedAction).toBeNull()
    expect(out.text).toContain('agency assistant')
  })
})
