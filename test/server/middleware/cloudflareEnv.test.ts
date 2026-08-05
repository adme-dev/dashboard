import { beforeEach, describe, expect, it, vi } from 'vitest'

const setCachedCfBindings = vi.fn()

vi.mock('~~/server/utils/cfBindings', async (importOriginal) => {
  const original = await importOriginal<typeof import('~~/server/utils/cfBindings')>()
  return { ...original, setCachedCfBindings }
})

;(globalThis as Record<string, unknown>).defineEventHandler = <T>(handler: T) => handler

describe('Cloudflare request context middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('promotes Nitro platform bindings to the supported event.context.cloudflare contract', async () => {
    const mediaBucket = { marker: 'same-request-bucket' }
    const cloudflare = {
      request: new Request('https://app.xeroflow.test/api/probe'),
      env: { MEDIA_BUCKET: mediaBucket },
      context: { waitUntil: vi.fn() }
    }
    const event = { context: { _platform: { cloudflare } } }
    const handler = (await import('~~/server/middleware/cfEnv')).default

    handler(event as never)

    const promoted = event.context as typeof event.context & { cloudflare: typeof cloudflare }
    expect(promoted.cloudflare).toBe(cloudflare)
    expect(promoted.cloudflare.env.MEDIA_BUCKET).toBe(mediaBucket)
    expect(setCachedCfBindings).toHaveBeenCalledWith(cloudflare.env)
  })
})
