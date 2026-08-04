import { describe, expect, it, vi } from 'vitest'

describe('AI chat client transport retry contract', () => {
  it('creates one UUID for a logical submission, reuses it for retry, and changes it for a new action', async () => {
    const loaded = await vi.importActual<any>('../../app/utils/aiChatTransport').catch(() => null)
    expect(loaded).not.toBeNull()
    if (!loaded) return

    const first = loaded.createAiChatSubmissionBody({ content: 'Create task' })
    const retry = loaded.retryAiChatSubmissionBody(first)
    const next = loaded.createAiChatSubmissionBody({ content: 'Create task' })

    expect(first.transportRetryToken).toMatch(/^[0-9a-f-]{36}$/i)
    expect(retry.transportRetryToken).toBe(first.transportRetryToken)
    expect(next.transportRetryToken).not.toBe(first.transportRetryToken)
    expect(retry.content).toBe('Create task')
  })

  it('retries a transport loss once with the exact same logical submission body', async () => {
    const loaded = await vi.importActual<any>('../../app/utils/aiChatTransport')
    expect(loaded.postAiChatSubmission).toBeTypeOf('function')
    if (typeof loaded.postAiChatSubmission !== 'function') return
    const bodies: any[] = []
    const fetcher = vi.fn(async (_url, options) => {
      bodies.push(options.body)
      if (bodies.length === 1) throw new TypeError('network connection lost')
      return { ok: true }
    })
    const body = loaded.createAiChatSubmissionBody({ content: 'Create task' })
    await expect(loaded.postAiChatSubmission(fetcher, '/messages', body)).resolves.toEqual({ ok: true })
    expect(bodies).toHaveLength(2)
    expect(bodies[1]).toBe(body)
    expect(bodies[1].transportRetryToken).toBe(bodies[0].transportRetryToken)
  })
})
