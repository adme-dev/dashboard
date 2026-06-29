import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchWithTimeout } from '../../server/utils/social-providers/http'

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
  vi.restoreAllMocks()
})

describe('fetchWithTimeout', () => {
  it('returns the provider response when fetch resolves in time', async () => {
    const response = new Response('{}', { status: 200 })
    globalThis.fetch = vi.fn(async () => response) as any

    await expect(fetchWithTimeout('https://graph.example.test', { timeoutMs: 50 })).resolves.toBe(response)
  })

  it('aborts provider fetches that exceed the deadline', async () => {
    globalThis.fetch = vi.fn((_input, init) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('aborted by signal')), { once: true })
    })) as any

    await expect(fetchWithTimeout('https://graph.example.test', { timeoutMs: 5 }))
      .rejects.toThrow('social provider fetch timed out after 5ms')
  })
})
