import { beforeEach, describe, expect, it, vi } from 'vitest'

const execute = vi.fn()
vi.mock('~~/server/utils/db', () => ({ execute: (...args: unknown[]) => execute(...args) }))

const { linkAiInvocationTurnMessage, recordAiInvocation } = await import('~~/server/utils/ai/invocationLedger')

describe('AI invocation exact turn linkage', () => {
  beforeEach(() => execute.mockReset().mockResolvedValue(undefined))

  it('links every invocation for one server turn to exactly one assistant message without overwriting another link', async () => {
    await linkAiInvocationTurnMessage('turn-1', 'user-1', 'message-1')

    expect(execute).toHaveBeenCalledOnce()
    expect(execute.mock.calls[0]?.[0]).toContain("metadata ->> 'turnId' = $1")
    expect(execute.mock.calls[0]?.[0]).toContain("NOT (metadata ? 'assistantMessageId')")
    expect(execute.mock.calls[0]?.[1]).toEqual(['turn-1', 'user-1', 'message-1'])
  })

  it('persists genuinely unknown cost as null instead of coercing it to zero', async () => {
    await recordAiInvocation({ featureKey: 'test', provider: 'groq', modelId: 'openai/gpt-oss-120b', estimatedCostUsd: null })

    expect(execute.mock.calls[0]?.[1]?.[12]).toBeNull()
  })

  it('throws when exact assistant-message linkage is not acknowledged', async () => {
    execute.mockResolvedValueOnce(0)
    await expect(linkAiInvocationTurnMessage('turn-1', 'user-1', 'message-1')).rejects.toMatchObject({ name: 'AiInvocationLinkError' })
  })
})
