import { beforeEach, describe, expect, it, vi } from 'vitest'
import { generateGroqInsight } from '~~/server/utils/groqClient'

const mocks = vi.hoisted(() => ({ complete: vi.fn(), ledger: vi.fn() }))
vi.mock('groq-sdk', () => ({ default: class { chat = { completions: { create: mocks.complete } } } }))
vi.mock('~~/server/utils/ai/invocationLedger', () => ({ recordAiInvocation: mocks.ledger }))

beforeEach(() => vi.clearAllMocks())
describe('Groq completion outcome telemetry', () => {
  it.each([null, '', '   '])('records missing visible output as an error (%j), retaining charged usage without provider content', async (content) => {
    mocks.complete.mockResolvedValue({ choices: [{ message: { content, reasoning: 'Private reasoning' }, finish_reason: 'length' }],
      usage: { prompt_tokens: 205, completion_tokens: 400, total_tokens: 605 } })
    const result = await generateGroqInsight('Private brief', { featureKey: 'video_caption' })
    expect(result).toBe('Unable to generate insight')
    expect(mocks.ledger).toHaveBeenCalledWith(expect.objectContaining({
      status: 'error', errorCode: 'empty_completion', completionTokens: 400,
      metadata: expect.objectContaining({ finishReason: 'length' })
    }))
    expect(JSON.stringify(mocks.ledger.mock.calls)).not.toContain('Private')
  })

  it('records usable visible output as successful', async () => {
    mocks.complete.mockResolvedValue({ choices: [{ message: { content: 'Approved introduction' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 205, completion_tokens: 500, total_tokens: 705 } })
    expect(await generateGroqInsight('Brief', { featureKey: 'video_caption' })).toBe('Approved introduction')
    expect(mocks.ledger).toHaveBeenCalledWith(expect.objectContaining({ status: 'success', errorCode: null }))
  })
})
