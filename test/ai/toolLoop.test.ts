import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { MockLanguageModelV3 } from 'ai/test'
import { extractLoopOutput, runToolLoop, estimateCostUsd } from '~~/server/utils/ai/toolLoop'

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
    expect(out.proposedAction).toEqual({ proposalId: 'p1', resolved: { title: 'X' } })
    expect(out.toolCalls).toEqual([{ name: 'create_task', args: { title: 'X' } }])
  })

  it('does NOT surface a proposal when create_task failed (ok:false)', () => {
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
  it('returns the model text with no tool calls when the model just answers', async () => {
    const out = await runToolLoop({
      ctx: ctx as any, system: 'sys', messages: [{ role: 'user', content: "what's our runway?" }],
      seed: 'c1', model: textModel('Your cash runway is 86 days.'),
    })
    expect(out.text).toContain('86 days')
    expect(out.toolCalls).toEqual([])
    expect(out.proposedAction).toBeNull()
  })

  it('falls back to the second model when the primary throws', async () => {
    const badModel = new MockLanguageModelV3({ doGenerate: async () => { throw new Error('provider down') } })
    const out = await runToolLoop({
      ctx: ctx as any, system: 'sys', messages: [{ role: 'user', content: 'hi' }],
      seed: 'c1', model: badModel, fallbackModel: textModel('Recovered via fallback.'),
    })
    expect(out.text).toContain('fallback')
  })
})
