import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { signRenderToken, verifyRenderToken } from '~~/server/utils/audio/renderLinks'

const SECRET = 'test-secret-0123456789'

describe('renderLinks token', () => {
  beforeEach(() => { process.env.RENDER_LINK_SECRET = SECRET; process.env.NODE_ENV = 'test' })
  afterEach(() => { delete process.env.RENDER_LINK_SECRET })

  it('round-trips a valid token', async () => {
    const t = await signRenderToken({ jobId: 'job-1', format: 'reels_9x16' })
    expect(await verifyRenderToken(t)).toEqual({ jobId: 'job-1', format: 'reels_9x16' })
  })

  it('rejects a tampered token', async () => {
    const t = await signRenderToken({ jobId: 'job-1', format: 'reels_9x16' })
    const tampered = t.slice(0, -2) + (t.endsWith('a') ? 'b' : 'a')
    expect(await verifyRenderToken(tampered)).toBeNull()
  })

  it('rejects a token signed with a different secret', async () => {
    const t = await signRenderToken({ jobId: 'job-1', format: 'reels_9x16' })
    process.env.RENDER_LINK_SECRET = 'a-different-secret'
    expect(await verifyRenderToken(t)).toBeNull()
  })

  it('fails closed in production when the secret is unset', async () => {
    delete process.env.RENDER_LINK_SECRET
    process.env.NODE_ENV = 'production'
    await expect(signRenderToken({ jobId: 'j', format: 'square_1x1' })).rejects.toThrow()
    process.env.NODE_ENV = 'test'
  })
})
