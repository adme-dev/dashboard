import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { MockLanguageModelV3 } from 'ai/test'
import { runPortalToolLoop, PORTAL_SYSTEM_PREAMBLE } from '~~/server/utils/ai/portalLoop'
import type { PortalToolContext } from '~~/server/utils/ai/portalTools/portalContext'

const mockRecordAiInvocation = vi.fn()

vi.mock('~~/server/utils/ai/invocationLedger', () => ({
  recordAiInvocation: (...args: unknown[]) => mockRecordAiInvocation(...args),
}))

beforeAll(() => vi.stubGlobal('useRuntimeConfig', () => ({})))
afterAll(() => vi.unstubAllGlobals())

const ctx = (over: Partial<PortalToolContext> = {}): PortalToolContext => ({
  clientScope: 'client-aaaa', clientUserId: 'cu-1', event: {} as any, ...over,
})

const textModel = (text: string) => new MockLanguageModelV3({
  doGenerate: async () => ({
    content: [{ type: 'text', text }],
    finishReason: 'stop',
    usage: { inputTokens: 10, outputTokens: 8, totalTokens: 18 },
    warnings: [],
  }),
})

describe('runPortalToolLoop', () => {
  beforeEach(() => {
    mockRecordAiInvocation.mockReset()
    mockRecordAiInvocation.mockResolvedValue(undefined)
  })

  it('refuses to run without a clientScope (tenant isolation)', async () => {
    await expect(runPortalToolLoop({
      ctx: ctx({ clientScope: '' }), messages: [{ role: 'user', content: 'hi' }], seed: 's', model: textModel('x'),
    })).rejects.toThrow(/refusing to run/)
  })

  it('runs with an injected model and returns the text + a cost estimate', async () => {
    const out = await runPortalToolLoop({
      ctx: ctx(), messages: [{ role: 'user', content: 'how are my projects?' }], seed: 's', model: textModel('All on track.'),
    })
    expect(out.text).toBe('All on track.')
    expect(typeof out.costUsd).toBe('number')
    expect(mockRecordAiInvocation).toHaveBeenCalledWith(expect.objectContaining({
      featureKey: 'portal_ai_tool_loop',
      modelId: 'injected',
      userId: 'cu-1',
      clientId: 'client-aaaa',
    }))
  })

  it('passes the shared non-unique entity guard to the portal model', async () => {
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

    await runPortalToolLoop({
      ctx: ctx(),
      messages: [{ role: 'user', content: 'Which record do you mean?' }],
      seed: 's',
      model
    })

    expect(system).toContain('When supplied or retrieved data contains multiple plausible matching entities')
    expect(system).toContain('Do not guess, act, prepare a proposal, or claim an effect')
  })

  it('only exposes the portal registry tools to the model (no agency tools)', async () => {
    let seenTools: string[] = []
    const spyModel = new MockLanguageModelV3({
      doGenerate: async (opts: any) => {
        seenTools = (opts.tools ?? []).map((t: any) => t.name)
        return { content: [{ type: 'text', text: 'ok' }], finishReason: 'stop', usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }, warnings: [] }
      },
    })
    await runPortalToolLoop({ ctx: ctx(), messages: [{ role: 'user', content: 'hi' }], seed: 's', model: spyModel })
    expect(seenTools.sort()).toEqual([
      'get_my_approvals', 'get_my_briefs', 'get_my_invoices', 'get_my_leads', 'get_my_social_report', 'get_project_status_portal',
    ])
    // No agency tool ever reaches the portal model.
    for (const banned of ['get_finance_snapshot', 'create_task', 'propose_budget_change']) {
      expect(seenTools).not.toContain(banned)
    }
  })

  it('falls back to a second model when the primary throws', async () => {
    const boom = new MockLanguageModelV3({ doGenerate: async () => { throw new Error('primary down') } })
    const out = await runPortalToolLoop({
      ctx: ctx(), messages: [{ role: 'user', content: 'hi' }], seed: 's', model: boom, fallbackModel: textModel('from fallback'),
    })
    expect(out.text).toBe('from fallback')
    expect(mockRecordAiInvocation).toHaveBeenCalledWith(expect.objectContaining({
      featureKey: 'portal_ai_tool_loop',
      fallbackUsed: true,
    }))
  })

  it('the system preamble scopes the assistant to the client', () => {
    expect(PORTAL_SYSTEM_PREAMBLE).toContain('Portal Assistant')
    expect(PORTAL_SYSTEM_PREAMBLE).toMatch(/only see this client'?s own data|ONLY see this client/i)
  })
})
