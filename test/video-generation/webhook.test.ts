import { describe, expect, it } from 'vitest'
import { verifyMuapiSignature, muapiSignature } from '~~/server/utils/video-generation/webhookAuth'
import { classifyMuapiWebhook } from '~~/server/utils/video-generation/webhookPayload'

describe('muapi webhook signature', () => {
  it('accepts a correct HMAC-SHA256 signature and rejects a wrong one', async () => {
    const secret = 's3cret'
    const raw = JSON.stringify({ request_id: 'req-1', status: 'completed' })
    const sig = await muapiSignature(raw, secret)
    expect(await verifyMuapiSignature(raw, sig, secret)).toBe(true)
    expect(await verifyMuapiSignature(raw, 'deadbeef', secret)).toBe(false)
    expect(await verifyMuapiSignature(raw, sig, 'wrong-secret')).toBe(false)
  })
})

describe('classifyMuapiWebhook', () => {
  it('succeeded with output url', () => {
    expect(classifyMuapiWebhook({ status: 'completed', outputs: ['https://cdn/o.mp4'], cost: 0.5 }))
      .toEqual({ outcome: 'succeeded', outputUrl: 'https://cdn/o.mp4', actualCostCents: 50, errorMessage: null })
  })
  it('non-terminal status is pending (not failed)', () => {
    expect(classifyMuapiWebhook({ status: 'processing' }).outcome).toBe('pending')
    expect(classifyMuapiWebhook({}).outcome).toBe('pending')
  })
  it('explicit failure is failed', () => {
    const c = classifyMuapiWebhook({ status: 'failed', error: 'nsfw' })
    expect(c.outcome).toBe('failed'); expect(c.errorMessage).toBe('nsfw')
  })
  it('succeeded with no output url is treated as failed', () => {
    const c = classifyMuapiWebhook({ status: 'completed' })
    expect(c.outcome).toBe('failed'); expect(c.errorMessage).toMatch(/no output URL/)
  })
})
