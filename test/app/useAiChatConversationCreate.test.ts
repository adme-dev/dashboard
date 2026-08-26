import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

const apiFetch = vi.fn()
const state = new Map<string, ReturnType<typeof ref>>()

vi.stubGlobal('$fetch', apiFetch)
vi.stubGlobal('ref', ref)
vi.stubGlobal('useState', (key: string, init: () => unknown) => {
  if (!state.has(key)) state.set(key, ref(init()))
  return state.get(key)
})

const { useAiChat } = await import('../../app/composables/useAiChat')

describe('AI conversation creation client', () => {
  beforeEach(() => {
    apiFetch.mockReset().mockResolvedValue({
      id: '33333333-3333-4333-8333-333333333333',
      title: 'Financial Advisor'
    })
    state.clear()
  })

  it('sends a stable idempotency key with a create attempt', async () => {
    await useAiChat().createConversation('Financial Advisor')

    expect(apiFetch).toHaveBeenCalledWith('/api/agency/ai/chat/conversations', {
      method: 'POST',
      body: { title: 'Financial Advisor' },
      headers: {
        'Idempotency-Key': expect.stringMatching(/^ai-conversation-create:[A-Za-z0-9:._-]{8,}$/)
      }
    })
  })
})
