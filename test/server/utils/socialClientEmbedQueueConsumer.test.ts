import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  embedSocialClientKnowledge: vi.fn()
}))

vi.mock('~~/server/utils/aiEntityEmbedder', () => ({
  embedSocialClientKnowledge: mocks.embedSocialClientKnowledge
}))

const { processJob } = await import('../../../server/utils/queueConsumer')

const payload = { clientId: '11111111-1111-4111-8111-111111111111' }
const requestEvent = {
  context: { cloudflare: { env: {} } }
} as NonNullable<Parameters<typeof processJob>[1]>

describe('social client re-embed queue consumer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.embedSocialClientKnowledge.mockResolvedValue(undefined)
  })

  it('re-embeds the social client knowledge vector inside the request-owned context', async () => {
    await expect(processJob({
      type: 'embed.social.client',
      payload,
      enqueuedAt: '2026-08-24T00:00:00.000Z'
    }, requestEvent)).resolves.toBeUndefined()

    expect(mocks.embedSocialClientKnowledge).toHaveBeenCalledWith(requestEvent, payload.clientId)
  })

  it('fails closed without a request-owned context', async () => {
    await expect(processJob({
      type: 'embed.social.client',
      payload,
      enqueuedAt: '2026-08-24T00:00:00.000Z'
    })).rejects.toThrow('Social client re-embed requires a request-owned Cloudflare context')
    expect(mocks.embedSocialClientKnowledge).not.toHaveBeenCalled()
  })
})
